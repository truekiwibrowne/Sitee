import { useEffect, useState, type ReactNode } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import {
  paths,
  reviewSchema,
  submissionSchema,
  taskSchema,
  taskTemplateSchema,
  xpEventSchema,
  zoneSchema,
  type AnswerValue,
  type Photo,
  type TemplateField,
} from '@site-streak/shared';
import { db, storage } from '../lib/firebase';
import { useDocData, useQueryData } from '../data/useFirestore';
import { getPhoto } from '../report/photoStore';

// Past reports: what you sent, the photos, and what your reviewer thought.

export const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** My reports, newest first. */
export function HistoryList({ orgId, uid, onOpen }: { orgId: string; uid: string; onOpen: (submissionId: string) => void }) {
  const q = query(
    collection(db, paths.submissions(orgId)),
    where('authorId', '==', uid),
    orderBy('capturedAt', 'desc'),
    limit(30),
  );
  const { data: reports, loading } = useQueryData(q, `${orgId}/${uid}/history`, submissionSchema);
  const { data: templates } = useQueryData(collection(db, paths.taskTemplates(orgId)), `${orgId}/templates`, taskTemplateSchema);

  if (loading) return <p className="text-muted">Loading your reports…</p>;
  if (reports.length === 0) return <p className="text-muted">Nothing sent yet. Your reports will show up here.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {reports.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onOpen(r.id)}
            className="press flex min-h-14 w-full items-center justify-between gap-3 rounded-card border-2 border-card-line bg-white px-4 py-3 text-left shadow-chunky-locked"
          >
            <span>
              <span className="block font-black">{templates.find((t) => t.id === r.templateId)?.name ?? 'Task done'}</span>
              <span className="block text-sm text-muted">{when(r.capturedAt.toMillis())}</span>
            </span>
            <span aria-hidden="true" className="text-xl text-muted">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Answer({ field, value, photos }: { field: TemplateField; value: AnswerValue | undefined; photos: Photo[] }) {
  if (field.type === 'photo') {
    const ids = Array.isArray(value) ? value : [];
    if (ids.length === 0) return <p className="text-muted">No photos</p>;
    return (
      <div className="grid grid-cols-3 gap-2">
        {ids.map((id) => (
          <PhotoThumb key={id} photo={photos.find((p) => p.id === id)} id={id} />
        ))}
      </div>
    );
  }
  if (value === null || value === undefined || value === '') return <p className="text-muted">—</p>;
  return (
    <p className="text-lg font-bold">
      {String(value)}
      {field.type === 'number' && field.unit ? ` ${field.unit}` : ''}
    </p>
  );
}

/** A photo from Storage, or from the phone if it hasn't finished uploading. */
function PhotoThumb({ photo, id }: { photo: Photo | undefined; id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'waiting'>('loading');

  useEffect(() => {
    let alive = true;
    let local: string | null = null;
    (async () => {
      try {
        if (!photo) throw new Error('No photo details');
        const remote = await getDownloadURL(ref(storage, photo.storagePath));
        if (alive) {
          setUrl(remote);
          setState('ok');
        }
      } catch {
        const stored = await getPhoto(id);
        if (!alive) return;
        if (stored && stored.blob.size > 0) {
          local = URL.createObjectURL(stored.blob);
          setUrl(local);
          setState('ok');
        } else {
          setState('waiting');
        }
      }
    })();
    return () => {
      alive = false;
      if (local) URL.revokeObjectURL(local);
    };
  }, [photo, id]);

  return (
    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-btn border-2 border-card-line bg-locked text-center text-xs font-bold text-muted">
      {state === 'ok' && url ? <img src={url} alt="Report photo" className="size-full object-cover" /> : state === 'waiting' ? 'Uploading…' : ''}
    </div>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border-2 border-card-line bg-white p-4">
      <h2 className="text-sm font-black text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** One report, read-only: answers, photos, the review and the XP it earned. */
export function SubmissionView({ orgId, uid, submissionId, onBack }: { orgId: string; uid: string; submissionId: string; onBack: () => void }) {
  const { data: sub, loading } = useDocData(`${paths.submissions(orgId)}/${submissionId}`, submissionSchema);
  const { data: task } = useDocData(sub ? `${paths.tasks(orgId)}/${sub.taskId}` : null, taskSchema);
  const { data: template } = useDocData(sub?.templateId ? `${paths.taskTemplates(orgId)}/${sub.templateId}` : null, taskTemplateSchema);
  const { data: zone } = useDocData(sub ? `${paths.zones(orgId)}/${sub.zoneId}` : null, zoneSchema);
  const reviewQuery = query(
    collection(db, paths.reviews(orgId)),
    where('authorId', '==', uid),
    where('submissionId', '==', submissionId),
  );
  const { data: reviews } = useQueryData(reviewQuery, `${orgId}/${submissionId}/review`, reviewSchema);
  const review = reviews[0];
  const { data: xp } = useDocData(review ? `${paths.xpEvents(orgId)}/${review.id}_author` : null, xpEventSchema);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-4 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-8">
      <button type="button" onClick={onBack} className="min-h-11 self-start font-bold text-muted underline">
        ← Back
      </button>
      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : !sub ? (
        <p className="text-muted">This report hasn’t reached the server yet. Try again when you have signal.</p>
      ) : (
        <>
          <div>
            <h1 className="text-3xl font-black">{template?.name ?? task?.title ?? 'Report'}</h1>
            <p className="font-bold text-muted">
              {[zone?.name, `Sent ${when(sub.capturedAt.toMillis())}`].filter(Boolean).join(' · ')}
            </p>
          </div>

          <Card title="Review">
            {review ? (
              <>
                <p className="text-3xl tracking-wider" aria-label={`${review.stars} of 3 stars`}>
                  <span className="text-yellow [text-shadow:0_2px_0_var(--color-yellow-shadow)]">{'★'.repeat(review.stars)}</span>
                  <span className="text-locked-shadow">{'★'.repeat(3 - review.stars)}</span>
                </p>
                {review.comment && <p className="font-bold">“{review.comment}”</p>}
                {xp && (
                  <p className="text-sm font-bold text-teal-shadow">
                    +{xp.amount} XP
                    {xp.breakdown &&
                      ` (${xp.base} × ${xp.breakdown.stars} stars × ${xp.breakdown.earliness} early × ${xp.breakdown.speed} speed)`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted">Waiting for your site manager to review it.</p>
            )}
          </Card>

          {template ? (
            template.fields.map((f) => (
              <Card key={f.id} title={f.label}>
                <Answer field={f} value={sub.answers[f.id]} photos={sub.photos} />
              </Card>
            ))
          ) : (
            <Card title="Done">
              <p className="font-bold">Marked as done.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
