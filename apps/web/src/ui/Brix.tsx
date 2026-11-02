import type { ReactNode } from 'react';
import { motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';
import { CHARACTER_INFO, type CharacterId } from '@site-streak/shared';

export type BrixMood = 'idle' | 'cheer' | 'worried' | 'sleeping' | 'flip' | 'still';

// Whole-body motion for each mood.
const bodyMotion: Record<BrixMood, TargetAndTransition> = {
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
  // As an avatar: no motion.
  still: { y: 0, rotate: 0, scaleY: 1 },
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

const mouth: Record<BrixMood, { d: string; fill: string }> = {
  idle: { d: 'M50 86q10 10 20 0', fill: 'none' },
  cheer: { d: 'M46 84q14 18 28 0z', fill: '#24324A' },
  worried: { d: 'M50 92q10 -8 20 0', fill: 'none' },
  sleeping: { d: 'M54 88h12', fill: 'none' },
  flip: { d: 'M46 84q14 18 28 0z', fill: '#24324A' },
  still: { d: 'M50 86q10 10 20 0', fill: 'none' },
};

const describe: Record<BrixMood, string> = {
  idle: 'happy',
  cheer: 'cheering',
  worried: 'worried',
  sleeping: 'asleep',
  flip: 'doing flips',
  still: 'smiling',
};

const ink = '#24324A';
const line = { stroke: ink, strokeWidth: 4, strokeLinejoin: 'round' as const };

/**
 * Each character's body and hat, drawn behind a shared face (eyes at 46/74, y 72), so
 * every character gets the same moods and animations. Original art; see CLAUDE.md.
 */
const BODIES: Record<CharacterId, ReactNode> = {
  // A brick in a yellow hard hat.
  brix: (
    <>
      <rect x="22" y="44" width="76" height="62" rx="20" fill="#FF8C5A" {...line} />
      <path d="M32 97h12M76 97h12" stroke="#D9573A" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 50a36 30 0 0 1 72 0z" fill="#FFC93C" {...line} />
      <rect x="14" y="46" width="92" height="10" rx="5" fill="#FFC93C" {...line} />
      <path d="M60 22v24" stroke={ink} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  // A concrete block in a white hard hat.
  blocx: (
    <>
      <rect x="18" y="44" width="84" height="62" rx="12" fill="#B9C0C9" {...line} />
      <path d="M26 98h10M84 98h10M58 100h6" stroke="#8E97A3" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M26 50a34 28 0 0 1 68 0z" fill="#FFFFFF" {...line} />
      <rect x="16" y="46" width="88" height="10" rx="5" fill="#FFFFFF" {...line} />
      <path d="M50 30h20" stroke="#2BB3A3" strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  // A timber plank with grain, in an orange hard hat.
  plank: (
    <>
      <rect x="28" y="36" width="64" height="72" rx="10" fill="#E3B072" {...line} />
      <path d="M36 50q8 12 0 26M84 60q-6 14 2 30M58 92q6 6 14 6" fill="none" stroke="#B9824A" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 40a28 22 0 0 1 56 0z" fill="#FF7A59" {...line} />
      <rect x="24" y="36" width="72" height="9" rx="4.5" fill="#FF7A59" {...line} />
    </>
  ),
  // A steel hex nut in a blue hard hat.
  bolt: (
    <>
      <path d="M38 40h44l22 34-22 34H38L16 74z" fill="#AEB7C2" {...line} />
      <path d="M24 74h8M88 74h8" stroke="#8E97A3" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M30 44a30 24 0 0 1 60 0z" fill="#5BA7E8" {...line} />
      <rect x="22" y="40" width="76" height="9" rx="4.5" fill="#5BA7E8" {...line} />
    </>
  ),
  // A cement-mixer drum with spiral stripes.
  mixa: (
    <>
      <ellipse cx="60" cy="76" rx="44" ry="34" fill="#2BB3A3" {...line} />
      <path d="M24 60q20 10 22 46M44 44q22 14 22 64M70 43q18 18 14 60" fill="none" stroke="#17766C" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="60" cy="44" rx="18" ry="7" fill="#24324A" opacity="0.75" {...line} />
    </>
  ),
  // A traffic cone with reflective bands.
  cona: (
    <>
      <path d="M52 22h16l38 82H14z" fill="#FF7A59" {...line} />
      <path d="M44 42h32l4 9H40zM28 92h64l3 7H25z" fill="#FFFFFF" />
      <rect x="10" y="102" width="100" height="10" rx="4" fill="#E25C3B" {...line} />
    </>
  ),
};

const describeCharacter = (id: CharacterId) => CHARACTER_INFO[id].name;

/** A character from the cast, with moods. People's chosen character guides them on Today. */
export function Character({ id = 'brix', mood = 'idle', size = 92 }: { id?: CharacterId; mood?: BrixMood; size?: number }) {
  const still = useReducedMotion() ?? false;
  const m = mouth[mood];
  const eyesOpen = mood !== 'sleeping';
  const lively = !still && (mood === 'idle' || mood === 'worried');

  return (
    <motion.svg
      key={`${id}-${mood}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`${describeCharacter(id)}, ${describe[mood]}`}
      animate={still ? undefined : bodyMotion[mood]}
      style={{ transformOrigin: '50% 90%', flexShrink: 0, overflow: 'visible' }}
    >
      <ellipse cx="60" cy="113" rx="32" ry="5" fill={ink} opacity="0.12" />
      {BODIES[id]}
      {eyesOpen ? (
        <motion.g animate={lively ? blink : undefined} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <circle cx="46" cy="72" r="9" fill="#FFFFFF" stroke={ink} strokeWidth="3" />
          <circle cx="74" cy="72" r="9" fill="#FFFFFF" stroke={ink} strokeWidth="3" />
          <motion.g animate={lively ? lookAround : undefined}>
            <circle cx="47" cy="73" r="4.5" fill={ink} />
            <circle cx="75" cy="73" r="4.5" fill={ink} />
          </motion.g>
        </motion.g>
      ) : (
        <path d="M38 73q8 6 16 0M66 73q8 6 16 0" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
      )}
      {mood === 'worried' && (
        // Inner ends raised: worried, not cross.
        <path d="M36 63l12 -4M84 63l-12 -4" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
      )}
      <circle cx="35" cy="87" r="5" fill="#FF5D7A" opacity="0.35" />
      <circle cx="85" cy="87" r="5" fill="#FF5D7A" opacity="0.35" />
      <path d={m.d} fill={m.fill} stroke={ink} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </motion.svg>
  );
}

/** Brix, the brand mascot: the loading and sign-in screens use him whatever people pick. */
export function Brix(props: { mood?: BrixMood; size?: number }) {
  return <Character id="brix" {...props} />;
}
