function ChestArt({ wiggle }: { wiggle: boolean }) {
  return (
    <svg className={wiggle ? 'animate-wiggle origin-[50%_85%]' : ''} width="60" height="56" viewBox="0 0 60 56" aria-hidden="true">
      <rect x="6" y="22" width="48" height="28" rx="6" fill="#B86B2E" stroke="#24324A" strokeWidth="3" />
      <path d="M6 26a24 16 0 0 1 48 0z" fill="#D9853B" stroke="#24324A" strokeWidth="3" strokeLinejoin="round" />
      <rect x="25" y="24" width="10" height="12" rx="3" fill="#FFC93C" stroke="#24324A" strokeWidth="3" />
    </svg>
  );
}

/** The reward at the end of the path. It unlocks once every task today is done. */
export function DailyChest({ done, total, offset, onOpen }: { done: number; total: number; offset: number; onOpen: () => void }) {
  const ready = total > 0 && done === total;

  return (
    <div className="flex items-center gap-3.5" style={{ paddingLeft: offset }}>
      {ready ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open daily chest"
          className="press flex h-16 w-[68px] shrink-0 items-center justify-center"
        >
          <ChestArt wiggle />
        </button>
      ) : (
        <div className="flex h-16 w-[68px] shrink-0 items-center justify-center opacity-55">
          <ChestArt wiggle={false} />
        </div>
      )}
      <div className="flex flex-col">
        <span className="text-[17px] font-extrabold">Daily chest</span>
        <span className={`text-[13px] font-bold ${ready ? 'text-coral-shadow' : 'text-muted'}`}>
          {ready ? 'Ready! Tap to open' : `${done} of ${total} done · finish all to open`}
        </span>
      </div>
    </div>
  );
}
