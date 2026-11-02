import type { Task } from '@site-streak/shared';

export type NodeState = 'done' | 'current' | 'open' | 'late' | 'locked' | 'excused';
export type NodeTone = 'yellow' | 'coral';
export type NodeIcon = 'report' | 'holdPoint' | 'task';

const icons: Record<NodeIcon | 'check' | 'lock', { d: string; color: string; width: number }> = {
  check: { d: 'M5 12l5 5 9-10', color: '#FFFFFF', width: 3.5 },
  report: { d: 'M7 4h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4h6v3H9zM9 12h6M9 16h4', color: '#24324A', width: 2.5 },
  holdPoint: { d: 'M3 18h18M5 18v-3a7 7 0 0 1 14 0v3M10 8V5h4v3', color: '#FFFFFF', width: 2.5 },
  task: { d: 'M4 18h16M6 18l2-8h8l2 8M10 10V6h4v4', color: '#24324A', width: 2.5 },
  lock: { d: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V8a4 4 0 0 1 8 0v3', color: '#7A7364', width: 2.5 },
};

function Icon({ name, size = 30 }: { name: keyof typeof icons; size?: number }) {
  const { d, color, width } = icons[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const fill: Record<NodeTone, string> = {
  yellow: 'bg-yellow shadow-node-yellow',
  coral: 'bg-coral shadow-node-coral',
};

function subtitle(task: Task, state: NodeState, waitingOn: string | null, pendingSync: boolean, dueLabel: string | null) {
  switch (state) {
    case 'done':
      if (pendingSync) return 'Saved · sends when you have signal';
      return task.status === 'submitted' ? `Sent for review · +${task.xp} XP` : `Done · +${task.xp} XP`;
    case 'locked':
      return waitingOn ? `Waiting on ${waitingOn.toLowerCase()}` : 'Locked for now';
    case 'late':
      return `Late · submit now · +${task.xp} XP`;
    case 'excused':
      return 'Excused today';
    default:
      return `${dueLabel ? `Due ${dueLabel}` : 'Tap to start'} · +${task.xp} XP`;
  }
}

type Props = {
  task: Task;
  state: NodeState;
  tone: NodeTone;
  icon: NodeIcon;
  /** Indent that makes the winding path. */
  offset: number;
  waitingOn: string | null;
  /** A sent report still waiting for signal. */
  pendingSync?: boolean;
  /** Shown when the person works in more than one zone. */
  zoneName?: string | null;
  /** e.g. "8 am", in the project's time. */
  dueLabel?: string | null;
  onOpen: () => void;
  /** For finished tasks with a report: opens what was sent. */
  onView?: () => void;
};

/** One stop on the day's winding task path. */
export function TaskNode({ task, state, tone, icon, offset, waitingOn, pendingSync = false, zoneName, dueLabel = null, onOpen, onView }: Props) {
  const label = subtitle(task, state, waitingOn, pendingSync, dueLabel);

  let circle;
  if (state === 'done') {
    const check = <Icon name="check" />;
    circle = onView ? (
      <button
        type="button"
        onClick={onView}
        aria-label={`${task.title}, see what you sent`}
        className="press flex h-16 w-[68px] shrink-0 items-center justify-center rounded-full bg-teal shadow-node-teal"
      >
        {check}
      </button>
    ) : (
      <div className="flex h-16 w-[68px] shrink-0 items-center justify-center rounded-full bg-teal shadow-node-teal">{check}</div>
    );
  } else if (state === 'locked' || state === 'excused') {
    circle = (
      <div className="flex h-16 w-[68px] shrink-0 items-center justify-center rounded-full bg-locked shadow-node-locked">
        <Icon name="lock" size={28} />
      </div>
    );
  } else {
    const big = state === 'current';
    const button = (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${task.title}, start`}
        className={`press flex shrink-0 items-center justify-center rounded-full ${fill[tone]} ${big ? 'h-[72px] w-[76px]' : 'h-16 w-[68px]'}`}
      >
        <Icon name={icon} size={big ? 32 : 30} />
      </button>
    );
    circle = big ? <div className="shrink-0 animate-pulse-ring rounded-full">{button}</div> : button;
  }

  return (
    <div className="flex items-center gap-3.5" style={{ paddingLeft: offset }}>
      {circle}
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <span className={`text-[17px] font-extrabold ${state === 'locked' || state === 'excused' ? 'text-muted' : ''}`}>
          {task.title}
          {zoneName && <span className="ml-1.5 text-[13px] font-bold text-muted">· {zoneName}</span>}
        </span>
        {state === 'current' ? (
          <button
            type="button"
            onClick={onOpen}
            className="press min-h-11 rounded-btn bg-ink px-4.5 text-sm font-black tracking-[0.06em] text-white shadow-chunky-ink"
          >
            START · +{task.xp} XP
          </button>
        ) : (
          <span
            className={`text-[13px] font-bold ${
              state === 'done' ? 'text-teal-shadow' : state === 'late' ? 'text-coral-shadow' : 'text-muted'
            }`}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
