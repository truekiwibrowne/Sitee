import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  formatTimeOfDay,
  isoWeekId,
  leagueMemberSchema,
  localDateIn,
  localMinutesIn,
  paths,
  projectSchema,
  taskSchema,
  taskTemplateSchema,
  userSchema,
  zoneSchema,
  type Task,
  type TaskTemplate,
} from '@site-streak/shared';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useDocData, useQueryData } from '../data/useFirestore';
import { useNow } from '../data/useNow';
import { tapHaptic } from '../device/haptics';
import { forgetSentReport } from '../report/ReportForm';
import { usePendingPhotoCount } from '../report/uploader';
import { Character, type BrixMood } from '../ui/Brix';
import { ReviewsWaiting, useReviewsWaiting } from './ReviewsWaiting';
import { Confetti } from '../ui/Confetti';
import { useCountUp } from '../ui/useCountUp';
import { Lunchbox } from './Lunchbox';
import { StatusChips } from './StatusChips';
import { TaskNode, type NodeIcon, type NodeState, type NodeTone } from './TaskNode';

// Indents that wind the path left and right, as in docs/mockups/foreman-today.dc.html.
const PATH_OFFSETS = [10, 64, 104, 64];
const offsetAt = (i: number) => PATH_OFFSETS[i % PATH_OFFSETS.length]!;

/** The guide starts worrying this close to a streak form's due time. */
const WORRY_MINUTES = 120;

type Celebration = { gain: string; message: string } | null;

const callOpenLunchbox = httpsCallable<void, { xp: number; gotFreeze: boolean }>(functions, 'openLunchbox');

const isDone = (t: Task) => t.status === 'submitted' || t.status === 'reviewed';

function iconFor(template: TaskTemplate | undefined): NodeIcon {
  switch (template?.category) {
    case 'dailyReport':
    case 'audit':
      return 'report';
    case 'quality':
    case 'healthSafety':
    case 'environment':
      return 'holdPoint';
    default:
      return 'task';
  }
}

/** Inspections and audits are coral on the path; everything else yellow. */
const toneOf = (template: TaskTemplate | undefined): NodeTone =>
  template && ['quality', 'healthSafety', 'environment', 'audit'].includes(template.category) ? 'coral' : 'yellow';

type Props = {
  orgId: string;
  uid: string;
  onOpenTask: (task: Task & { id: string }) => void;
  /** Opens what was sent for a finished task. */
  onViewSubmission: (submissionId: string) => void;
  /** Opens a report someone sent you to review. */
  onReview: (reviewTask: Task & { id: string }) => void;
};

