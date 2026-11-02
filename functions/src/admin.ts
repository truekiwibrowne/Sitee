import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  DEFAULT_TEMPLATES,
  invitePath,
  inviteSchema,
  isRole,
  paths,
  type Role,
  type UserDoc,
} from '@site-streak/shared';

// Companies and their people. Roles live in Auth custom claims, which only the Admin SDK
// can set, so every change to who's in a company and what they can do goes through here.

/** New companies per day (UTC), so a bot can't fill the database. */
const DAILY_COMPANY_CAP = 50;

type Claims = { orgId?: string; role?: Role };

function signedInWithEmail(request: CallableRequest) {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token.firebase.sign_in_provider === 'anonymous') {
    throw new HttpsError('failed-precondition', 'Create an account first. Demo visitors can’t do this.');
  }
  const email = auth.token.email?.toLowerCase();
  if (!email) throw new HttpsError('failed-precondition', 'Your account needs an email address.');
  return { uid: auth.uid, email, verified: auth.token.email_verified === true, claims: auth.token as Claims };
}

function requireAdmin(request: CallableRequest): { uid: string; orgId: string } {
  const claims = request.auth?.token as Claims | undefined;
  if (!request.auth || !claims?.orgId || claims.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only your company admin can do this.');
  }
  return { uid: request.auth.uid, orgId: claims.orgId };
}

function cleanName(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) {
    throw new HttpsError('invalid-argument', `Enter ${what} (up to 80 characters).`);
  }
  return value.trim();
}

/** Checks every project and zone id belongs to this company. */
async function checkPlaces(orgId: string, projectIds: unknown, zoneIds: unknown): Promise<{ projectIds: string[]; zoneIds: string[] }> {
  const asIds = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);
  const projects = asIds(projectIds);
  const zones = asIds(zoneIds);
  if (!projects || !zones || projects.length > 50 || zones.length > 100) {
    throw new HttpsError('invalid-argument', 'Pick projects and zones from the list.');
  }
  const db = getFirestore();
  const refs = [
    ...projects.map((id) => db.doc(`${paths.projects(orgId)}/${id}`)),
    ...zones.map((id) => db.doc(`${paths.zones(orgId)}/${id}`)),
  ];
  const snaps = refs.length ? await db.getAll(...refs) : [];
  if (snaps.some((s) => !s.exists)) throw new HttpsError('invalid-argument', 'One of those projects or zones no longer exists.');
  return { projectIds: projects, zoneIds: zones };
}

