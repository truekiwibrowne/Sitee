import type { CharacterId } from '@site-streak/shared';
import { Blocx } from './Blocx';
import { Brix } from './Brix';

/** Someone's chosen character, standing still. (Brix also guides people with moods; see Brix.tsx.) */
export function Avatar({ id, size = 56 }: { id: CharacterId; size?: number }) {
  switch (id) {
    case 'blocx':
      return <Blocx size={size} />;
    default:
      return <Brix mood="still" size={size} />;
  }
}
