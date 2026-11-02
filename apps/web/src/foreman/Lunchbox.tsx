function ClosedLunchbox({ wiggle }: { wiggle: boolean }) {
  return (
    <svg className={wiggle ? 'animate-wiggle origin-[50%_85%]' : ''} width="60" height="56" viewBox="0 0 60 56" aria-hidden="true">
      {/* Handle, lid and tin. */}
      <path d="M22 18v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6" fill="none" stroke="#24324A" strokeWidth="3" strokeLinecap="round" />
      <rect x="6" y="18" width="48" height="12" rx="5" fill="#FF7A59" stroke="#24324A" strokeWidth="3" />
      <rect x="8" y="28" width="44" height="22" rx="5" fill="#2BB3A3" stroke="#24324A" strokeWidth="3" />
      <rect x="25" y="25" width="10" height="8" rx="2" fill="#FFC93C" stroke="#24324A" strokeWidth="2.5" />
    </svg>
  );
}

function OpenLunchbox() {
  return (
    <svg className="animate-pop" width="60" height="56" viewBox="0 0 60 56" aria-hidden="true">
      <circle cx="30" cy="20" r="13" fill="#FFC93C" opacity="0.45" />
      {/* Lid flipped back, sandwich and apple inside. */}
      <path d="M8 26l4-16h36l4 16z" fill="#FF7A59" stroke="#24324A" strokeWidth="3" strokeLinejoin="round" />
      <path d="M17 30l9-9 9 9z" fill="#F6D7A7" stroke="#24324A" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="41" cy="27" r="4.5" fill="#E8483B" stroke="#24324A" strokeWidth="2.5" />
      <rect x="8" y="28" width="44" height="22" rx="5" fill="#2BB3A3" stroke="#24324A" strokeWidth="3" />
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

/** The end-of-day reward at the end of the path. It opens once every task today is done. */
export function Lunchbox({ done, total, opened, opening, offset, onOpen }: Props) {
  const ready = total > 0 && done === total && !opened;

  let art;
  let line;
  if (opened) {
    art = <OpenLunchbox />;
    line = <span className="text-[13px] font-bold text-teal-shadow">+25 XP and a streak freeze</span>;
  } else if (ready) {
    art = (
      <button
        type="button"
        onClick={onOpen}
        disabled={opening}
        aria-label="Open your lunchbox"
        className="press flex h-16 w-[68px] items-center justify-center"
      >
        <ClosedLunchbox wiggle={!opening} />
      </button>
    );
    line = <span className="text-[13px] font-bold text-coral-shadow">{opening ? 'Opening…' : 'Smoko! Tap to open'}</span>;
  } else {
    art = (
      <div className="opacity-55">
        <ClosedLunchbox wiggle={false} />
      </div>
    );
    line = <span className="text-[13px] font-bold text-muted">{`${done} of ${total} done · finish all to open`}</span>;
  }

  return (
    <div className="flex items-center gap-3.5" style={{ paddingLeft: offset }}>
      <div className="flex h-16 w-[68px] shrink-0 items-center justify-center">{art}</div>
      <div className="flex flex-col">
        <span className="text-[17px] font-extrabold">Lunchbox</span>
        {line}
      </div>
    </div>
  );
}
