// Date helpers for Monday–Sunday weeks. Dates are 'YYYY-MM-DD' strings and all
// arithmetic is done in UTC, so the viewer's time zone and DST never shift a day.

/** Widest range the grid renders at once. The API allows more. */
export const MAX_WEEKS = 26

export type WeekRange = {
  /** Monday of the first week. */
  from: string
  /** Sunday of the last week. */
  to: string
}

const DAY_MS = 86_400_000

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** True for a real calendar date in a plausible year, as typed into a date input. */
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = parse(date)
  const year = parsed.getUTCFullYear()
  return !Number.isNaN(parsed.getTime()) && format(parsed) === date && year >= 2000 && year <= 2100
}

export function addDays(date: string, days: number): string {
  return format(new Date(parse(date).getTime() + days * DAY_MS))
}

export function startOfWeek(date: string): string {
  const daysSinceMonday = (parse(date).getUTCDay() + 6) % 7
  return addDays(date, -daysSinceMonday)
}

export function endOfWeek(date: string): string {
  return addDays(startOfWeek(date), 6)
}

export function weekCount({ from, to }: WeekRange): number {
  return Math.round((parse(to).getTime() - parse(from).getTime() + DAY_MS) / (7 * DAY_MS))
}

/** ISO 8601 week number: the week belongs to the year its Thursday is in. */
export function isoWeek(monday: string): number {
  const thursday = parse(addDays(monday, 3))
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.floor((thursday.getTime() - jan1) / (7 * DAY_MS)) + 1
}

export function rangeOf(from: string, to: string): WeekRange {
  return { from: startOfWeek(from), to: endOfWeek(to) }
}

export function shiftRange(range: WeekRange, weeks: number): WeekRange {
  return { from: addDays(range.from, weeks * 7), to: addDays(range.to, weeks * 7) }
}

/** Moves the start. The end follows only when it would be before the start or too far away. */
export function withFrom(range: WeekRange, date: string): WeekRange {
  const from = startOfWeek(date)
  let to = range.to < from ? endOfWeek(from) : range.to
  if (weekCount({ from, to }) > MAX_WEEKS) to = addDays(from, MAX_WEEKS * 7 - 1)
  return { from, to }
}

/** Moves the end. The start follows only when it would be after the end or too far away. */
export function withTo(range: WeekRange, date: string): WeekRange {
  const to = endOfWeek(date)
  let from = range.from > to ? startOfWeek(to) : range.from
  if (weekCount({ from, to }) > MAX_WEEKS) from = addDays(to, -(MAX_WEEKS * 7 - 1))
  return { from, to }
}

/** The range in `?from=&to=`, or null when it's missing, malformed or too wide. */
export function rangeFromSearch(search: string): WeekRange | null {
  const params = new URLSearchParams(search)
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  if (!isValidDate(from) || !isValidDate(to) || to < from) return null
  const range = rangeOf(from, to)
  return weekCount(range) <= MAX_WEEKS ? range : null
}

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "29 Dec" */
export function formatDayMonth(date: string): string {
  return dayMonth.format(parse(date))
}

/** "29 Dec 2025 – 18 Jan 2026" */
export function formatRange({ from, to }: WeekRange): string {
  return `${dayMonthYear.format(parse(from))} – ${dayMonthYear.format(parse(to))}`
}

/** Today in the viewer's own calendar, as 'YYYY-MM-DD'. */
export function localToday(): string {
  const now = new Date()
  return format(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}
