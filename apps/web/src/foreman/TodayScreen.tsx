import { useEffect, useRef, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
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
import { db } from '../lib/firebase';
import { useDocData, useQueryData } from '../data/useFirestore';
import { useNow } from '../data/useNow';
import { tapHaptic } from '../device/haptics';
import { Brix, type BrixMood } from '../ui/Brix';
import { Confetti } from '../ui/Confetti';
import { useCountUp } from '../ui/useCountUp';
import { DailyChest } from './DailyChest';
import { StatusChips } from './StatusChips';
import { TaskNode, type NodeIcon, type NodeState, type NodeTone } from './TaskNode';

// Indents that wind the path left and right, as in docs/mockups/foreman-today.dc.html.
const PATH_OFFSETS = [10, 64, 104, 64];
const offsetAt = (i: number) => PATH_OFFSETS[i % PATH_OFFSETS.length]!;

const DAILY_REPORT = 'daily-site-report';
/** Brix starts worrying this close to the report's due time. */
const WORRY_MINUTES = 120;

type Celebration = { gain: string; message: string } | null;

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

  const tasks = [...rawTasks].sort((a, b) => a.order - b.order);
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const doneCount = tasks.filter(isDone).length;
  const current = tasks.find((t) => t.status === 'open' || t.status === 'late');

  const xp = useCountUp(user?.xpTotal);
  const [celebration, setCelebration] = useState<Celebration>(null);
  const [note, setNote] = useState<string | null>(null);

  // Celebrate when a task flips to done or XP arrives (both are written by Cloud Functions).
  const seen = useRef<{ statuses: Map<string, Task['status']>; xp?: number } | null>(null);
  useEffect(() => {
    if (!user || tasksLoading) return;
    const previous = seen.current;
    seen.current = { statuses: new Map(rawTasks.map((t) => [t.id, t.status])), xp: user.xpTotal };
    if (!previous) return; // First load: nothing to celebrate.

    const finished = rawTasks.find((t) => isDone(t) && !['submitted', 'reviewed'].includes(previous.statuses.get(t.id) ?? ''));
    const xpGain = previous.xp !== undefined ? user.xpTotal - previous.xp : 0;
    if (!finished && xpGain <= 0) return;

    tapHaptic();
    setCelebration({
      gain: xpGain > 0 ? `+${xpGain} XP` : `+${finished!.xp} XP`,
      message: finished
        ? finished.templateId === DAILY_REPORT
          ? 'Report in! Your streak is safe. Your site manager will review it.'
          : `${finished.title} done. Nice work!`
        : `+${xpGain} XP landed. Your work was reviewed!`,
    });
  }, [user, rawTasks, tasksLoading]);

  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 1700);
    return () => clearTimeout(timer);
  }, [celebration]);

  if (!user || !site) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Brix mood="idle" />
      </div>
    );
  }

  // Brix's message and mood for the day so far.
  const firstName = user.name.split(' ')[0];
  const report = tasks.find((t) => t.templateId === DAILY_REPORT);
  const dueTime = templateById.get(DAILY_REPORT)?.dueTime;
  const minutesLeft = dueTime ? minutesOf(dueTime) - localMinutesIn(site.timezone, now) : null;
  const left = tasks.length - doneCount;

  let mood: BrixMood = 'idle';
  let message: string;
  if (tasksLoading) {
    message = 'Getting your day ready…';
  } else if (tasks.length === 0) {
    mood = 'sleeping';
    message = `No tasks today, ${firstName}. Enjoy the quiet!`;
  } else if (left === 0) {
    message = `All done for today, ${firstName}! Your daily chest is ready.`;
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

      <div className="relative flex items-center gap-2.5">
        <Brix mood={mood} />
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
            onOpen={() => onOpenTask(t)}
          />
        ))}
        {tasks.length > 0 && (
          <DailyChest
            done={doneCount}
            total={tasks.length}
            offset={offsetAt(tasks.length)}
            onOpen={() => setNote('Chest opening is coming in the next update. Your rewards will be waiting!')}
          />
        )}
      </div>

      {celebration && <Confetti />}
    </div>
  );
}
