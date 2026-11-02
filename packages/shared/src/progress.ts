import { z } from 'zod';
import { id, timestamp } from './common.js';

// Earned value collections (Phase 3). Foremen log quantities, never money.

// orgs/{orgId}/boqItems/{itemId}
export const boqItemSchema = z.object({
  projectId: id,
  code: z.string().min(1),
  description: z.string().min(1),
  unit: z.string().min(1),
  qty: z.number().nonnegative(),
  rate: z.number().nonnegative(),
  plannedStart: timestamp,
  plannedFinish: timestamp,
});
export type BoqItem = z.infer<typeof boqItemSchema>;

// orgs/{orgId}/progressEntries/{entryId}
export const progressEntrySchema = z.object({
  boqItemId: id,
  zoneId: id,
  submissionId: id.nullable(),
  qtyInstalled: z.number().positive(),
  loggedById: id,
  loggedAt: timestamp,
  /** Only verified quantities count towards earned value. */
  verifiedById: id.nullable(),
  verifiedAt: timestamp.nullable(),
});
export type ProgressEntry = z.infer<typeof progressEntrySchema>;