export function TodayScreen({ orgId, uid, onOpenTask, onViewSubmission, onReview }: Props) {
  const now = useNow();
  const { data: user } = useDocData(`${paths.users(orgId)}/${uid}`, userSchema);
  // Due times and "today" follow the project's timezone.
  const projectId = user?.projectIds[0];
  const { data: project } = useDocData(projectId ? `${paths.projects(orgId)}/${projectId}` : null, projectSchema);
  const { data: zones } = useQueryData(collection(db, paths.zones(orgId)), `${orgId}/zones`, zoneSchema);
  const today = project ? localDateIn(project.timezone, now) : null;

  const tasksQuery = today
    ? query(collection(db, paths.tasks(orgId)), where('assigneeId', '==', uid), where('date', '==', today))
    : null;
  const { data: rawTasks, loading: tasksLoading } = useQueryData(tasksQuery, `${orgId}/${uid}/${today}`, taskSchema);
  const { data: templates } = useQueryData(collection(db, paths.taskTemplates(orgId)), `${orgId}/templates`, taskTemplateSchema);
  const reviews = useReviewsWaiting(orgId, uid);
  const { data: league } = useDocData(today ? `${paths.leagueMembers(orgId, isoWeekId(today))}/${uid}` : null, leagueMemberSchema);

  // My reports for today's tasks, including ones still waiting for signal. A sent report
  // counts as done straight away; Cloud Functions catch the task status up when it syncs.
  const [sent, setSent] = useState<Map<string, boolean>>(new Map()); // taskId → still pending sync
  const taskIds = rawTasks.map((t) => t.id).slice(0, 30).join(',');
  useEffect(() => {
    if (!taskIds) return;
    const q = query(
      collection(db, paths.submissions(orgId)),
      where('authorId', '==', uid),
      where('taskId', 'in', taskIds.split(',')),
    );
    return onSnapshot(q, { includeMetadataChanges: true }, (snap) =>
      setSent(new Map(snap.docs.map((d) => [d.id, d.metadata.hasPendingWrites]))),
    );
  }, [orgId, uid, taskIds]);

  // Once the server has a report, its local draft and photo records can go.
  useEffect(() => {
    for (const [taskId, pending] of sent) if (!pending) forgetSentReport(orgId, taskId);
  }, [orgId, sent]);

  const withSent = useMemo(
    () =>
      rawTasks.map((t) =>
        sent.has(t.id) && (t.status === 'open' || t.status === 'late') ? { ...t, status: 'submitted' as const } : t,
      ),
    [rawTasks, sent],
  );
  // Reviews of other people's reports are listed separately, not on the path.
  const tasks = withSent.filter((t) => t.kind !== 'review').sort((a, b) => a.order - b.order);
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const pendingPhotos = usePendingPhotoCount();
  // Excused tasks (e.g. a streak freeze covered them) count as done for the lunchbox.
  const doneCount = tasks.filter((t) => isDone(t) || t.status === 'excused').length;
  const current = tasks.find((t) => t.status === 'open' || t.status === 'late');

  const xp = useCountUp(user?.xpTotal);
  const [celebration, setCelebration] = useState<Celebration>(null);
  const [note, setNote] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const lunchboxOpened = !!today && user?.lunchboxOpenedOn === today;

  async function openTodaysLunchbox() {
    setOpening(true);
    setNote(null);
    try {
      await callOpenLunchbox();
    } catch (err) {
      console.error('Lunchbox did not open', err);
      setNote('The lunchbox lid is stuck! Check your signal and tap it again.');
    } finally {
      setOpening(false);
    }
  }

  // Celebrate when a task flips to done or XP arrives (both are written by Cloud Functions).
  const seen = useRef<{ statuses: Map<string, Task['status']>; xp?: number; lunchbox: boolean } | null>(null);
  useEffect(() => {
    if (!user || tasksLoading) return;
    const previous = seen.current;
    seen.current = { statuses: new Map(withSent.map((t) => [t.id, t.status])), xp: user.xpTotal, lunchbox: lunchboxOpened };
    if (!previous) return; // First load: nothing to celebrate.

    if (lunchboxOpened && !previous.lunchbox) {
      tapHaptic();
      setCelebration({ gain: `+${user.xpTotal - (previous.xp ?? user.xpTotal)} XP`, message: 'Smoko! XP and a streak freeze for rainy days.' });
      return;
    }

    const finished = withSent.find(
      (t) => t.kind !== 'review' && isDone(t) && !['submitted', 'reviewed'].includes(previous.statuses.get(t.id) ?? ''),
    );
    const xpGain = previous.xp !== undefined ? user.xpTotal - previous.xp : 0;
    if (!finished && xpGain <= 0) return;

    tapHaptic();
    setCelebration({
      gain: xpGain > 0 ? `+${xpGain} XP` : `+${finished!.xp} XP`,
      message: finished
        ? sent.get(finished.id)
          ? `${finished.title} saved! It sends the moment you have signal.`
          : templates.find((t) => t.id === finished.templateId)?.countsForStreak
            ? `${finished.title} in! Your streak is safe.`
            : `${finished.title} done. Nice work!`
        : `+${xpGain} XP landed. Nice work!`,
    });
  }, [user, withSent, sent, tasksLoading, lunchboxOpened, templates]);

  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 1700);
    return () => clearTimeout(timer);
  }, [celebration]);

  if (!user || !project) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Character id={user?.avatar ?? 'brix'} mood="idle" />
      </div>
    );
  }

  // The guide's message and mood for the day so far, led by the next streak form due.
  const firstName = user.name.split(' ')[0];
  const report = tasks.find((t) => !isDone(t) && t.dueAt && templateById.get(t.templateId ?? '')?.countsForStreak);
  const minutesLeft = report?.dueAt ? Math.floor((report.dueAt.toMillis() - now.getTime()) / 60_000) : null;
  const dueLabel = (t: Task) => (t.dueAt ? timeLabel(t.dueAt.toMillis()) : null);
  function timeLabel(ms: number) {
    const minutes = localMinutesIn(project!.timezone, new Date(ms));
    return formatTimeOfDay(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  const left = tasks.length - doneCount;

  let mood: BrixMood = 'idle';
  let message: string;
  if (tasksLoading) {
    message = 'Getting your day ready…';
  } else if (tasks.length === 0 && reviews.length > 0) {
    message = `${reviews.length} ${reviews.length === 1 ? 'report' : 'reports'} to review, ${firstName}. Your stars set their XP.`;
  } else if (tasks.length === 0) {
    mood = 'sleeping';
    message = `No tasks today, ${firstName}. Enjoy the quiet!`;
  } else if (left === 0) {
    message = lunchboxOpened
      ? `All done for today, ${firstName}. See you tomorrow!`
      : `All done for today, ${firstName}! Your lunchbox is ready.`;
  } else if (report && (report.status === 'late' || (minutesLeft !== null && minutesLeft <= 0))) {
    mood = 'worried';
    message = `Your ${report.title.toLowerCase()} is late! Send it now to save your ${user.streak}-day streak.`;
  } else if (report) {
    if (minutesLeft !== null && minutesLeft <= WORRY_MINUTES) mood = 'worried';
    message = `${left} ${left === 1 ? 'task' : 'tasks'} to go, ${firstName}! Send your ${report.title.toLowerCase()} by ${dueLabel(report)} to keep your ${user.streak}-day streak.`;
  } else {
    message = `${left} ${left === 1 ? 'task' : 'tasks'} to go, ${firstName}. Keep it rolling!`;
  }
  if (celebration) {
    mood = 'cheer';
    message = celebration.message;
  } else if (note) {
    message = note;
  }

  function nodeState(t: Task): NodeState {
    if (isDone(t)) return 'done';
    if (t.status === 'locked') return 'locked';
    if (t.status === 'excused') return 'excused';
    if (t.status === 'late') return 'late';
    return t === current ? 'current' : 'open';
  }

  function zoneName(zoneId: string | null) {
    return zones.find((z) => z.id === zoneId)?.name ?? null;
  }

  return (
    <div className="flex flex-col gap-3.5 px-5 pt-5 pb-4">
      <StatusChips streak={user.streak} xp={xp} tier={league?.tier ?? user.league} rank={league?.rank ?? null} />
      {pendingPhotos > 0 && (
        <p className="self-center rounded-full bg-white px-3 py-1 text-sm font-bold text-muted" role="status">
          {pendingPhotos} {pendingPhotos === 1 ? 'photo' : 'photos'} waiting to upload
        </p>
      )}

      <div className="relative flex items-center gap-2.5">
        <Character id={user.avatar} mood={mood} />
        <p className="flex-1 rounded-card border-2 border-card-line bg-white px-3.5 py-3 text-[15px] leading-snug" aria-live="polite">
          {message}
        </p>
        {celebration && (
          <span className="absolute -top-1.5 left-12 animate-pop rounded-full bg-teal px-2.5 py-1 text-[15px] font-black text-white shadow-[0_3px_0_var(--color-teal-shadow)]">
            {celebration.gain}
          </span>
        )}
      </div>

      <ReviewsWaiting reviews={reviews} onReview={onReview} />

      <div className="flex flex-col gap-4 pt-1">
        {tasks.map((t, i) => (
          <TaskNode
            key={t.id}
            task={t}
            state={nodeState(t)}
            tone={toneOf(templateById.get(t.templateId ?? ''))}
            icon={iconFor(templateById.get(t.templateId ?? ''))}
            dueLabel={dueLabel(t)}
            offset={offsetAt(i)}
            waitingOn={t.dependsOn.map((id) => tasks.find((d) => d.id === id)?.title).find(Boolean) ?? null}
            pendingSync={sent.get(t.id) === true}
            zoneName={user.zoneIds.length > 1 ? zoneName(t.zoneId) : null}
            onOpen={() => onOpenTask(t)}
            onView={sent.has(t.id) || t.submissionId ? () => onViewSubmission(t.submissionId ?? t.id) : undefined}
          />
        ))}
        {tasks.length > 0 && (
          <Lunchbox
            done={doneCount}
            total={tasks.length}
            opened={lunchboxOpened}
            opening={opening}
            offset={offsetAt(tasks.length)}
            onOpen={() => void openTodaysLunchbox()}
          />
        )}
      </div>

      {celebration && <Confetti />}
    </div>
  );
}
