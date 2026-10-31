function ClosedChest({ wiggle }: { wiggle: boolean }) {
  return (
    <svg className={wiggle ? 'animate-wiggle origin-[50%_85%]' : ''} width="60" height="56" viewBox="0 0 60 56" aria-hidden="true">
      <rect x="6" y="22" width="48" height="28" rx="6" fill="#B86B2E" stroke="#24324A" strokeWidth="3" />
      <path d="M6 26a24 16 0 0 1 48 0z" fill="#D9853B" stroke="#24324A" strokeWidth="3" strokeLinejoin="round" />
      <rect x="25" y="24" width="10" height="12" rx="3" fill="#FFC93C" stroke="#24324A" strokeWidth="3" />
    </svg>
  );
}

function OpenChest() {
  return (
    <svg className="animate-pop" width="60" height="56" viewBox="0 0 60 56" aria-hidden="true">
      <circle cx="30" cy="16" r="12" fill="#FFC93C" opacity="0.5" />
      <rect x="6" y="26" width="48" height="24" rx="6" fill="#B86B2E" stroke="#24324A" strokeWidth="3" />
      <path d="M8 24l6-16h32l6 16z" fill="#D9853B" stroke="#24324A" strokeWidth="3" strokeLinejoin="round" />
      <path d="M22 18l8-10 8 10" fill="#2BB3A3" stroke="#24324A" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  done: number;
  total: number;
  opened: boolean;
  opening: boolean;
  offset: number;
  onOpen: () => void;
};

/** The reward at the end of the path. It unlocks once every task today is done. */
export function DailyChest({ done, total, opened, opening, offset, onOpen }: Props) {
  const ready = total > 0 && done === total && !opened;

  let art;
  let line;
  if (opened) {
    art = <OpenChest />;
    line = <span className="text-[13px] font-bold text-teal-shadow">+25 XP and a streak freeze</span>;
  } else if (ready) {
    art = (
      <button
        type="button"
        onClick={onOpen}
        disabled={opening}
        aria-label="Open daily chest"
        className="press flex h-16 w-[68px] items-center justify-center"
      >
        <ClosedChest wiggle={!opening} />
      </button>
    );
    line = <span className="text-[13px] font-bold text-coral-shadow">{opening ? 'Opening…' : 'Ready! Tap to open'}</span>;
  } else {
    art = (
      <div className="opacity-55">
        <ClosedChest wiggle={false} />
      </div>
    );
    line = <span className="text-[13px] font-bold text-muted">{`${done} of ${total} done · finish all to open`}</span>;
  }

  return (
    <div className="flex items-center gap-3.5" style={{ paddingLeft: offset }}>
      <div className="flex h-16 w-[68px] shrink-0 items-center justify-center">{art}</div>
      <div className="flex flex-col">
        <span className="text-[17px] font-extrabold">Daily chest</span>
        {line}
      </div>
    </div>
  );
}
