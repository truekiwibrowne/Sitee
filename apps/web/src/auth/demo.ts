import { signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import type { Role } from '@site-streak/shared';
import { auth, functions } from '../lib/firebase';

const callStartDemo = httpsCallable<{ role: Role; timeZone: string }, { orgId: string; role: Role }>(functions, 'startDemo');

/** Signs the visitor in anonymously and builds their private demo sandbox for `role`. */
export async function startDemo(role: Role) {
  if (!auth.currentUser) await signInAnonymously(auth);
  // The sandbox runs on the visitor's clock, so "due by 6 pm" means their 6 pm.
  await callStartDemo({ role, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  // Pick up the new orgId/role claims straight away.
  await auth.currentUser?.getIdToken(true);
}
