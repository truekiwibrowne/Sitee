import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  formatTimeOfDay,
  isoWeekId,
  leagueMemberSchema,
  localDateIn,
  localMinutesIn,
  minutesOf,
  paths,
  siteSchema,
  taskSchema,
  taskTemplateSchema,
  userSchema,
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
import { Streakee, type StreakeeMood } from '../ui/Streakee';
import { Confetti } from '../ui/Confetti';
import { useCountUp } from '../ui/useCountUp';
import { DailyChest } from './DailyChest';
import { StatusChips } from './StatusChips';
import { TaskNode, type NodeIcon, type NodeState, type NodeTone } from './TaskNode';

// Indents that wind the path left and right, as in docs/mockups/foreman-today.dc.html.
const PATH_OFFSETS = [10, 64, 104, 64];
const offsetAt = (i: number) => PATH_OFFSETS[i % PATH_OFFSETS.length]!;

const DAILY_REPORT = 'daily-site-report';
/** Streakee starts worrying this close to the report's due time. */
const WORRY_MINUTES = 120;

type Celebration = { gain: string; message: string } | null;

const callOpenChest = httpsCallable<void, { xp: number; gotFreeze: boolean }>(functions, 'openChest');

const isDone = (t: Task) => t.status === 'submitted' || t.status === 'reviewed';

function iconFor(task: Task, template: TaskTemplate | undefined): NodeIcon {
  if (task.templateId === DAILY_REPORT) return 'report';
  if (template?.frequency === 'perHoldPoint') return 'holdPoint';
  return 'task';
}

