import { useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  paths,
  submissionSchema,
  taskTemplateSchema,
  userSchema,
  zoneSchema,
  type Stars,
  type Task,
} from '@site-streak/shared';
import { db } from '../lib/firebase';
import { useDocData } from '../data/useFirestore';
import { Answer, Card, when } from '../history/History';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { inputClass } from '../ui/Field';

// Reviewing someone's report, as in docs/mockups/cross-site-review.dc.html: check it,
// rate it 1–3 stars, leave feedback. The stars multiply their XP; you earn review XP.

type Match = 'yes' | 'unsure' | 'no';

const STAR_HELP: Record<Stars, string> = {
  1: 'Needs work: missing or unclear',
  2: 'Good: complete and clear',
  3: 'Excellent: complete, clear, great photos',
};

export function ReviewScreen({ orgId, uid, reviewTask, onBack, onDone }: { orgId: string; uid: string; reviewTask: Task & { id: string }; onBack: () => void; onDone: () => void }) {
  const { data: sub, loading } = useDocData(reviewTask.submissionId ? `${paths.submissions(orgId)}/${reviewTask.submissionId}` : null, submissionSchema);
  const { data: author } = useDocData(sub ? `${paths.users(orgId)}/${sub.authorId}` : null, userSchema);
  const { data: template } = useDocData(sub?.templateId ? `${paths.taskTemplates(orgId)}/${sub.templateId}` : null, taskTemplateSchema);
  const { data: zone } = useDocData(sub?.zoneId ? `${paths.zones(orgId)}/${sub.zoneId}` : null, zoneSchema);

  const [match, setMatch] = useState<Match | null>(null);
  const [stars, setStars] = useState<Stars | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const answered = template ? template.fields.filter((f) => {
    const v = sub?.answers[f.id];
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '';
  }).length : 0;
  const hasPhotos = (sub?.photos.length ?? 0) > 0;

  function submit() {
    if (!sub || !stars) return;
    setSending(true);
    // Not awaited: works with no signal; the review syncs and XP follows.
    setDoc(doc(db, paths.reviews(orgId), reviewTask.id), {
      submissionId: reviewTask.submissionId,
      taskId: sub.taskId,
      reviewerId: uid,
      authorId: sub.authorId,
      stars,
      checks: hasPhotos && match ? { photosMatchWork: match } : {},
      comment: comment.trim(),
      crossSite: false,
      auditedBy: null,
      createdAt: serverTimestamp(),
    }).catch((err) => console.error('Review was rejected', err));
    onDone();
  }

  const option = (value: Match, label: string) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={match === value}
      onClick={() => setMatch(value)}
      className={`press min-h-12 flex-1 rounded-btn border-2 font-black ${
        match === value ? 'border-ink bg-ink text-white shadow-chunky-ink' : 'border-card-line bg-white shadow-chunky-locked'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-4 px-5 pt-[max(16px,env(safe-area-inset-top))]">
      <button type="button" onClick={onBack} className="min-h-11 self-start font-bold text-muted underline">
        ← Back
      </button>
      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : !sub ? (
        <p className="text-muted">This report hasn’t reached the server yet. Try again soon.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {author && <Avatar id={author.avatar} size={56} />}
            <div>
              <h1 className="text-2xl font-black">{template?.name ?? 'Task done'}</h1>
              <p className="font-bold text-muted">
                {[author?.name, zone?.name, when(sub.capturedAt.toMillis())].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>

          {template && (
            <p className={`rounded-full px-3 py-1 text-sm font-black self-start ${answered === template.fields.length ? 'bg-teal text-white' : 'bg-white text-coral-shadow'}`}>
              Completeness · {answered} of {template.fields.length}
            </p>
          )}

          {template ? (
            template.fields.map((f) => (
              <Card key={f.id} title={f.label}>
                <Answer field={f} value={sub.answers[f.id]} photos={sub.photos} />
              </Card>
            ))
          ) : (
            <Card title="Done">
              <p className="font-bold">Marked as done. Check it on site if you need to.</p>
            </Card>
          )}

          <section className="flex flex-col gap-4 rounded-card border-2 border-yellow bg-white p-4">
            {hasPhotos && (
              <div className="flex flex-col gap-2">
                <h2 className="font-black">Do the photos match the work?</h2>
                <div role="radiogroup" className="flex gap-2">
                  {option('yes', 'Yes')}
                  {option('unsure', 'Unsure')}
                  {option('no', 'No')}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <h2 className="font-black">Your rating</h2>
              <div role="radiogroup" aria-label="Stars" className="flex gap-2">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={stars === n}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    onClick={() => setStars(n)}
                    className="press flex size-16 items-center justify-center rounded-btn border-2 border-card-line bg-white text-4xl shadow-chunky-locked"
                  >
                    <span className={stars && n <= stars ? 'text-yellow [text-shadow:0_2px_0_var(--color-yellow-shadow)]' : 'text-locked'}>★</span>
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted">{stars ? STAR_HELP[stars] : 'Stars multiply their XP: 1★ ×0.5, 2★ ×1, 3★ ×1.5'}</p>
            </div>

            <label className="flex flex-col gap-1.5 font-black">
              Feedback for {author?.name.split(' ')[0] ?? 'them'}
              <textarea
                rows={3}
                className={`${inputClass} py-3 font-bold`}
                placeholder="What was good, and what to add next time"
                value={comment}
                maxLength={2000}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
          </section>

          <div className="sticky bottom-0 -mx-5 bg-cream px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
            <Button variant="ink" className="w-full" disabled={!stars || (hasPhotos && !match) || sending} onClick={submit}>
              {sending ? 'Sending…' : `Submit review · +${reviewTask.xp} XP`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
