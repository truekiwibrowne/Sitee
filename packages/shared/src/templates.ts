import { z } from 'zod';
import { id, timestamp, timeOfDay } from './common.js';
import { roleSchema } from './people.js';

const fieldBase = {
  /** Stable key used in submission answers. Never rename once reports exist. */
  id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'Use letters and digits only'),
  label: z.string().min(1),
  required: z.boolean(),
  help: z.string().optional(),
};

export const templateFieldSchema = z.discriminatedUnion('type', [
  z.object({ ...fieldBase, type: z.literal('pickList'), options: z.array(z.string().min(1)).min(2) }),
  z.object({
    ...fieldBase,
    type: z.literal('number'),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().optional(),
  }),
  z.object({ ...fieldBase, type: z.literal('text'), maxLength: z.number().int().positive().optional() }),
  z.object({
    ...fieldBase,
    type: z.literal('photo'),
    minPhotos: z.number().int().nonnegative(),
    maxPhotos: z.number().int().positive().optional(),
  }),
]);
export type TemplateField = z.infer<typeof templateFieldSchema>;
export type FieldType = TemplateField['type'];

export const FREQUENCIES = ['workday', 'daily', 'weekly', 'perHoldPoint', 'once'] as const;
export const REVIEW_RULES = ['siteManagerPlusCrossSite', 'siteManager', 'none'] as const;

/** A task from this template stays locked until a same-day task from `templateId` reaches `status`. */
export const unlockRuleSchema = z.object({
  templateId: id,
  status: z.enum(['submitted', 'reviewed']),
});
export type UnlockRule = z.infer<typeof unlockRuleSchema>;

// orgs/{orgId}/taskTemplates/{templateId}
export const taskTemplateSchema = z.object({
  name: z.string().min(1),
  role: roleSchema,
  frequency: z.enum(FREQUENCIES),
  /** Site-local due time. Missing it on a daily report breaks the streak. Null = no fixed time. */
  dueTime: timeOfDay.nullable(),
  /** Base XP before the reviewer's star multiplier. */
  xp: z.number().int().nonnegative(),
  reviewRule: z.enum(REVIEW_RULES),
  unlockRules: z.array(unlockRuleSchema),
  fields: z
    .array(templateFieldSchema)
    .min(1)
    .refine((fs) => new Set(fs.map((f) => f.id)).size === fs.length, 'Field ids must be unique'),
  active: z.boolean(),
  createdAt: timestamp,
});
export type TaskTemplate = z.infer<typeof taskTemplateSchema>;

/**
 * Answers are keyed by field id. Photo fields hold the ids of entries in the
 * submission's `photos` array, so photo counts are checked like any other answer.
 */
export type AnswerValue = string | number | string[] | null;
export type Answers = Record<string, AnswerValue>;

function answerSchemaFor(field: TemplateField): z.ZodType<AnswerValue> {
  switch (field.type) {
    case 'pickList': {
      const s = z.enum(field.options as [string, ...string[]]);
      return field.required ? s : s.nullable();
    }
    case 'number': {
      let s = z.number();
      if (field.min !== undefined) s = s.min(field.min);
      if (field.max !== undefined) s = s.max(field.max);
      return field.required ? s : s.nullable();
    }
    case 'text': {
      let s = z.string().trim();
      if (field.maxLength) s = s.max(field.maxLength);
      return field.required ? s.min(1) : s.nullable();
    }
    case 'photo': {
      let s = z.array(id).min(field.required ? Math.max(1, field.minPhotos) : field.minPhotos);
      if (field.maxPhotos) s = s.max(field.maxPhotos);
      return s;
    }
  }
}

/** Builds the validator for a submission's answers from its template's fields. */
export function answersSchemaFor(fields: TemplateField[]) {
  return z.strictObject(Object.fromEntries(fields.map((f) => [f.id, answerSchemaFor(f)])));
}
