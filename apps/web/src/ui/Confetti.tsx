import { useReducedMotion } from 'framer-motion';

const pieces = [
  ['6%', 'bg-yellow', '0s'],
  ['14%', 'bg-teal', '0.15s'],
  ['22%', 'bg-coral', '0.05s'],
  ['30%', 'bg-yellow', '0.25s'],
  ['38%', 'bg-teal', '0.1s'],
  ['46%', 'bg-coral', '0.3s'],
  ['54%', 'bg-teal', '0s'],
  ['62%', 'bg-yellow', '0.2s'],
  ['70%', 'bg-coral', '0.08s'],
  ['78%', 'bg-teal', '0.28s'],
  ['86%', 'bg-yellow', '0.12s'],
  ['93%', 'bg-coral', '0.22s'],
] as const;

/** A short burst of confetti over the screen. Skipped entirely for reduced motion. */
export function Confetti() {
  if (useReducedMotion()) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {pieces.map(([left, color, delay]) => (
        <span
          key={left}
          className={`absolute top-0 h-3.5 w-2.5 animate-fall rounded-[3px] ${color}`}
          style={{ left, animationDelay: delay }}
        />
      ))}
    </div>
  );
}
