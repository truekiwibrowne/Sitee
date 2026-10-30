import { ROLE_LADDER } from '@site-streak/shared';

const swatches = [
  ['bg-yellow shadow-chunky-yellow', 'Yellow'],
  ['bg-teal shadow-chunky-teal', 'Teal'],
  ['bg-coral shadow-chunky-coral', 'Coral'],
  ['bg-locked shadow-chunky-locked', 'Locked'],
] as const;

// Placeholder until the Foreman Today screen (step 5). Shows the theme tokens working.
export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[390px] flex-col gap-6 px-5 py-8">
      <h1 className="text-3xl font-black">Site Streak</h1>
      <p className="text-muted">Scaffold is up. Roles: {ROLE_LADDER.join(' → ')}</p>

      <div className="grid grid-cols-4 gap-3">
        {swatches.map(([cls, label]) => (
          <div key={label} className="flex flex-col items-center gap-2 text-xs">
            <span className={`size-14 rounded-full ${cls}`} />
            {label}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="press min-h-11 rounded-btn bg-ink px-5 font-black tracking-wider text-white shadow-chunky-ink"
      >
        SUBMIT · +50 XP
      </button>
      <button
        type="button"
        className="press min-h-11 rounded-btn bg-yellow px-5 font-black tracking-wider text-ink shadow-chunky-yellow"
      >
        START REPORT
      </button>
    </main>
  );
}
