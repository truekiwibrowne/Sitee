import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Shows `target`, counting up (or down) to each new value over `ms`.
 * The first value appears straight away; only later changes animate.
 */
export function useCountUp(target: number | undefined, ms = 700): number {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(target ?? 0);
  const last = useRef(target);

  useEffect(() => {
    if (target === undefined) return;
    const from = last.current;
    last.current = target;
    if (from === undefined || from === target || reduceMotion) {
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const p = Math.min(1, (now - t0) / ms);
      setShown(Math.round(from + (target - from) * p));
      if (p < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, ms, reduceMotion]);

  return shown;
}
