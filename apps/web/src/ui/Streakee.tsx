import { motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';

export type StreakeeMood = 'idle' | 'cheer' | 'worried' | 'sleeping' | 'flip';

// Whole-body motion for each mood.
const bodyMotion: Record<StreakeeMood, TargetAndTransition> = {
  // Little hops while sitting there: a bigger bounce, a small one, then a rest.
  idle: {
    y: [0, -9, 0, -4, 0, 0],
    scaleY: [1, 1.03, 0.94, 1.01, 0.98, 1],
    rotate: 0,
    transition: { duration: 2.4, times: [0, 0.18, 0.36, 0.5, 0.64, 1], ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.6 },
  },
  cheer: { y: [0, -22, 0, 0], rotate: [0, -8, 6, 0], scaleY: 1, transition: { duration: 0.7, ease: 'easeOut', repeat: 1 } },
  worried: { y: 0, scaleY: 1, rotate: [0, -3, 3, -3, 0], transition: { duration: 1.2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5 } },
  sleeping: { y: [0, 2, 0], scaleY: [1, 0.98, 1], rotate: 0, transition: { duration: 3.5, ease: 'easeInOut', repeat: Infinity } },
  // Loading screen: jump, full backflip, land with a squash.
  flip: {
    y: [0, -36, -36, 0, 0],
    rotate: [0, 0, -360, -360, -360],
    scaleY: [1, 1, 1, 0.88, 1],
    transition: { duration: 1.1, times: [0, 0.25, 0.65, 0.85, 1], ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.25 },
  },
};

// Pupils glance around: left, right, up-right, down, then back to centre.
const lookAround: TargetAndTransition = {
  x: [0, -3, -3, 3, 3, 1.5, 0, 0],
  y: [0, 0, 0, -1.5, -1.5, 2, 0, 0],
  transition: { duration: 6, times: [0, 0.1, 0.25, 0.35, 0.5, 0.62, 0.75, 1], ease: 'easeInOut', repeat: Infinity },
};

// A quick blink every few seconds.
const blink: TargetAndTransition = {
  scaleY: [1, 1, 0.1, 1, 1],
  transition: { duration: 4.2, times: [0, 0.9, 0.93, 0.96, 1], repeat: Infinity },
};

const mouth: Record<StreakeeMood, { d: string; fill: string }> = {
  idle: { d: 'M50 86q10 10 20 0', fill: 'none' },
  cheer: { d: 'M46 84q14 18 28 0z', fill: '#24324A' },
  worried: { d: 'M50 92q10 -8 20 0', fill: 'none' },
  sleeping: { d: 'M54 88h12', fill: 'none' },
  flip: { d: 'M46 84q14 18 28 0z', fill: '#24324A' },
};

const describe: Record<StreakeeMood, string> = {
  idle: 'happy',
  cheer: 'cheering',
  worried: 'worried',
  sleeping: 'asleep',
  flip: 'doing flips',
};

/** Streakee: a brick in a yellow hard hat. Original mascot art; see CLAUDE.md "Look and feel". */
export function Streakee({ mood = 'idle', size = 92 }: { mood?: StreakeeMood; size?: number }) {
  const still = useReducedMotion() ?? false;
  const m = mouth[mood];
  const eyesOpen = mood !== 'sleeping';
  const lively = !still && (mood === 'idle' || mood === 'worried');

  return (
    <motion.svg
      key={mood}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Streakee, the hard-hat mascot, ${describe[mood]}`}
      animate={still ? undefined : bodyMotion[mood]}
      style={{ transformOrigin: '50% 90%', flexShrink: 0, overflow: 'visible' }}
    >
      <ellipse cx="60" cy="113" rx="32" ry="5" fill="#24324A" opacity="0.12" />
      <rect x="22" y="44" width="76" height="62" rx="20" fill="#FF8C5A" stroke="#24324A" strokeWidth="4" />
      <path d="M32 97h12M76 97h12" stroke="#D9573A" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 50a36 30 0 0 1 72 0z" fill="#FFC93C" stroke="#24324A" strokeWidth="4" strokeLinejoin="round" />
      <rect x="14" y="46" width="92" height="10" rx="5" fill="#FFC93C" stroke="#24324A" strokeWidth="4" />
      <path d="M60 22v24" stroke="#24324A" strokeWidth="4" strokeLinecap="round" />
      {eyesOpen ? (
        <motion.g animate={lively ? blink : undefined} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <circle cx="46" cy="72" r="9" fill="#FFFFFF" stroke="#24324A" strokeWidth="3" />
          <circle cx="74" cy="72" r="9" fill="#FFFFFF" stroke="#24324A" strokeWidth="3" />
          <motion.g animate={lively ? lookAround : undefined}>
            <circle cx="47" cy="73" r="4.5" fill="#24324A" />
            <circle cx="75" cy="73" r="4.5" fill="#24324A" />
          </motion.g>
        </motion.g>
      ) : (
        <path d="M38 73q8 6 16 0M66 73q8 6 16 0" fill="none" stroke="#24324A" strokeWidth="3.5" strokeLinecap="round" />
      )}
      {mood === 'worried' && (
        // Inner ends raised: worried, not cross.
        <path d="M36 63l12 -4M84 63l-12 -4" stroke="#24324A" strokeWidth="3.5" strokeLinecap="round" />
      )}
      <circle cx="35" cy="87" r="5" fill="#FF5D7A" opacity="0.35" />
      <circle cx="85" cy="87" r="5" fill="#FF5D7A" opacity="0.35" />
      <path d={m.d} fill={m.fill} stroke="#24324A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </motion.svg>
  );
}
