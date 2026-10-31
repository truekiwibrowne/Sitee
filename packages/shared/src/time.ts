// Site-local time helpers. Due times, streak days and daily tasks all follow the
// site's own timezone, not the phone's or the server's.

function partsIn(timeZone: string, at: Date, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).formatToParts(at);
  return (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
}

/** The calendar day at `at` in `timeZone`, e.g. "2026-10-30". */
export function localDateIn(timeZone: string, at: Date = new Date()): string {
  const get = partsIn(timeZone, at, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes since local midnight at `at` in `timeZone`. */
export function localMinutesIn(timeZone: string, at: Date = new Date()): number {
  const get = partsIn(timeZone, at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return Number(get('hour')) * 60 + Number(get('minute'));
}

/** "18:30" → 1110 */
export function minutesOf(timeOfDay: string): number {
  const [h = 0, m = 0] = timeOfDay.split(':').map(Number);
  return h * 60 + m;
}

/** "18:00" → "6 pm", "07:30" → "7:30 am" */
export function formatTimeOfDay(timeOfDay: string): string {
  const [h = 0, m = 0] = timeOfDay.split(':').map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

/** ISO week of a "YYYY-MM-DD" day, e.g. "2026-W44". Weekly leagues key on this. */
export function isoWeekId(date: string): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  // The ISO week belongs to the year of its Thursday.
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Day of the week for a "YYYY-MM-DD" day: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Site work days, Monday to Saturday, as on most of the pilot sites. "Every work day"
 * templates only create tasks (and only count for streaks) on these days.
 */
export function isWorkday(date: string): boolean {
  return weekdayOf(date) !== 0;
}

/** The instant (epoch ms) of a site-local day and time, e.g. the report's due time. */
export function zonedTimeToUtc(date: string, timeOfDay: string, timeZone: string): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const asIfUtc = Date.UTC(y, m - 1, d) + minutesOf(timeOfDay) * 60_000;
  // What the zone's clock reads at an instant, written as if it were UTC.
  const wallClock = (ms: number) => {
    const [wy = 0, wm = 1, wd = 1] = localDateIn(timeZone, new Date(ms)).split('-').map(Number);
    return Date.UTC(wy, wm - 1, wd) + localMinutesIn(timeZone, new Date(ms)) * 60_000;
  };
  const first = asIfUtc - (wallClock(asIfUtc) - asIfUtc);
  // A second pass corrects for a daylight-saving change between the guess and the answer.
  return asIfUtc - (wallClock(first) - first);
}
