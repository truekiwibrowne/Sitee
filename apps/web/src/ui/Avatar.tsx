import type { CharacterId } from '@site-streak/shared';
import { Character } from './Brix';

/** Someone's chosen character, standing still (for lists and pickers). */
export function Avatar({ id, size = 56 }: { id: CharacterId; size?: number }) {
  return <Character id={id} mood="still" size={size} />;
}
