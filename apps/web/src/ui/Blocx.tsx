/** Blocx: a concrete block in a white hard hat. Original character art; one of the avatars people pick. */
export function Blocx({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Blocx, the concrete block" style={{ flexShrink: 0 }}>
      <ellipse cx="60" cy="113" rx="34" ry="5" fill="#24324A" opacity="0.12" />
      {/* Block body with its two hollow cores showing on top. */}
      <rect x="18" y="44" width="84" height="62" rx="12" fill="#B9C0C9" stroke="#24324A" strokeWidth="4" />
      <path d="M26 98h10M84 98h10M58 100h6" stroke="#8E97A3" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="30" cy="62" r="1.8" fill="#8E97A3" />
      <circle cx="92" cy="84" r="1.8" fill="#8E97A3" />
      {/* White hard hat. */}
      <path d="M26 50a34 28 0 0 1 68 0z" fill="#FFFFFF" stroke="#24324A" strokeWidth="4" strokeLinejoin="round" />
      <rect x="16" y="46" width="88" height="10" rx="5" fill="#FFFFFF" stroke="#24324A" strokeWidth="4" />
      <path d="M50 30h20" stroke="#2BB3A3" strokeWidth="5" strokeLinecap="round" />
      {/* Face. */}
      <rect x="35" y="64" width="18" height="14" rx="6" fill="#FFFFFF" stroke="#24324A" strokeWidth="3" />
      <rect x="67" y="64" width="18" height="14" rx="6" fill="#FFFFFF" stroke="#24324A" strokeWidth="3" />
      <circle cx="45" cy="71" r="4" fill="#24324A" />
      <circle cx="77" cy="71" r="4" fill="#24324A" />
      <circle cx="33" cy="88" r="5" fill="#FF5D7A" opacity="0.3" />
      <circle cx="87" cy="88" r="5" fill="#FF5D7A" opacity="0.3" />
      <path d="M50 88q10 8 20 0" fill="none" stroke="#24324A" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
