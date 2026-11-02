export type NavTab<T extends string> = { id: T; label: string; icon: string };

export type ForemanTab = 'today' | 'learn' | 'league' | 'me';

export const FOREMAN_TABS: NavTab<ForemanTab>[] = [
  { id: 'today', label: 'Today', icon: 'M4 11l8-7 8 7v9H4z' },
  { id: 'learn', label: 'Learn', icon: 'M3 7l9-4 9 4-9 4zM7 9v5c3 2 7 2 10 0V9' },
  { id: 'league', label: 'League', icon: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z' },
  { id: 'me', label: 'Me', icon: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21a8 8 0 0 1 16 0' },
];

/** Bottom tab bar. Pads for the home indicator on notched phones. */
export function BottomNav<T extends string>({ tabs, active, onChange }: { tabs: NavTab<T>[]; active: T; onChange: (tab: T) => void }) {
  return (
    <nav
      className="sticky bottom-0 grid border-t-2 border-card-line bg-white px-2 pt-1.5 pb-[max(14px,env(safe-area-inset-bottom))]"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={on ? 'page' : undefined}
            className={`flex min-h-13 flex-col items-center justify-center gap-0.5 text-xs ${on ? 'font-black text-ink' : 'font-bold text-muted'}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill={on ? '#FFC93C' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
