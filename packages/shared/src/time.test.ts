import { describe, expect, it } from 'vitest';
import { formatTimeOfDay, isoWeekId, isWorkday, localDateIn, localMinutesIn, minutesOf, zonedTimeToUtc } from './time.js';

describe('site-local time', () => {
  // 21:30 UTC on 30 Oct is already 31 Oct in Kampala (UTC+3).
  const lateEvening = new Date(Date.UTC(2026, 9, 30, 21, 30));

  it('uses the site timezone for the date', () => {
    expect(localDateIn('Africa/Kampala', lateEvening)).toBe('2026-10-31');
    expect(localDateIn('UTC', lateEvening)).toBe('2026-10-30');
  });

  it('uses the site timezone for the time', () => {
    expect(localMinutesIn('Africa/Kampala', lateEvening)).toBe(30); // 00:30
  });

  it('parses and formats due times', () => {
    expect(minutesOf('18:00')).toBe(1080);
    expect(formatTimeOfDay('18:00')).toBe('6 pm');
    expect(formatTimeOfDay('07:30')).toBe('7:30 am');
    expect(formatTimeOfDay('00:00')).toBe('12 am');
  });
});

describe('isoWeekId', () => {
  it('numbers weeks the ISO way', () => {
    expect(isoWeekId('2026-10-30')).toBe('2026-W44');
    // 1 Jan 2027 is a Friday, so it still belongs to 2026's last week.
    expect(isoWeekId('2027-01-01')).toBe('2026-W53');
    expect(isoWeekId('2026-01-01')).toBe('2026-W01');
  });
});

describe('zonedTimeToUtc', () => {
  it('turns a site-local due time into the real instant', () => {
    // 18:00 in Kampala (UTC+3) is 15:00 UTC.
    expect(new Date(zonedTimeToUtc('2026-10-30', '18:00', 'Africa/Kampala')).toISOString()).toBe('2026-10-30T15:00:00.000Z');
    // 18:00 in Auckland during daylight saving (UTC+13) is 05:00 UTC the same day.
    expect(new Date(zonedTimeToUtc('2026-10-30', '18:00', 'Pacific/Auckland')).toISOString()).toBe('2026-10-30T05:00:00.000Z');
  });
});

describe('isWorkday', () => {
  it('is Monday to Saturday', () => {
    expect(isWorkday('2026-10-31')).toBe(true); // Saturday
    expect(isWorkday('2026-11-01')).toBe(false); // Sunday
  });
});