export function TodayScreen({ orgId, uid, onOpenTask }: { orgId: string; uid: string; onOpenTask: (task: Task & { id: string }) => void }) {
  const now = useNow();
  const { data: user } = useDocData(`${paths.users(orgId)}/${uid}`, userSchema);
  const siteId = user?.siteIds[0];
  const { data: site } = useDocData(siteId ? `${paths.sites(orgId)}/${siteId}` : null, siteSchema);
  const today = site ? localDateIn(site.timezone, now) : null;

  const tasksQuery = today
    ? query(collection(db, paths.tasks(orgId)), where('assigneeId', '==', uid), where('date', '==', today))
    : null;
  const { data: rawTasks, loading: tasksLoading } = useQueryData(tasksQuery, `${orgId}/${uid}/${today}`, taskSchema);
  const { data: templates } = useQueryData(collection(db, paths.taskTemplates(orgId)), `${orgId}/templates`, taskTemplateSchema);
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
  const tasks = [...withSent].sort((a, b) => a.order - b.order);
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const pendingPhotos = usePendingPhotoCount();
  // Excused tasks (e.g. a streak freeze covered them) count as done for the chest.
  const doneCount = tasks.filter((t) => isDone(t) || t.status === 'excused').length;
  const current = tasks.find((t) => t.status === 'open' || t.status === 'late');

  const xp = useCountUp(user?.xpTotal);
  const [celebration, setCelebration] = useState<Celebration>(null);
  const [note, setNote] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const chestOpened = !!today && user?.chestOpenedOn === today;

  async function openTodaysChest() {
    setOpening(true);
    setNote(null);
    try {
      await callOpenChest();
    } catch (err) {
      console.error('Chest did not open', err);
      setNote('The chest is stuck! Check your signal and tap it again.');
    } finally {
      setOpening(false);
    }
  }

  // Celebrate when a task flips to done or XP arrives (both are written by Cloud Functions).
  const seen = useRef<{ statuses: Map<string, Task['status']>; xp?: number; chest: boolean } | null>(null);
  useEffect(() => {
    if (!user || tasksLoading) return;
    const previous = seen.current;
    seen.current = { statuses: new Map(withSent.map((t) => [t.id, t.status])), xp: user.xpTotal, chest: chestOpened };
    if (!previous) return; // First load: nothing to celebrate.

    if (chestOpened && !previous.chest) {
      tapHaptic();
      setCelebration({ gain: `+${user.xpTotal - (previous.xp ?? user.xpTotal)} XP`, message: 'Chest opened! XP and a streak freeze for rainy days.' });
      return;
    }

    const finished = withSent.find((t) => isDone(t) && !['submitted', 'reviewed'].includes(previous.statuses.get(t.id) ?? ''));
    const xpGain = previous.xp !== undefined ? user.xpTotal - previous.xp : 0;
    if (!finished && xpGain <= 0) return;

    tapHaptic();
    setCelebration({
      gain: xpGain > 0 ? `+${xpGain} XP` : `+${finished!.xp} XP`,
      message: finished
        ? finished.templateId === DAILY_REPORT
          ? sent.get(finished.id)
            ? 'Report saved! It sends the moment you have signal.'
            : 'Report in! Your streak is safe. Your site manager will review it.'
          : `${finished.title} done. Nice work!`
        : `+${xpGain} XP landed. Your work was reviewed!`,
    });
  }, [user, withSent, sent, tasksLoading, chestOpened]);

  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 1700);
    return () => clearTimeout(timer);
  }, [celebration]);

  if (!user || !site) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Streakee mood="idle" />
      </div>
    );
  }

  // Streakee's message and mood for the day so far.
  const firstName = user.name.split(' ')[0];
  const report = tasks.find((t) => t.templateId === DAILY_REPORT);
  const dueTime = templateById.get(DAILY_REPORT)?.dueTime;
  const minutesLeft = dueTime ? minutesOf(dueTime) - localMinutesIn(site.timezone, now) : null;
  const left = tasks.length - doneCount;

  let mood: StreakeeMood = 'idle';
  let message: string;
  if (tasksLoading) {
    message = 'Getting your day ready…';
  } else if (tasks.length === 0) {
    mood = 'sleeping';
    message = `No tasks today, ${firstName}. Enjoy the quiet!`;
  } else if (left === 0) {
    message = chestOpened
      ? `All done for today, ${firstName}. See you tomorrow!`
      : `All done for today, ${firstName}! Your daily chest is ready.`;
  } else if (report && !isDone(report) && (report.status === 'late' || (minutesLeft !== null && minutesLeft <= 0))) {
    mood = 'worried';
    message = `Your site report is late! Send it now to save your ${user.streak}-day streak.`;
  } else if (report && !isDone(report) && dueTime) {
    if (minutesLeft !== null && minutesLeft <= WORRY_MINUTES) mood = 'worried';
    message = `${left} ${left === 1 ? 'task' : 'tasks'} to go, ${firstName}! Submit your site report by ${formatTimeOfDay(dueTime)} to keep your ${user.streak}-day streak.`;
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

  function toneFor(t: Task): NodeTone {
    return templateById.get(t.templateId ?? '')?.frequency === 'perHoldPoint' ? 'coral' : 'yellow';
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
        <Streakee mood={mood} />
        <p className="flex-1 rounded-card border-2 border-card-line bg-white px-3.5 py-3 text-[15px] leading-snug" aria-live="polite">
          {message}
        </p>
        {celebration && (
          <span className="absolute -top-1.5 left-12 animate-pop rounded-full bg-teal px-2.5 py-1 text-[15px] font-black text-white shadow-[0_3px_0_var(--color-teal-shadow)]">
            {celebration.gain}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 pt-1">
        {tasks.map((t, i) => (
          <TaskNode
            key={t.id}
            task={t}
            state={nodeState(t)}
            tone={toneFor(t)}
            icon={iconFor(t, templateById.get(t.templateId ?? ''))}
            offset={offsetAt(i)}
            waitingOn={t.dependsOn.map((id) => tasks.find((d) => d.id === id)?.title).find(Boolean) ?? null}
            pendingSync={sent.get(t.id) === true}
            onOpen={() => onOpenTask(t)}
          />
        ))}
        {tasks.length > 0 && (
          <DailyChest
            done={doneCount}
            total={tasks.length}
            opened={chestOpened}
            opening={opening}
            offset={offsetAt(tasks.length)}
            onOpen={() => void openTodaysChest()}
          />
        )}
      </div>

      {celebration && <Confetti />}
    </div>
  );
}
