import { AggregateField, FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore';
import { capXp, isoWeekId, paths, type LeagueTier, type XpEvent } from '@site-streak/shared';

// XP is only ever written here, by Cloud Functions. Clients can't touch it (see firestore.rules).

/** XP this person has already earned on a site-local day, for the daily cap. */
export async function xpEarnedOn(orgId: string, userId: string, date: string): Promise<number> {
  const snap = await getFirestore()
    .collection(paths.xpEvents(orgId))
    .where('userId', '==', userId)
    .where('date', '==', date)
    .aggregate({ total: AggregateField.sum('amount') })
    .get();
  return snap.data().total ?? 0;
}

type Award = {
  orgId: string;
  /** Deterministic, so a retried trigger can't award twice. */
  eventId: string;
  userId: string;
  tier: LeagueTier;
  source: XpEvent['source'];
  base: number;
  multiplier: number;
  /** Site-local day the XP counts towards. */
  date: string;
  dailyCap: number;
  earnedToday: number;
  taskId: string | null;
  reviewId: string | null;
};

/**
 * Inside a transaction (after all its reads): writes the ledger entry and bumps the
 * person's total and this week's league XP. Returns the XP actually awarded.
 */
export function awardXp(tx: Transaction, a: Award): number {
  const db = getFirestore();
  const amount = capXp(Math.round(a.base * a.multiplier), a.earnedToday, a.dailyCap);
  const event: Omit<XpEvent, 'createdAt'> & { createdAt: FieldValue } = {
    userId: a.userId,
    source: a.source,
    base: a.base,
    multiplier: a.multiplier,
    amount,
    date: a.date,
    taskId: a.taskId,
    reviewId: a.reviewId,
    createdAt: FieldValue.serverTimestamp(),
  };
  // create(): fails the transaction if this award was already made.
  tx.create(db.doc(`${paths.xpEvents(a.orgId)}/${a.eventId}`), event);
  if (amount > 0) {
    tx.update(db.doc(`${paths.users(a.orgId)}/${a.userId}`), { xpTotal: FieldValue.increment(amount) });
    tx.set(
      db.doc(`${paths.leagueMembers(a.orgId, isoWeekId(a.date))}/${a.userId}`),
      { userId: a.userId, tier: a.tier, weeklyXp: FieldValue.increment(amount) },
      { merge: true },
    );
  }
  return amount;
}

/** Re-ranks a week's league table by weekly XP. Small tables, so a full pass is fine. */
export async function rerankLeague(orgId: string, weekId: string) {
  const db = getFirestore();
  const members = await db.collection(paths.leagueMembers(orgId, weekId)).get();
  const ranked = members.docs
    .map((d) => ({ ref: d.ref, weeklyXp: (d.get('weeklyXp') as number | undefined) ?? 0, rank: d.get('rank') as unknown }))
    .sort((x, y) => y.weeklyXp - x.weeklyXp);
  const batch = db.batch();
  ranked.forEach((m, i) => {
    if (m.rank !== i + 1) batch.set(m.ref, { rank: i + 1 }, { merge: true });
  });
  await batch.commit();
}

