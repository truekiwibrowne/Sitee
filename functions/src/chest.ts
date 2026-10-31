import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import {
  CHEST_XP,
  isoWeekId,
  localDateIn,
  MAX_STREAK_FREEZES,
  orgSchema,
  paths,
  siteSchema,
  userSchema,
  type Task,
} from '@site-streak/shared';
import { awardXp, rerankLeague, xpEarnedOn } from './xp.js';

const DONE: Task['status'][] = ['submitted', 'reviewed', 'excused'];

/** Opens today's chest if every task is done: +25 XP and a streak freeze. */
export async function openChestFor(orgId: string, uid: string, now: Date = new Date()) {
  const db = getFirestore();
  const userRef = db.doc(`${paths.users(orgId)}/${uid}`);
  const user = userSchema.parse((await userRef.get()).data());
  const siteId = user.siteIds[0];
  if (!siteId) throw new HttpsError('failed-precondition', 'You’re not on a site yet.');
  const site = siteSchema.parse((await db.doc(`${paths.sites(orgId)}/${siteId}`).get()).data());
  const today = localDateIn(site.timezone, now);

  const tasks = await db.collection(paths.tasks(orgId)).where('assigneeId', '==', uid).where('date', '==', today).get();
  const mine = tasks.docs.filter((d) => d.get('kind') !== 'review');
  if (mine.length === 0 || !mine.every((d) => DONE.includes(d.get('status') as Task['status']))) {
    throw new HttpsError('failed-precondition', 'Finish all of today’s tasks to open the chest.');
  }
  const earnedToday = await xpEarnedOn(orgId, uid, today);

  const result = await db.runTransaction(async (tx) => {
    const [userSnap, orgSnap] = await Promise.all([tx.get(userRef), tx.get(db.doc(paths.org(orgId)))]);
    const fresh = userSchema.parse(userSnap.data());
    if (fresh.chestOpenedOn === today) throw new HttpsError('already-exists', 'You’ve already opened today’s chest.');
    const org = orgSchema.parse(orgSnap.data());
    const xp = awardXp(tx, {
      orgId,
      eventId: `chest_${uid}_${today}`,
      userId: uid,
      tier: fresh.league,
      source: 'chest',
      base: CHEST_XP,
      multiplier: 1,
      date: today,
      dailyCap: org.dailyXpCap,
      earnedToday,
      taskId: null,
      reviewId: null,
    });
    const gotFreeze = fresh.streakFreezes < MAX_STREAK_FREEZES;
    tx.update(userRef, {
      chestOpenedOn: today,
      ...(gotFreeze ? { streakFreezes: fresh.streakFreezes + 1 } : {}),
    });
    return { xp, gotFreeze };
  });

  await rerankLeague(orgId, isoWeekId(today));
  return result;
}

export const openChest = onCall(async (request) => {
  const orgId = request.auth?.token.orgId as string | undefined;
  if (!request.auth || !orgId) throw new HttpsError('unauthenticated', 'Sign in first.');
  return openChestFor(orgId, request.auth.uid);
});
