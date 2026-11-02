import { z } from 'zod';
import { id, localDate, timestamp, timeOfDay } from './common.js';
import { roleSchema } from './people.js';
import { weekdayOf } from './time.js';

// Forms (task templates): what to fill in, who fills it in, for which projects, and when.
// Company admins build these in the app (Admin → Forms).

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

export const FORM_CATEGORIES = ['dailyReport', 'toolboxTalk', 'quality', 'healthSafety', 'environment', 'audit', 'other'] as const;
export type FormCategory = (typeof FORM_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<FormCategory, string> = {
  dailyReport: 'Daily report',
  toolboxTalk: 'Toolbox talk',
  quality: 'Quality inspection',
  healthSafety: 'Health & safety inspection',
  environment: 'Environmental inspection',
  audit: 'Audit',
  other: 'Other',
};

/**
 * How often tasks are created from a form. daily/workday run every (work) day; weekly on
 * `weekdays`; monthly on `monthDays`; yearly on `yearDates`; once on `onceDate`;
 * onDemand forms are assigned by hand (e.g. a hold point when the rebar is ready).
 */
export const FREQUENCIES = ['daily', 'workday', 'weekly', 'monthly', 'yearly', 'once', 'onDemand'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Every day',
  workday: 'Every work day (Mon–Sat)',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  once: 'Once',
  onDemand: 'As needed (assigned by hand)',
};

/** levelAbove: reviewed by the role above (foreman → site manager → project manager …). none: XP straight away. */
export const REVIEW_RULES = ['levelAbove', 'none'] as const;

/** A task from this template stays locked until a same-day task from `templateId` reaches `status`. */
export const unlockRuleSchema = z.object({
  templateId: id,
  status: z.enum(['submitted', 'reviewed']),
});
export type UnlockRule = z.infer<typeof unlockRuleSchema>;

const monthDate = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Expected MM-DD');

/** Forms saved before the forms builder (single dueTime, older names) still read correctly. */
function upgradeLegacy(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const v = { ...(input as Record<string, unknown>) };
  if (!('dueTimes' in v)) v.dueTimes = typeof v.dueTime === 'string' ? [v.dueTime] : [];
  delete v.dueTime;
  if (v.frequency === 'perHoldPoint') v.frequency = 'onDemand';
  if (v.reviewRule === 'siteManager' || v.reviewRule === 'siteManagerPlusCrossSite') v.reviewRule = 'levelAbove';
  if (!('category' in v)) {
    const name = String(v.name ?? '');
    v.category = /daily.*report/i.test(name) ? 'dailyReport' : /hold point|inspection/i.test(name) ? 'quality' : 'other';
  }
  v.projectIds ??= [];
  v.weekdays ??= [];
  v.monthDays ??= [];
  v.yearDates ??= [];
  v.onceDate ??= null;
  v.countsForStreak ??=
    v.category === 'dailyReport' && (v.frequency === 'daily' || v.frequency === 'workday') && (v.dueTimes as unknown[]).length > 0;
  return v;
}

/** A form's fields and settings, as the builder edits them. */
export const templateBodySchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum(FORM_CATEGORIES),
  /** Optional standard reference, e.g. "ISO 45001 §5.4". */
  standardRef: z.string().max(80).optional(),
  role: roleSchema,
  /** Projects this form runs on. Empty = every project. */
  projectIds: z.array(id),
  frequency: z.enum(FREQUENCIES),
  /** Project-local due times. One task per time on each day the form runs. Empty = any time that day. */
  dueTimes: z.array(timeOfDay).max(12),
  /** Weekly: 0 = Sunday … 6 = Saturday. */
  weekdays: z.array(z.number().int().min(0).max(6)),
  /** Monthly: day numbers; 31 means the last day in shorter months. */
  monthDays: z.array(z.number().int().min(1).max(31)),
  /** Yearly: "MM-DD". */
  yearDates: z.array(monthDate),
  onceDate: localDate.nullable(),
  /** Base XP before stars, earliness and speed. */
  xp: z.number().int().min(0).max(500),
  reviewRule: z.enum(REVIEW_RULES),
  /** Missing this form's due time breaks the person's streak (usually just the daily report). */
  countsForStreak: z.boolean(),
  unlockRules: z.array(unlockRuleSchema),
  fields: z
    .array(templateFieldSchema)
    .min(1)
    .max(60)
    .refine((fs) => new Set(fs.map((f) => f.id)).size === fs.length, 'Field ids must be unique'),
  active: z.boolean(),
});

// orgs/{orgId}/taskTemplates/{templateId}
export const taskTemplateSchema = z.preprocess(upgradeLegacy, templateBodySchema.extend({ createdAt: timestamp }));
export type TaskTemplate = z.infer<typeof taskTemplateSchema>;
export type TemplateBody = z.infer<typeof templateBodySchema>;

function daysInMonth(date: string): number {
  const [y = 0, m = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Whether a form creates tasks on a project-local day ("YYYY-MM-DD"). */
export function formRunsOn(t: Pick<TaskTemplate, 'frequency' | 'weekdays' | 'monthDays' | 'yearDates' | 'onceDate'>, date: string): boolean {
  switch (t.frequency) {
    case 'daily':
      return true;
    case 'workday':
      return weekdayOf(date) !== 0;
    case 'weekly':
      return t.weekdays.includes(weekdayOf(date));
    case 'monthly': {
      const day = Number(date.slice(8, 10));
      const last = daysInMonth(date);
      return t.monthDays.some((d) => Math.min(d, last) === day);
    }
    case 'yearly':
      return t.yearDates.includes(date.slice(5));
    case 'once':
      return t.onceDate === date;
    default:
      return false;
  }
}

/** Whether a form applies to a project. */
export const formAppliesTo = (t: Pick<TaskTemplate, 'projectIds'>, projectId: string) =>
  t.projectIds.length === 0 || t.projectIds.includes(projectId);

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
