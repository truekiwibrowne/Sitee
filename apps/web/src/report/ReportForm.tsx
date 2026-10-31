import { useEffect, useRef, useState, type ReactNode } from 'react';
import { doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import {
  answersSchemaFor,
  formatTimeOfDay,
  paths,
  photoPath,
  siteSchema,
  taskTemplateSchema,
  type Answers,
  type AnswerValue,
  type Photo,
  type Task,
  type TaskTemplate,
} from '@site-streak/shared';
import { db } from '../lib/firebase';
import { useDocData } from '../data/useFirestore';
import { takePhoto } from '../device/camera';
import { currentPosition } from '../device/location';
import { Button } from '../ui/Button';
import { Streakee } from '../ui/Streakee';
import { compressPhoto, sha256 } from './compress';
import { NumberField, PhotoField, PickListField, TextField } from './fields';
import { deletePhoto, forgetTaskPhotos, getPhoto, putPhoto, queueTaskPhotos } from './photoStore';
import { photosQueued } from './uploader';

type Props = { orgId: string; uid: string; task: Task & { id: string }; onBack: () => void; onSent: () => void };

const draftKey = (orgId: string, taskId: string) => `draft:${orgId}:${taskId}`;

/**
 * Clears a report's local draft and photo records. Called only once the server has the
 * report (not on submit), so a rejected report can be opened and sent again.
 */
export function forgetSentReport(orgId: string, taskId: string) {
  try {
    localStorage.removeItem(draftKey(orgId, taskId));
  } catch {
    // Ignore.
  }
  void forgetTaskPhotos(taskId);
}

function emptyAnswers(template: TaskTemplate): Answers {
  return Object.fromEntries(template.fields.map((f) => [f.id, f.type === 'photo' ? [] : null]));
}

/** Saved answers for this task, if the person started earlier. Survives reloads and app updates. */
function loadDraft(orgId: string, taskId: string, template: TaskTemplate): Answers {
  const empty = emptyAnswers(template);
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(orgId, taskId)) ?? 'null') as Answers | null;
    // Keep only answers for fields the template still has.
    return saved ? { ...empty, ...Object.fromEntries(Object.entries(saved).filter(([k]) => k in empty)) } : empty;
  } catch {
    return empty;
  }
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function ReportForm(props: Props) {
  const { orgId, task } = props;
  const { data: template, loading } = useDocData(
    task.templateId ? `${paths.taskTemplates(orgId)}/${task.templateId}` : null,
    taskTemplateSchema,
  );
  const { data: site } = useDocData(`${paths.sites(orgId)}/${task.siteId}`, siteSchema);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Streakee />
      </div>
    );
  }
  if (!template) return <MarkDone {...props} />;
  // Keyed so a different task starts with its own draft.
  return <Form key={task.id} {...props} template={template} siteName={site?.name ?? ''} />;
}

