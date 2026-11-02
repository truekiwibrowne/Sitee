// The cast. Brix is the guide everyone sees; anyone can pick any character as their
// avatar. Add new characters here and draw them in apps/web/src/ui/characters.

export const CHARACTERS = ['brix', 'blocx'] as const;
export type CharacterId = (typeof CHARACTERS)[number];

export const CHARACTER_INFO: Record<CharacterId, { name: string; blurb: string }> = {
  brix: { name: 'Brix', blurb: 'A brick in a hard hat. Never misses a report.' },
  blocx: { name: 'Blocx', blurb: 'A concrete block. Solid, steady, unshakeable.' },
};
