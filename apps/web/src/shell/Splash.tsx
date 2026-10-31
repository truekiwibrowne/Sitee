import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Streakee } from '../ui/Streakee';

/** How long the launch screen shows at minimum. */
export const SPLASH_MS = 4000;
const SEEN_KEY = 'splashSeen';

/**
 * True on a fresh launch. False when the app was already open this session (a
 * reload, or coming back from the background), so the splash is skipped.
 */
function isColdStart(): boolean {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Storage blocked (private mode): just show the splash.
  }
  return true;
}

// Decided once per page load (not in a hook, which React may run twice in dev).
const COLD_START = isColdStart();

/** Whether the launch screen should still show: for SPLASH_MS on a cold start, and while `busy`. */
export function useSplash(busy: boolean): boolean {
  const [minElapsed, setMinElapsed] = useState(!COLD_START);

  useEffect(() => {
    if (minElapsed) return;
    const timer = setTimeout(() => setMinElapsed(true), SPLASH_MS);
    return () => clearTimeout(timer);
  }, [minElapsed]);

  return busy || !minElapsed;
}

/** Launch screen: Streakee doing flips over a loading bar. */
export function Splash() {
  const still = useReducedMotion() ?? false;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-7 px-10" aria-busy="true" aria-label="Loading Site Streak">
      <Streakee mood="flip" size={120} />
      <div className="flex w-full max-w-[220px] flex-col items-center gap-3">
        <h1 className="text-2xl font-black">Site Streak</h1>
        {/* The bar fills over the minimum splash time; later it can show real loading progress. */}
        <div className="h-3 w-full overflow-hidden rounded-full border-2 border-card-line bg-white" role="progressbar" aria-label="Loading">
          <motion.div
            className="h-full rounded-full bg-yellow"
            initial={{ width: still ? '100%' : '4%' }}
            animate={{ width: '100%' }}
            transition={{ duration: SPLASH_MS / 1000, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </main>
  );
}