function Form({ orgId, uid, task, template, siteName, onBack, onSent }: Props & { template: TaskTemplate; siteName: string }) {
  const online = useOnline();
  const [answers, setAnswers] = useState<Answers>(() => loadDraft(orgId, task.id, template));
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busyField, setBusyField] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  // Save the draft on every change.
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(orgId, task.id), JSON.stringify(answers));
    } catch {
      // Storage full or blocked: the form still works, the draft just won't survive a reload.
    }
  }, [orgId, task.id, answers]);

  // Thumbnails for photos already in the draft.
  const photoIds = template.fields.flatMap((f) => (f.type === 'photo' ? ((answers[f.id] as string[]) ?? []) : []));
  const missingThumbs = photoIds.filter((id) => !urls[id]).join(',');
  useEffect(() => {
    if (!missingThumbs) return;
    let alive = true;
    void Promise.all(missingThumbs.split(',').map(async (id) => [id, await getPhoto(id)] as const)).then((found) => {
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const [id, p] of found) if (p) next[id] = URL.createObjectURL(p.blob);
      setUrls((u) => ({ ...u, ...next }));
    });
    return () => {
      alive = false;
    };
  }, [missingThumbs]);
  useEffect(() => () => Object.values(urls).forEach(URL.revokeObjectURL), []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (fieldId: string, value: AnswerValue) => setAnswers((a) => ({ ...a, [fieldId]: value }));

  async function addPhoto(fieldId: string) {
    const file = await takePhoto();
    if (!file) return;
    setBusyField(fieldId);
    try {
      const [blob, hash, gps] = await Promise.all([compressPhoto(file), sha256(file), currentPosition(5000)]);
      const id = crypto.randomUUID();
      await putPhoto({
        id,
        orgId,
        siteId: task.siteId,
        taskId: task.id,
        fieldId,
        blob,
        bytes: blob.size,
        sha256: hash,
        capturedAt: Date.now(),
        gps,
        status: 'draft',
      });
      setUrls((u) => ({ ...u, [id]: URL.createObjectURL(blob) }));
      setAnswers((a) => ({ ...a, [fieldId]: [...((a[fieldId] as string[]) ?? []), id] }));
    } catch (err) {
      console.error('Could not save photo', err);
    } finally {
      setBusyField(null);
    }
  }

  function removePhoto(fieldId: string, id: string) {
    setAnswers((a) => ({ ...a, [fieldId]: ((a[fieldId] as string[]) ?? []).filter((p) => p !== id) }));
    void deletePhoto(id);
  }

  const result = answersSchemaFor(template.fields).safeParse(answers);
  const errors = new Set(result.success ? [] : result.error.issues.map((i) => String(i.path[0])));

  async function submit() {
    setTried(true);
    if (!result.success) {
      const first = template.fields.find((f) => errors.has(f.id));
      if (first) fieldRefs.current[first.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSending(true);
    const gps = await currentPosition(5000);
    const photos: Photo[] = [];
    for (const id of photoIds) {
      const p = await getPhoto(id);
      if (!p) continue;
      photos.push({
        id,
        fieldId: p.fieldId,
        storagePath: photoPath(orgId, task.siteId, task.id, id),
        capturedAt: Timestamp.fromMillis(p.capturedAt),
        gps: p.gps,
        sha256: p.sha256,
        bytes: p.bytes,
      });
    }

    // Not awaited: offline, Firestore keeps the write and sends it when signal returns.
    setDoc(doc(db, paths.submissions(orgId), task.id), {
      taskId: task.id,
      templateId: task.templateId,
      authorId: uid,
      siteId: task.siteId,
      answers: result.data,
      photos,
      gps,
      capturedAt: Timestamp.now(),
      syncedAt: serverTimestamp(),
    }).catch((err) => console.error('Report was rejected', err));

    await queueTaskPhotos(task.id, photoIds);
    photosQueued();
    // The draft stays until Today sees the report confirmed on the server.
    onSent();
  }

  const missing = errors.size;

  return (
    <Shell title={template.name} subtitle={[siteName, template.dueTime && `Due ${formatTimeOfDay(template.dueTime)}`].filter(Boolean).join(' · ')} onBack={onBack}>
      {!online && <Bubble mood="idle">No signal? No problem. Fill it in and send. It goes when you’re back online.</Bubble>}

      {template.fields.map((f) => (
        <section
          key={f.id}
          ref={(el) => {
            fieldRefs.current[f.id] = el;
          }}
          className={`flex flex-col gap-3 rounded-card border-2 bg-white p-4 ${tried && errors.has(f.id) ? 'border-coral' : 'border-card-line'}`}
        >
          <h2 className="text-lg font-black">
            {f.label}
            {!f.required && <span className="ml-2 text-sm font-bold text-muted">optional</span>}
          </h2>
          {f.type === 'pickList' && <PickListField field={f} value={answers[f.id] ?? null} onChange={(v) => set(f.id, v)} />}
          {f.type === 'number' && <NumberField field={f} value={answers[f.id] ?? null} onChange={(v) => set(f.id, v)} />}
          {f.type === 'text' && <TextField field={f} value={answers[f.id] ?? null} onChange={(v) => set(f.id, v)} />}
          {f.type === 'photo' && (
            <PhotoField
              field={f}
              ids={(answers[f.id] as string[]) ?? []}
              urls={urls}
              busy={busyField === f.id}
              onAdd={() => void addPhoto(f.id)}
              onRemove={(id) => removePhoto(f.id, id)}
            />
          )}
          {tried && errors.has(f.id) && <p className="text-sm font-bold text-coral-shadow">This one still needs an answer.</p>}
        </section>
      ))}

      <div className="sticky bottom-0 -mx-5 flex flex-col gap-2 bg-cream px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {tried && missing > 0 && (
          <p className="text-center text-sm font-bold text-coral-shadow">
            {missing} {missing === 1 ? 'answer' : 'answers'} to go
          </p>
        )}
        <Button variant="ink" onClick={() => void submit()} disabled={sending || busyField !== null}>
          {sending ? 'Sending…' : `Submit · +${task.xp} XP`}
        </Button>
      </div>
    </Shell>
  );
}

/** Tasks with no fields (e.g. "Pour slab B"): one tap sends an empty report for review. */
function MarkDone({ orgId, uid, task, onBack, onSent }: Props) {
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    const gps = await currentPosition(5000);
    // Not awaited, as in the full form: works with no signal.
    setDoc(doc(db, paths.submissions(orgId), task.id), {
      taskId: task.id,
      templateId: null,
      authorId: uid,
      siteId: task.siteId,
      answers: {},
      photos: [],
      gps,
      capturedAt: Timestamp.now(),
      syncedAt: serverTimestamp(),
    }).catch((err) => console.error('Report was rejected', err));
    onSent();
  }

  return (
    <Shell title={task.title} onBack={onBack}>
      <Bubble>Nothing to fill in here. Tap below once it’s done and your site manager will check it off.</Bubble>
      <Button variant="ink" onClick={() => void send()} disabled={sending}>
        {sending ? 'Sending…' : `Mark as done · +${task.xp} XP`}
      </Button>
    </Shell>
  );
}

function Shell({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-4 px-5 pt-[max(16px,env(safe-area-inset-top))]">
      <button type="button" onClick={onBack} className="min-h-11 self-start font-bold text-muted underline">
        ← Back to today
      </button>
      <div>
        <h1 className="text-3xl font-black">{title}</h1>
        {subtitle && <p className="font-bold text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Bubble({ children, mood = 'idle' }: { children: ReactNode; mood?: 'idle' | 'worried' }) {
  return (
    <div className="flex items-center gap-3">
      <Streakee mood={mood} size={64} />
      <p className="flex-1 rounded-card border-2 border-card-line bg-white px-3.5 py-3">{children}</p>
    </div>
  );
}
