import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { FieldValue, getFirestore, Timestamp, type QuerySnapshot } from 'firebase-admin/firestore';
import {
  answersSchemaFor,
  isoWeekId,
  orgSchema,
  paths,
  reportXpMultiplier,
  REVIEW_XP,
  reviewSchema,
  ROLE_LADDER,
  submissionSchema,
  taskSchema,
  taskTemplateSchema,
  userSchema,
  type Review,
  type Role,
  type Stars,
  type Submission,
  type Task,
} from '@site-streak/shared';
import { awardXp, rerankLeague, xpEarnedOn } from './xp.js';

// The task engine's reaction to a report (onSubmission) and to a review (onReview).
// Each handler is idempotent: a retried trigger finds the task already moved on and stops.

const DONE: Task['status'][] = ['submitted', 'reviewed', 'excused'];
/** A sync more than this long after capture is treated as arriving when it synced. */
const LATE_SYNC_MS = 24 * 60 * 60 * 1000;
/** With no review, a report scores as if it got two stars (×1). */
const NO_REVIEW_STARS: Stars = 2;

/** Demo sandboxes' made-up colleagues have ids like "demo-{uid}-siteManager". */
const isDemoColleague = (orgId: string, uid: string) => uid.startsWith(`${orgId}-`);

/** When a report counts as sent: when it was captured, unless it synced more than a day later. */
function sentAt(sub: Submission): number {
  const captured = sub.capturedAt.toMillis();
  return sub.syncedAt.toMillis() - captured > LATE_SYNC_MS ? sub.syncedAt.toMillis() : captured;
}

/** Stars × earliness (against the task's own due time) × speed. */
function scoreReport(sub: Submission, task: Task, stars: Stars) {
  const minutesBeforeDue = task.dueAt ? Math.floor((task.dueAt.toMillis() - sentAt(sub)) / 60_000) : null;
  return reportXpMultiplier(stars, minutesBeforeDue, sub.startedAt.toMillis(), sub.capturedAt.toMillis());
}

/**
 * Who reviews a report: someone in the role above the author, covering the task's zone
 * (site managers) or project (everyone else). If that level is empty, the next one up.
 */
function findReviewer(projectMembers: QuerySnapshot, task: Task, authorId: string, authorRole: Role) {
  const above = ROLE_LADDER.slice(ROLE_LADDER.indexOf(authorRole as (typeof ROLE_LADDER)[number]) + 1);
  for (const role of above) {
    const match = projectMembers.docs.find((m) => {
      if (m.id === authorId || m.get('role') !== role) return false;
      if (role === 'siteManager' && task.zoneId) return (m.get('zoneIds') as string[]).includes(task.zoneId);
      return true;
    });
    if (match) return match.id;
  }
  return null;
}

