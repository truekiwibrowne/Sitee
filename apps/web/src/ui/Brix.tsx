import { motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';

export type BrixMood = 'idle' | 'cheer' | 'worried' | 'sleeping';

const motionFor: Record<BrixMood, TargetAndTransition> = {
  idle: { y: [0, -6, 0], rotate: 0, transition: { duration: 2.6, ease: 'easeInOut', repeat: Infinity } },
  cheer: { y: [0, -20, 0, 0], rotate: [0, -8, 6, 0], transition: { duration: 0.7, ease: 'easeOut', repeat: 1 } },
  worried: { y: 0, rotate: [0, -3, 3, -3, 0], transition: { duration: 1.2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5 } },
  sleeping: { y: [0, 2, 0], rotate: 0, transition: { duration: 3.5, ease: 'easeInOut', repeat: Infinity } },
};

const mouth: Record<BrixMood, { d: string; fill: string }> = {
  idle: { d: 'M50 86q10 10 20 0', fill: 'none' },
  cheer: { d: 'M46 84q14 18 28 0z', fill: '#24324A' },
  worried: { d: 'M50 92q10 -8 20 0', fill: 'none' },
  sleeping: { d: 'M54 88h12', fill: 'none' },
};

/** Brix: a brick in a yellow hard hat. Original mascot art; see CLAUDE.md "Look and feel". */
export function Brix({ mood = 'idle', size = 92 }: { mood?: BrixMood; size?: number }) {
  const reduceMotion = useReducedMotion();
  const m = mouth[mood];
  const asleep = mood === 'sleeping';

  return (
    <motion.svg
      key={mood}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Brix, the hard-hat mascot, looking ${mood === 'idle' ? 'happy' : mood}`}
      animate={reduceMotion ? undefined : motionFor[mood]}
      style={{ transformOrigin: '50% 90%', flexShrink: 0 }}
    >
      <ellipse cx="60" cy="113" rx="32" ry="5" fill="#24324A" opacity="0.12" />
      <rect x="22" y="44" width="76" height="62" rx="20" fill="#FF8C5A" stroke="#24324A" strokeWidth="4" />
      <path d="M32 97h12M76 97h12" stroke="#D9573A" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 50a36 30 0 0 1 72 0z" fill="#FFC93C" stroke="#24324A" strokeWidth="4" strokeLinejoin="round" />
      <rect x="14" y="46" width="92" height="10" rx="5" fill="#FFC93C" stroke="#24324A" strokeWidth="4" />
      <path d="M60 22v24" stroke="#24324A" strokeWidth="4" strokeLinecap="round" />
      {asleep ? (
        <path d="M38 73q8 6 16 0M66 73q8 6 16 0" fill="none" stroke="#24324A" strokeWidth="3.5" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="46" cy="72" r="9" fill="#FFFFFF" stroke="#24324A" strokeWidth="3" />
          <circle cx="74" cy="72" r="9" fill="#FFFFFF" stroke="#24324A" strokeWidth="3" />
          <circle cx="48" cy="73" r="4.5" fill="#24324A" />
          <circle cx="76" cy="73" r="4.5" fill="#24324A" />
        </>
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
