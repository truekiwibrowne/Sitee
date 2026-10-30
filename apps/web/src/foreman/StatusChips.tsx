import type { LeagueTier } from '@site-streak/shared';

const chip = 'flex min-h-9 items-center gap-1.5 rounded-full border-2 border-card-line bg-white px-3 py-1.5 text-base font-black';

const tierName: Record<LeagueTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };

/** Streak, XP and league at the top of Today. */
export function StatusChips({ streak, xp, tier, rank }: { streak: number; xp: number; tier: LeagueTier; rank: number | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className={`${chip} text-coral-shadow`} aria-label={`${streak}-day streak`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF7A59" stroke="#C2410C" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z" />
        </svg>
        {streak}
      </span>
      <span className={`${chip} text-teal-shadow`} aria-label={`${xp} XP`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#2BB3A3" stroke="#17766C" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3h12l4 6-10 12L2 9z" />
        </svg>
        {xp.toLocaleString('en-US')}
      </span>
      <span className={`${chip} text-ink`} aria-label={`${tierName[tier]} league${rank ? `, rank ${rank}` : ''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#D7DEE8" stroke="#24324A" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
        </svg>
        {tierName[tier]}
        {rank ? ` #${rank}` : ''}
      </span>
    </div>
  );
}
