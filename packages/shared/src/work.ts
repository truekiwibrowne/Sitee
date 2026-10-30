import { z } from 'zod';
import { gps, id, localDate, timestamp } from './common.js';

export const TASK_STATUSES = ['locked', 'open', 'submitted', 'reviewed', 'late', 'excused'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const TASK_KINDS = ['recurring', 'assigned', 'review', 'training'] as const;

// orgs/{orgId}/tasks/{taskId}
export const taskSchema = z.object({
  kind: z.enum(TASK_KINDS),
  title: z.string().min(1),
  /** Null for one-off assigned tasks that don't come from a template. */
  templateId: id.nullable(),
  assigneeId: id,
  /** Null when the daily scheduler created it. */
  assignedById: id.nullable(),
  siteId: id,
  projectId: id,
  /** Site-local day the task belongs to. */
  date: localDate,
  dueAt: timestamp.nullable(),
  status: taskStatusSchema,
  /** Task ids that must finish first (from unlock rules); shown as "waiting on…". */
  dependsOn: z.array(id),
  parentTaskId: id.nullable(),
  /** Position on the day's task path, lowest first. */
  order: z.number().int(),
  xp: z.number().int().nonnegative(),
  /** Set once submitted; for review tasks, the submission being reviewed. */
  submissionId: id.nullable(),
  createdAt: timestamp,
});
export type Task = z.infer<typeof taskSchema>;

export const photoSchema = z.object({
  id,
  fieldId: id,
  storagePath: z.string().min(1),
  /** Device clock at capture. Compared with syncedAt to flag late syncs. */
  capturedAt: timestamp,
  gps: gps.nullable(),
  /** For the duplicate-photo check. */
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
});
export type Photo = z.infer<typeof photoSchema>;

// orgs/{orgId}/submissions/{submissionId}
export const submissionSchema = z.object({
  taskId: id,
  templateId: id.nullable(),
  authorId: id,
  siteId: id,
  /** Validate against the template with answersSchemaFor(template.fields). */
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.array(id), z.null()])),
  photos: z.array(photoSchema),
  gps: gps.nullable(),
  /** When the person pressed submit on the phone (may be offline). */
  capturedAt: timestamp,
  /** Server time it reached Firestore. Set by the server, not the phone. */
  syncedAt: timestamp,
});
export type Submission = z.infer<typeof submissionSchema>;

export const starsSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

// orgs/{orgId}/reviews/{reviewId}
export const reviewSchema = z.object({
  submissionId: id,
  taskId: id,
  reviewerId: id,
  /** Hidden from cross-site reviewers until they submit. */
  authorId: id,
  stars: starsSchema,
  /** Yes/unsure/no checks, e.g. { photosMatchWork: 'yes' }. */
  checks: z.record(z.string(), z.enum(['yes', 'unsure', 'no'])),
  comment: z.string(),
  crossSite: z.boolean(),
  /** Set when someone a level up spot-checks this review. */
  auditedBy: id.nullable(),
  createdAt: timestamp,
});
export type Review = z.infer<typeof reviewSchema>;