function newMember(fields: Pick<UserDoc, 'name' | 'email' | 'role' | 'projectIds' | 'zoneIds'>) {
  return {
    ...fields,
    avatar: 'brix',
    xpTotal: 0,
    streak: 0,
    streakFreezes: 0,
    league: 'bronze',
    reviewAccuracy: null,
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** Anyone signed in (not a demo visitor, not already in a company) can start a company and becomes its admin. */
export const createCompany = onCall(async (request) => {
  const me = signedInWithEmail(request);
  if (me.claims.orgId) throw new HttpsError('failed-precondition', 'You’re already in a company.');
  const data = (request.data ?? {}) as { companyName?: unknown; yourName?: unknown };
  const companyName = cleanName(data.companyName, 'your company name');
  const yourName = cleanName(data.yourName, 'your name');

  const db = getFirestore();
  const counter = db.doc(`companyStats/${new Date().toISOString().slice(0, 10)}`);
  const orgRef = db.collection('orgs').doc();
  await db.runTransaction(async (tx) => {
    const made = ((await tx.get(counter)).get('companies') as number | undefined) ?? 0;
    if (made >= DAILY_COMPANY_CAP) throw new HttpsError('resource-exhausted', 'Too many new companies today. Please try tomorrow.');
    tx.set(counter, { companies: made + 1 }, { merge: true });
    tx.set(orgRef, { name: companyName, dailyXpCap: 300, demo: false, createdAt: FieldValue.serverTimestamp() });
    for (const [id, template] of Object.entries(DEFAULT_TEMPLATES)) {
      tx.set(db.doc(`${paths.taskTemplates(orgRef.id)}/${id}`), { ...template, createdAt: FieldValue.serverTimestamp() });
    }
    tx.set(
      db.doc(`${paths.users(orgRef.id)}/${me.uid}`),
      newMember({ name: yourName, email: me.email, role: 'admin', projectIds: [], zoneIds: [] }),
    );
  });
  await getAuth().setCustomUserClaims(me.uid, { orgId: orgRef.id, role: 'admin' });
  return { orgId: orgRef.id };
});

/** Admin: invite someone by email with a role, projects and zones. They join when they next sign in. */
export const inviteMember = onCall(async (request) => {
  const admin = requireAdmin(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpsError('invalid-argument', 'That email address doesn’t look right.');
  if (!isRole(data.role)) throw new HttpsError('invalid-argument', 'Pick a role.');
  const name = cleanName(data.name, 'their name');
  const places = await checkPlaces(admin.orgId, data.projectIds, data.zoneIds);

  const db = getFirestore();
  const org = await db.doc(paths.org(admin.orgId)).get();
  const invite = inviteSchema.omit({ createdAt: true }).parse({
    orgId: admin.orgId,
    orgName: org.get('name') as string,
    email,
    name,
    role: data.role,
    ...places,
    invitedById: admin.uid,
  });
  await db.doc(invitePath(email)).set({ ...invite, createdAt: FieldValue.serverTimestamp() });
  return { email };
});

/** Admin: withdraw an invite that hasn't been claimed. */
export const cancelInvite = onCall(async (request) => {
  const admin = requireAdmin(request);
  const email = String((request.data as { email?: unknown } | null)?.email ?? '').toLowerCase();
  const ref = getFirestore().doc(invitePath(email));
  const snap = await ref.get();
  if (snap.get('orgId') !== admin.orgId) throw new HttpsError('not-found', 'No invite for that email.');
  await ref.delete();
  return { email };
});

/** First sign-in: if there's an invite for my (verified) email, join that company. */
export const claimInvite = onCall(async (request) => {
  const me = signedInWithEmail(request);
  if (me.claims.orgId) return { orgId: me.claims.orgId, already: true };
  if (!me.verified) throw new HttpsError('failed-precondition', 'Confirm your email first.', { reason: 'unverified' });

  const db = getFirestore();
  const inviteRef = db.doc(invitePath(me.email));
  const joined = await db.runTransaction(async (tx) => {
    const snap = await tx.get(inviteRef);
    if (!snap.exists) throw new HttpsError('not-found', 'No invite for your email yet.');
    const invite = inviteSchema.parse(snap.data());
    tx.set(
      db.doc(`${paths.users(invite.orgId)}/${me.uid}`),
      newMember({ name: invite.name, email: me.email, role: invite.role, projectIds: invite.projectIds, zoneIds: invite.zoneIds }),
    );
    tx.delete(inviteRef);
    return { orgId: invite.orgId, role: invite.role };
  });
  await getAuth().setCustomUserClaims(me.uid, joined);
  return { orgId: joined.orgId, already: false };
});

/** Admin: change someone's role, projects or zones. */
export const updateMember = onCall(async (request) => {
  const admin = requireAdmin(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const uid = typeof data.uid === 'string' ? data.uid : '';
  if (!isRole(data.role)) throw new HttpsError('invalid-argument', 'Pick a role.');
  if (uid === admin.uid && data.role !== 'admin') {
    throw new HttpsError('failed-precondition', 'You can’t remove your own admin role. Make someone else admin first.');
  }
  const places = await checkPlaces(admin.orgId, data.projectIds, data.zoneIds);
  const ref = getFirestore().doc(`${paths.users(admin.orgId)}/${uid}`);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'That person isn’t in your company.');
  await ref.update({ role: data.role, ...places });
  await getAuth().setCustomUserClaims(uid, { orgId: admin.orgId, role: data.role });
  return { uid };
});

/** Admin: remove someone from the company. Their past reports stay. */
export const removeMember = onCall(async (request) => {
  const admin = requireAdmin(request);
  const uid = String((request.data as { uid?: unknown } | null)?.uid ?? '');
  if (uid === admin.uid) throw new HttpsError('failed-precondition', 'You can’t remove yourself.');
  const ref = getFirestore().doc(`${paths.users(admin.orgId)}/${uid}`);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'That person isn’t in your company.');
  await ref.delete();
  await getAuth().setCustomUserClaims(uid, null);
  return { uid };
});
