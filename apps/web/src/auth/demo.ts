import { signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import type { Role } from '@site-streak/shared';
import { auth, functions } from '../lib/firebase';

const callStartDemo = httpsCallable<{ role: Role }, { orgId: string; role: Role }>(functions, 'startDemo');

/** Signs the visitor in anonymously and builds their private demo sandbox for `role`. */
export async function startDemo(role: Role) {
  if (!auth.currentUser) await signInAnonymously(auth);
  await callStartDemo({ role });
  // Pick up the new orgId/role claims straight away.
  await auth.currentUser?.getIdToken(true);
}