export async function handleSubmission(orgId: string, submissionId: string) {
  const db = getFirestore();
  const parsed = submissionSchema.safeParse((await db.doc(`${paths.submissions(orgId)}/${submissionId}`).get()).data());
  if (!parsed.success) {
    logger.warn('Malformed submission, skipping', { orgId, submissionId, issues: parsed.error.issues });
    return;
  }
  const sub = parsed.data;
  const taskRef = db.doc(`${paths.tasks(orgId)}/${sub.taskId}`);

  // Today's XP so far, in case this report scores straight away (no review). Read outside the transaction.
  const firstLook = taskSchema.safeParse((await taskRef.get()).data());
  if (!firstLook.success) return;
  const earnedToday = await xpEarnedOn(orgId, sub.authorId, firstLook.data.date);

  const outcome = await db.runTransaction(async (tx) => {
    // Reads first (a transaction rule).
    const [taskSnap, orgSnap] = await Promise.all([tx.get(taskRef), tx.get(db.doc(paths.org(orgId)))]);
    const task = taskSchema.parse(taskSnap.data());
    if (task.status !== 'open' && task.status !== 'late') return null; // Already handled.
    const org = orgSchema.parse(orgSnap.data());
    const [templateSnap, authorSnap, projectMembers, dependents] = await Promise.all([
      task.templateId ? tx.get(db.doc(`${paths.taskTemplates(orgId)}/${task.templateId}`)) : Promise.resolve(null),
      tx.get(db.doc(`${paths.users(orgId)}/${sub.authorId}`)),
      tx.get(db.collection(paths.users(orgId)).where('projectIds', 'array-contains', task.projectId)),
      tx.get(db.collection(paths.tasks(orgId)).where('dependsOn', 'array-contains', sub.taskId)),
    ]);
    const template = templateSnap?.exists ? taskTemplateSchema.parse(templateSnap.data()) : null;
    const author = userSchema.parse(authorSnap.data());

    // A dependent unlocks once all of its prerequisites are done; read the others now.
    const otherDepIds = new Set(
      dependents.docs.flatMap((d) => (d.get('dependsOn') as string[]).filter((id) => id !== sub.taskId)),
    );
    const otherDeps = new Map(
      await Promise.all(
        [...otherDepIds].map(async (id) => [id, (await tx.get(db.doc(`${paths.tasks(orgId)}/${id}`))).get('status')] as const),
      ),
    );

    if (template && !answersSchemaFor(template.fields).safeParse(sub.answers).success) {
      // The phone checks answers too; the reviewer will see what's missing.
      logger.warn('Submission answers do not match the template', { orgId, submissionId });
    }

    // Streak: an on-time report from a streak form counts once per day.
    const onTime = task.dueAt !== null && sentAt(sub) <= task.dueAt.toMillis();
    if (template?.countsForStreak && onTime && author.lastReportDate !== task.date) {
      tx.update(authorSnap.ref, { streak: author.streak + 1, lastReportDate: task.date });
    }

    for (const d of dependents.docs) {
      const deps = d.get('dependsOn') as string[];
      const ready = deps.every((id) => id === sub.taskId || DONE.includes(otherDeps.get(id) as Task['status']));
      if (d.get('status') === 'locked' && ready) tx.update(d.ref, { status: 'open' });
    }

    const reviewerId = template?.reviewRule === 'none' ? null : findReviewer(projectMembers, task, sub.authorId, author.role);

    // No reviewer: scores straight away at two stars, with the earliness and speed bonuses.
    if (!reviewerId) {
      const xp = scoreReport(sub, task, NO_REVIEW_STARS);
      awardXp(tx, {
        orgId,
        eventId: `auto_${sub.taskId}`,
        userId: sub.authorId,
        tier: author.league,
        source: 'review',
        base: task.xp,
        multiplier: xp.multiplier,
        breakdown: xp.breakdown,
        date: task.date,
        dailyCap: org.dailyXpCap,
        earnedToday,
        taskId: sub.taskId,
        reviewId: null,
      });
      tx.update(taskRef, { status: 'reviewed', submissionId });
      return { reviewTaskId: null, reviewerId: null, demo: org.demo, scored: true, date: task.date };
    }

    tx.update(taskRef, { status: 'submitted', submissionId });
    const reviewTaskId = `review_${sub.taskId}`;
    tx.set(db.doc(`${paths.tasks(orgId)}/${reviewTaskId}`), {
      kind: 'review',
      title: `Review ${author.name.split(' ')[0]}'s ${task.title.toLowerCase()}`,
      templateId: null,
      assigneeId: reviewerId,
      assignedById: null,
      zoneId: task.zoneId,
      projectId: task.projectId,
      date: task.date,
      dueAt: null,
      status: 'open',
      dependsOn: [],
      parentTaskId: null,
      order: 0,
      xp: REVIEW_XP,
      submissionId,
      createdAt: FieldValue.serverTimestamp(),
    } satisfies Omit<Task, 'createdAt'> & { createdAt: FieldValue });
    return { reviewTaskId, reviewerId, demo: org.demo, scored: false, date: task.date };
  });

  if (outcome?.scored) await rerankLeague(orgId, isoWeekId(outcome.date));

  // In demo sandboxes the made-up reviewer reviews straight away, so visitors see XP land.
  if (outcome?.demo && outcome.reviewTaskId && outcome.reviewerId && isDemoColleague(orgId, outcome.reviewerId)) {
    const review: Omit<Review, 'createdAt'> & { createdAt: Timestamp } = {
      submissionId,
      taskId: sub.taskId,
      reviewerId: outcome.reviewerId,
      authorId: sub.authorId,
      stars: Math.random() < 0.7 ? 3 : 2,
      checks: { photosMatchWork: 'yes' },
      comment: 'Nice work. Clear photos and a complete report.',
      crossSite: false,
      auditedBy: null,
      createdAt: Timestamp.now(),
    };
    await db.doc(`${paths.reviews(orgId)}/${outcome.reviewTaskId}`).create(review);
  }
}

