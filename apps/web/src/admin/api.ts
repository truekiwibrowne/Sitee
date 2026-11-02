import { httpsCallable } from 'firebase/functions';
import type { Role } from '@site-streak/shared';
import { auth, functions } from '../lib/firebase';

// The company and people functions (functions/src/admin.ts). Their error messages are
// written for people, so they're shown as they are.

type Places = { projectIds: string[]; zoneIds: string[] };

export const createCompany = httpsCallable<{ companyName: string; yourName: string }, { orgId: string }>(functions, 'createCompany');
export const claimInvite = httpsCallable<void, { orgId: string; already: boolean }>(functions, 'claimInvite');
export const inviteMember = httpsCallable<{ email: string; name: string; role: Role } & Places, { email: string }>(functions, 'inviteMember');
export const cancelInvite = httpsCallable<{ email: string }, { email: string }>(functions, 'cancelInvite');
export const updateMember = httpsCallable<{ uid: string; role: Role } & Places, { uid: string }>(functions, 'updateMember');
export const removeMember = httpsCallable<{ uid: string }, { uid: string }>(functions, 'removeMember');

/** The function's own message, or a fallback when there's no signal. */
export function messageOf(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e.code === 'functions/unavailable' || e.code === 'functions/internal') return 'No signal, or the server is busy. Try again in a moment.';
  return e.message || 'Something went wrong. Please try again.';
}

/** Picks up new role claims straight after a function changed them. */
export const refreshClaims = () => auth.currentUser?.getIdToken(true);
