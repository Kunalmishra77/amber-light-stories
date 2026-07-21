/**
 * Pure scheduling logic (no DB, no server-only) so it's unit-testable and
 * reusable. Determines whether a tenant's schedule is due to run at a given
 * instant, in the tenant's own timezone. Day numbering is JS `getDay()`
 * (0=Sun..6=Sat) — the same convention the schedule form uses.
 */

export interface DueScheduleInput {
  timezone: string | null;
  days: number[] | null;
  publish_times: string[] | null;
  pause_dates: string[] | null;
  holiday_mode: boolean | null;
  emergency_stop: boolean | null;
}

export interface LocalNow {
  weekday: number; // 0=Sun..6=Sat
  date: string; // YYYY-MM-DD in the tenant timezone
  minutes: number; // minutes since local midnight
  midnightUtcIso: string; // UTC instant of the tenant's local midnight today
}

const WK: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Resolve "now" in a tenant's timezone. */
export function localNow(timezone: string | null, now: Date): LocalNow {
  const tz = timezone || "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = WK[get("weekday")] ?? 0;
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const minutes = hour * 60 + minute;
  // Zone offset (ms) at `now` = localWallClock - utc.
  const localWall = Date.parse(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
  );
  const utcMs = Date.parse(now.toISOString().slice(0, 19) + "Z");
  const offsetMs = localWall - utcMs;
  const midnightUtcIso = new Date(Date.parse(`${date}T00:00:00`) - offsetMs).toISOString();
  return { weekday, date, minutes, midnightUtcIso };
}

/** Earliest publish time of the day, in minutes since midnight. */
export function earliestPublishMinutes(times: string[] | null): number {
  const list = (times && times.length > 0 ? times : ["09:00"])
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      return (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0);
    })
    .sort((a, b) => a - b);
  return list[0];
}

/** Add `days` to a YYYY-MM-DD date string (UTC-safe, no timezone drift). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Weekday (0=Sun..6=Sat) of a YYYY-MM-DD date string. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * Would this schedule fire on `date` (tenant-local calendar day)? Applies the
 * same day/pause/holiday/emergency rules as `isScheduleDue`, ignoring the
 * time-of-day component. Pure — used by cadence simulation and misfire
 * detection (M11 Phase G).
 */
export function firesOnDate(s: DueScheduleInput, date: string): boolean {
  if (s.emergency_stop || s.holiday_mode) return false;
  const days = s.days && s.days.length > 0 ? s.days : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(weekdayOf(date))) return false;
  if ((s.pause_dates ?? []).includes(date)) return false;
  return true;
}

/**
 * Cadence simulation (ADR-034): the next `count` firing slots at or after
 * `from`, as {date, time} pairs in the tenant's timezone. Lets an operator
 * validate a cadence before committing it. Pure + bounded.
 */
export function simulateSchedule(
  s: DueScheduleInput,
  from: Date,
  count = 5
): Array<{ date: string; time: string }> {
  const local = localNow(s.timezone, from);
  const times = (s.publish_times && s.publish_times.length > 0 ? s.publish_times : ["09:00"])
    .slice()
    .sort();
  const out: Array<{ date: string; time: string }> = [];
  let date = local.date;

  // Bounded scan (a year) so an impossible cadence can never loop forever.
  for (let i = 0; i < 366 && out.length < count; i++) {
    if (firesOnDate(s, date)) {
      for (const t of times) {
        if (out.length >= count) break;
        const [h, m] = t.split(":").map(Number);
        const minutes = (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0);
        if (i === 0 && minutes < local.minutes) continue; // already passed today
        out.push({ date, time: t });
      }
    }
    date = addDays(date, 1);
  }
  return out;
}

/**
 * Missed firing days strictly between `lastFiredDate` and `today` (exclusive of
 * today), newest-first, bounded by `limit`. Drives the misfire policy.
 */
export function missedWindows(
  s: DueScheduleInput,
  lastFiredDate: string | null,
  today: string,
  limit = 3
): string[] {
  if (!lastFiredDate) return [];
  const out: string[] = [];
  let date = addDays(today, -1);
  for (let i = 0; i < 366 && out.length < limit; i++) {
    if (date <= lastFiredDate) break;
    if (firesOnDate(s, date)) out.push(date);
    date = addDays(date, -1);
  }
  return out;
}

/** Whether a schedule is due at `now` (ignoring the per-day upload count). */
export function isScheduleDue(s: DueScheduleInput, now: Date): { due: boolean; local: LocalNow } {
  const local = localNow(s.timezone, now);
  if (s.emergency_stop || s.holiday_mode) return { due: false, local };
  const days = s.days && s.days.length > 0 ? s.days : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(local.weekday)) return { due: false, local };
  if ((s.pause_dates ?? []).includes(local.date)) return { due: false, local };
  if (local.minutes < earliestPublishMinutes(s.publish_times)) return { due: false, local };
  return { due: true, local };
}