export async function handleReview(orgId: string, reviewId: string) {
  const db = getFirestore();
  const parsed = reviewSchema.safeParse((await db.doc(`${paths.reviews(orgId)}/${reviewId}`).get()).data());
  if (!parsed.success) {
    logger.warn('Malformed review, skipping', { orgId, reviewId, issues: parsed.error.issues });
    return;
  }
  const review = parsed.data;
  const reviewTaskRef = db.doc(`${paths.tasks(orgId)}/${reviewId}`);
  const authorTaskRef = db.doc(`${paths.tasks(orgId)}/${review.taskId}`);

  const authorTask = taskSchema.parse((await authorTaskRef.get()).data());
  const sub = submissionSchema.parse((await db.doc(`${paths.submissions(orgId)}/${review.submissionId}`).get()).data());
  const xp = scoreReport(sub, authorTask, review.stars);
  const date = authorTask.date;

  // The daily cap needs today's totals; aggregations can't run inside the transaction.
  const [authorEarned, reviewerEarned] = await Promise.all([
    xpEarnedOn(orgId, review.authorId, date),
    xpEarnedOn(orgId, review.reviewerId, date),
  ]);

  const awarded = await db.runTransaction(async (tx) => {
    const [reviewTaskSnap, authorTaskSnap, orgSnap, authorSnap, reviewerSnap] = await Promise.all([
      tx.get(reviewTaskRef),
      tx.get(authorTaskRef),
      tx.get(db.doc(paths.org(orgId))),
      tx.get(db.doc(`${paths.users(orgId)}/${review.authorId}`)),
      tx.get(db.doc(`${paths.users(orgId)}/${review.reviewerId}`)),
    ]);
    const reviewTask = taskSchema.parse(reviewTaskSnap.data());
    if (reviewTask.status === 'reviewed') return null; // Already handled.
    const task = taskSchema.parse(authorTaskSnap.data());
    const org = orgSchema.parse(orgSnap.data());
    const author = userSchema.parse(authorSnap.data());
    const reviewer = userSchema.parse(reviewerSnap.data());

    const common = { orgId, date, dailyCap: org.dailyXpCap, reviewId };
    const toAuthor = awardXp(tx, {
      ...common,
      eventId: `${reviewId}_author`,
      userId: review.authorId,
      tier: author.league,
      source: 'review',
      base: task.xp,
      multiplier: xp.multiplier,
      breakdown: xp.breakdown,
      earnedToday: authorEarned,
      taskId: review.taskId,
    });
    const toReviewer = awardXp(tx, {
      ...common,
      eventId: `${reviewId}_reviewer`,
      userId: review.reviewerId,
      tier: reviewer.league,
      source: 'reviewGiven',
      base: reviewTask.xp,
      multiplier: 1,
      earnedToday: reviewerEarned,
      taskId: reviewId,
    });
    tx.update(reviewTaskRef, { status: 'reviewed' });
    tx.update(authorTaskRef, { status: 'reviewed' });
    return { toAuthor, toReviewer };
  });

  if (awarded) {
    await rerankLeague(orgId, isoWeekId(date));
    logger.info('Review scored', { orgId, reviewId, stars: review.stars, ...awarded });
  }
}

export const onSubmission = onDocumentCreated('orgs/{orgId}/submissions/{submissionId}', (event) =>
  handleSubmission(event.params.orgId, event.params.submissionId),
);

export const onReview = onDocumentCreated('orgs/{orgId}/reviews/{reviewId}', (event) =>
  handleReview(event.params.orgId, event.params.reviewId),
);
