// The cast. Brix is the brand mascot; everyone picks a character as their avatar, and
// it guides them on their Today screen. Add new characters here, draw them in
// apps/web/src/ui/Brix.tsx (BODIES), and add the id to the avatar rule in firestore.rules.

export const CHARACTERS = ['brix', 'blocx', 'plank', 'bolt', 'mixa', 'cona'] as const;
export type CharacterId = (typeof CHARACTERS)[number];

export const CHARACTER_INFO: Record<CharacterId, { name: string; blurb: string }> = {
  brix: { name: 'Brix', blurb: 'A brick in a hard hat. Never misses a report.' },
  blocx: { name: 'Blocx', blurb: 'A concrete block. Solid, steady, unshakeable.' },
  plank: { name: 'Plank', blurb: 'A timber board. Straight, true and level-headed.' },
  bolt: { name: 'Bolt', blurb: 'A steel nut. Tightens up every loose end.' },
  mixa: { name: 'Mixa', blurb: 'A cement mixer. Always turning, never stops.' },
  cona: { name: 'Cona', blurb: 'A traffic cone. Keeps everyone safe.' },
};
