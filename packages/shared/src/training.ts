import { z } from 'zod';
import { id, timestamp } from './common.js';
import { roleSchema } from './people.js';

// Learning collections (Phase 2). Shapes are settled now so rules and types don't churn later.

const quizQuestionSchema = z.object({
  id,
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
});

// orgs/{orgId}/trainingModules/{moduleId}
export const trainingModuleSchema = z.object({
  title: z.string().min(1),
  role: roleSchema,
  /** Skill path this lesson belongs to, e.g. "hold-point-inspector". Lessons unlock in `order`. */
  skillPath: z.string().min(1),
  order: z.number().int().nonnegative(),
  videoPath: z.string().min(1),
  durationSec: z.number().int().positive(),
  /** Questions only. The answers live in answerKey, which clients can't read. */
  quiz: z.array(quizQuestionSchema).min(1),
  passMark: z.number().min(0).max(1),
  xp: z.number().int().nonnegative(),
  /** Badge awarded for finishing the whole path, set on the last lesson. */
  badgeId: id.nullable(),
  createdAt: timestamp,
});
export type TrainingModule = z.infer<typeof trainingModuleSchema>;

// orgs/{orgId}/trainingModules/{moduleId}/private/answerKey — read only by Cloud Functions.
export const quizAnswerKeySchema = z.object({
  correct: z.record(id, z.number().int().nonnegative()),
});

// orgs/{orgId}/trainingSessions/{sessionId}
export const trainingSessionSchema = z.object({
  title: z.string().min(1),
  moduleId: id.nullable(),
  trainerId: id,
  siteId: id,
  assignedById: id,
  startsAt: timestamp,
  endsAt: timestamp,
  /** QR check-in only works until this time. The token itself lives server-side. */
  checkInClosesAt: timestamp,
  createdAt: timestamp,
});
export type TrainingSession = z.infer<typeof trainingSessionSchema>;

// orgs/{orgId}/attendance/{sessionId_uid}
export const attendanceSchema = z.object({
  sessionId: id,
  userId: id,
  checkedInAt: timestamp,
  /** Set by the trainer's sign-off, written via Cloud Functions. */
  result: z.enum(['pending', 'competent', 'needsPractice']),
  signedOffById: id.nullable(),
  signedOffAt: timestamp.nullable(),
});
export type Attendance = z.infer<typeof attendanceSchema>;

// orgs/{orgId}/competencies/{competencyId}
export const competencySchema = z.object({
  userId: id,
  /** e.g. "hold-point-inspector". A task can require this before it unlocks. */
  badgeId: id,
  name: z.string().min(1),
  source: z.enum(['skillPath', 'signOff']),
  awardedAt: timestamp,
  expiresAt: timestamp.nullable(),
});
export type Competency = z.infer<typeof competencySchema>;
