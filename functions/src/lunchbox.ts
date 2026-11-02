import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import {
  isoWeekId,
  localDateIn,
  LUNCHBOX_XP,
  MAX_STREAK_FREEZES,
  orgSchema,
  paths,
  projectSchema,
  userSchema,
  type Task,
} from '@site-streak/shared';
import { awardXp, rerankLeague, xpEarnedOn } from './xp.js';

const DONE: Task['status'][] = ['submitted', 'reviewed', 'excused'];

/** Opens today's lunchbox if every task is done: +25 XP and a streak freeze. */
export async function openLunchboxFor(orgId: string, uid: string, now: Date = new Date()) {
  const db = getFirestore();
  const userRef = db.doc(`${paths.users(orgId)}/${uid}`);
  const user = userSchema.parse((await userRef.get()).data());
  const projectId = user.projectIds[0];
  if (!projectId) throw new HttpsError('failed-precondition', 'You’re not on a project yet.');
  const project = projectSchema.parse((await db.doc(`${paths.projects(orgId)}/${projectId}`).get()).data());
  const today = localDateIn(project.timezone, now);

  const tasks = await db.collection(paths.tasks(orgId)).where('assigneeId', '==', uid).where('date', '==', today).get();
  const mine = tasks.docs.filter((d) => d.get('kind') !== 'review');
  if (mine.length === 0 || !mine.every((d) => DONE.includes(d.get('status') as Task['status']))) {
    throw new HttpsError('failed-precondition', 'Finish all of today’s tasks to open your lunchbox.');
  }
  const earnedToday = await xpEarnedOn(orgId, uid, today);

  const result = await db.runTransaction(async (tx) => {
    const [userSnap, orgSnap] = await Promise.all([tx.get(userRef), tx.get(db.doc(paths.org(orgId)))]);
    const fresh = userSchema.parse(userSnap.data());
    if (fresh.lunchboxOpenedOn === today) throw new HttpsError('already-exists', 'You’ve already opened today’s lunchbox.');
    const org = orgSchema.parse(orgSnap.data());
    const xp = awardXp(tx, {
      orgId,
      eventId: `lunchbox_${uid}_${today}`,
      userId: uid,
      tier: fresh.league,
      source: 'lunchbox',
      base: LUNCHBOX_XP,
      multiplier: 1,
      date: today,
      dailyCap: org.dailyXpCap,
      earnedToday,
      taskId: null,
      reviewId: null,
    });
    const gotFreeze = fresh.streakFreezes < MAX_STREAK_FREEZES;
    tx.update(userRef, {
      lunchboxOpenedOn: today,
      ...(gotFreeze ? { streakFreezes: fresh.streakFreezes + 1 } : {}),
    });
    return { xp, gotFreeze };
  });

  await rerankLeague(orgId, isoWeekId(today));
  return result;
}

export const openLunchbox = onCall(async (request) => {
  const orgId = request.auth?.token.orgId as string | undefined;
  if (!request.auth || !orgId) throw new HttpsError('unauthenticated', 'Sign in first.');
  return openLunchboxFor(orgId, request.auth.uid);
});
