import { describe, expect, it } from 'vitest';
import { timestamp } from './common.js';
import { weekId } from './game.js';
import { STARTER_FORMS } from './formLibrary.js';
import { answersSchemaFor, formRunsOn, taskTemplateSchema, templateBodySchema, type TemplateField } from './templates.js';
import { starsSchema } from './work.js';

const ts = { seconds: 1, nanoseconds: 0, toMillis: () => 1000 };

const dailyReportFields: TemplateField[] = [
  { id: 'weather', label: 'Weather', type: 'pickList', required: true, options: ['Sunny', 'Rain'] },
  { id: 'labour', label: 'Labour', type: 'number', required: true, min: 0 },
  { id: 'photos', label: 'Photos', type: 'photo', required: true, minPhotos: 3 },
  { id: 'delays', label: 'Delays', type: 'text', required: false },
  { id: 'tomorrow', label: 'Tomorrow', type: 'text', required: true },
];

const goodAnswers = {
  weather: 'Sunny',
  labour: 14,
  photos: ['p1', 'p2', 'p3'],
  delays: null,
  tomorrow: 'Pour slab B',
};

describe('answersSchemaFor', () => {
  const schema = answersSchemaFor(dailyReportFields);

  it('accepts a complete report', () => {
    expect(schema.safeParse(goodAnswers).success).toBe(true);
  });

  it('rejects an option that is not on the pick list', () => {
    expect(schema.safeParse({ ...goodAnswers, weather: 'Snow' }).success).toBe(false);
  });

  it('rejects a number below the minimum', () => {
    expect(schema.safeParse({ ...goodAnswers, labour: -1 }).success).toBe(false);
  });

  it('enforces the minimum photo count', () => {
    expect(schema.safeParse({ ...goodAnswers, photos: ['p1', 'p2'] }).success).toBe(false);
  });

  it('rejects a blank required text answer', () => {
    expect(schema.safeParse({ ...goodAnswers, tomorrow: '   ' }).success).toBe(false);
  });

  it('rejects answers for fields the template does not have', () => {
    expect(schema.safeParse({ ...goodAnswers, sneaky: 'x' }).success).toBe(false);
  });
});

describe('taskTemplateSchema', () => {
  const template = {
    name: 'Daily site report',
    role: 'foreman',
    frequency: 'workday',
    dueTime: '18:00',
    xp: 50,
    reviewRule: 'siteManager',
    unlockRules: [],
    fields: dailyReportFields,
    active: true,
    createdAt: ts,
  };

  it('accepts a valid template', () => {
    expect(taskTemplateSchema.safeParse(template).success).toBe(true);
  });

  it('rejects duplicate field ids', () => {
    const fields = [...dailyReportFields, { ...dailyReportFields[0]! }];
    expect(taskTemplateSchema.safeParse({ ...template, fields }).success).toBe(false);
  });

  it('rejects a malformed due time', () => {
    expect(taskTemplateSchema.safeParse({ ...template, dueTime: '6pm' }).success).toBe(false);
  });
});

describe('small schemas', () => {
  it('timestamp accepts SDK-style Timestamps but not Dates', () => {
    expect(timestamp.safeParse(ts).success).toBe(true);
    expect(timestamp.safeParse(new Date()).success).toBe(false);
  });

  it('stars are 1 to 3', () => {
    expect(starsSchema.safeParse(3).success).toBe(true);
    expect(starsSchema.safeParse(4).success).toBe(false);
  });

  it('weekId is an ISO week', () => {
    expect(weekId.safeParse('2026-W44').success).toBe(true);
    expect(weekId.safeParse('2026-44').success).toBe(false);
  });
});

describe('forms: schedules and the starter library', () => {
  const schedule = { weekdays: [], monthDays: [], yearDates: [], onceDate: null };

  it('runs on the right days', () => {
    // 2 Nov 2026 is a Monday; 1 Nov a Sunday; Feb 2027 has 28 days.
    expect(formRunsOn({ ...schedule, frequency: 'workday' }, '2026-11-01')).toBe(false);
    expect(formRunsOn({ ...schedule, frequency: 'weekly', weekdays: [1, 3] }, '2026-11-02')).toBe(true);
    expect(formRunsOn({ ...schedule, frequency: 'monthly', monthDays: [31] }, '2027-02-28')).toBe(true);
    expect(formRunsOn({ ...schedule, frequency: 'yearly', yearDates: ['11-02'] }, '2026-11-02')).toBe(true);
    expect(formRunsOn({ ...schedule, frequency: 'once', onceDate: '2026-11-03' }, '2026-11-02')).toBe(false);
    expect(formRunsOn({ ...schedule, frequency: 'onDemand' }, '2026-11-02')).toBe(false);
  });

  it('reads forms saved in the old format', () => {
    const old = taskTemplateSchema.parse({
      name: 'Daily site report',
      role: 'foreman',
      frequency: 'workday',
      dueTime: '18:00',
      xp: 50,
      reviewRule: 'siteManagerPlusCrossSite',
      unlockRules: [],
      fields: dailyReportFields,
      active: true,
      createdAt: ts,
    });
    expect(old).toMatchObject({ category: 'dailyReport', dueTimes: ['18:00'], reviewRule: 'levelAbove', countsForStreak: true, projectIds: [] });
  });

  it('every starter form is valid', () => {
    for (const form of Object.values(STARTER_FORMS)) expect(templateBodySchema.safeParse(form).success).toBe(true);
  });
});
