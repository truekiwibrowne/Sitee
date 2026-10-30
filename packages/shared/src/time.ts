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
