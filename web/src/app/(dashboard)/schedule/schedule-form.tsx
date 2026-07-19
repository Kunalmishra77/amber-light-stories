"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Save,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { updateSchedule } from "./actions";

export interface ScheduleData {
  id: string | null;
  timezone: string | null;
  days: number[] | null;
  publish_times: string[] | null;
  frequency: string | null;
  pause_dates: string[] | null;
  holiday_mode: boolean | null;
  emergency_stop: boolean | null;
  retry_rules: { max_retries?: number; backoff?: string } | null;
  upload_limit_per_day: number | null;
}

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Africa/Cairo",
  "Africa/Johannesburg",
];

// JS Date.getDay() convention: 0=Sun..6=Sat, displayed Mon-first.
const DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

function Toggle({
  checked,
  onChange,
  disabled,
  danger,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked
          ? danger
            ? "bg-[var(--status-failed)]"
            : "bg-primary"
          : "bg-border"
      )}
    >
      <span
        className={cn(
          "inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

export function ScheduleForm({ initial }: { initial: ScheduleData }) {
  const [timezone, setTimezone] = useState(initial.timezone ?? "UTC");
  const [days, setDays] = useState<Set<number>>(
    new Set(initial.days && initial.days.length > 0 ? initial.days : [1, 2, 3, 4, 5])
  );
  const [publishTimes, setPublishTimes] = useState<string[]>(
    initial.publish_times && initial.publish_times.length > 0
      ? initial.publish_times
      : ["09:00"]
  );
  const [newTime, setNewTime] = useState("09:00");
  const [frequency, setFrequency] = useState(initial.frequency ?? "daily");
  const [pauseDates, setPauseDates] = useState<string[]>(initial.pause_dates ?? []);
  const [newPauseDate, setNewPauseDate] = useState("");
  const [holidayMode, setHolidayMode] = useState(initial.holiday_mode ?? false);
  const [emergencyStop, setEmergencyStop] = useState(initial.emergency_stop ?? false);
  const [maxRetries, setMaxRetries] = useState(initial.retry_rules?.max_retries ?? 3);
  const [backoff, setBackoff] = useState(initial.retry_rules?.backoff ?? "linear");
  const [uploadLimit, setUploadLimit] = useState(initial.upload_limit_per_day ?? 1);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleDay(value: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function addTime() {
    if (!newTime || publishTimes.includes(newTime)) return;
    setPublishTimes((prev) => [...prev, newTime].sort());
  }

  function removeTime(t: string) {
    setPublishTimes((prev) => prev.filter((x) => x !== t));
  }

  function addPauseDate() {
    if (!newPauseDate || pauseDates.includes(newPauseDate)) return;
    setPauseDates((prev) => [...prev, newPauseDate].sort());
    setNewPauseDate("");
  }

  function removePauseDate(d: string) {
    setPauseDates((prev) => prev.filter((x) => x !== d));
  }

  function toggleEmergencyStop(next: boolean) {
    if (
      next &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Enable emergency stop? This immediately halts all publishing for this workspace until turned off."
      )
    ) {
      return;
    }
    setEmergencyStop(next);
  }

  const summary = useMemo(() => {
    const dayNames = DAY_OPTIONS.filter((d) => days.has(d.value))
      .map((d) => d.label)
      .join(", ");
    const times = publishTimes.length > 0 ? publishTimes.join(", ") : "no times set";
    const freqText =
      frequency === "weekdays"
        ? "on weekdays"
        : frequency === "custom"
          ? "on a custom cadence"
          : "on the selected days";

    let text = `Publishing up to ${uploadLimit} video${uploadLimit === 1 ? "" : "s"}/day at ${times} ${timezone}, ${freqText}${dayNames ? ` (${dayNames})` : ""}.`;
    if (pauseDates.length > 0) text += ` Paused on ${pauseDates.length} date${pauseDates.length === 1 ? "" : "s"}.`;
    if (holidayMode) text += " Holiday mode will auto-pause around festivals.";
    if (emergencyStop) text += " Emergency stop is ON — publishing is halted right now.";
    return text;
  }, [days, publishTimes, frequency, uploadLimit, timezone, pauseDates, holidayMode, emergencyStop]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (days.size === 0) {
      setError("Pick at least one publishing day.");
      return;
    }
    if (publishTimes.length === 0) {
      setError("Add at least one publish time.");
      return;
    }

    const formData = new FormData();
    formData.set("timezone", timezone);
    for (const d of days) formData.set(`day_${d}`, "on");
    formData.set("publish_times_json", JSON.stringify(publishTimes));
    formData.set("frequency", frequency);
    formData.set("pause_dates_json", JSON.stringify(pauseDates));
    if (holidayMode) formData.set("holiday_mode", "on");
    if (emergencyStop) formData.set("emergency_stop", "on");
    formData.set("retry_max_retries", String(maxRetries));
    formData.set("retry_backoff", backoff);
    formData.set("upload_limit_per_day", String(uploadLimit));

    startTransition(async () => {
      const result = await updateSchedule(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the schedule.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Plain-English summary */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{summary}</p>
          <p className="text-xs text-muted-foreground">
            All times use YOUR timezone, never UTC.
          </p>
        </div>
      </div>

      {/* Timing */}
      <div className="grid grid-cols-1 gap-5 rounded-xl border border-border bg-elevated p-5 shadow-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="timezone" className={LABEL_CLASS}>
            Timezone
          </label>
          <select
            id="timezone"
            value={timezone}
            disabled={isPending}
            onChange={(e) => setTimezone(e.target.value)}
            className={FIELD_CLASS}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="frequency" className={LABEL_CLASS}>
            Frequency
          </label>
          <select
            id="frequency"
            value={frequency}
            disabled={isPending}
            onChange={(e) => setFrequency(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays only</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={LABEL_CLASS}>Publishing days</span>
          <div className="flex flex-wrap gap-2">
            {DAY_OPTIONS.map((d) => {
              const active = days.has(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  disabled={isPending}
                  onClick={() => toggleDay(d.value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground"
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={LABEL_CLASS}>Publish times</span>
          <div className="flex flex-wrap items-center gap-2">
            {publishTimes.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium tabular-nums text-foreground"
              >
                {t}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => removeTime(t)}
                  className="text-muted-foreground hover:text-[var(--status-failed)]"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </span>
            ))}
            <input
              type="time"
              value={newTime}
              disabled={isPending}
              onChange={(e) => setNewTime(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus-visible:border-primary"
            />
            <button
              type="button"
              disabled={isPending}
              onClick={addTime}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-elevated disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="upload_limit_per_day" className={LABEL_CLASS}>
            Upload limit / day
          </label>
          <input
            id="upload_limit_per_day"
            type="number"
            min={1}
            max={20}
            disabled={isPending}
            value={uploadLimit}
            onChange={(e) => setUploadLimit(Number(e.target.value))}
            className={cn(FIELD_CLASS, "tabular-nums")}
          />
        </div>
      </div>

      {/* Pause dates + holiday mode */}
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-elevated p-5 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <span className={LABEL_CLASS}>Pause dates</span>
          <div className="flex flex-wrap items-center gap-2">
            {pauseDates.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium tabular-nums text-foreground"
              >
                {d}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => removePauseDate(d)}
                  className="text-muted-foreground hover:text-[var(--status-failed)]"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </span>
            ))}
            <input
              type="date"
              value={newPauseDate}
              disabled={isPending}
              onChange={(e) => setNewPauseDate(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus-visible:border-primary"
            />
            <button
              type="button"
              disabled={isPending}
              onClick={addPauseDate}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-elevated disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add
            </button>
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Holiday mode</span>
            <span className="text-xs text-muted-foreground">
              Auto-pause around festivals in your tenant&apos;s calendar.
            </span>
          </div>
          <Toggle checked={holidayMode} onChange={setHolidayMode} disabled={isPending} />
        </label>
      </div>

      {/* Retry rules */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="max_retries" className={LABEL_CLASS}>
            Max retries
          </label>
          <input
            id="max_retries"
            type="number"
            min={0}
            max={10}
            disabled={isPending}
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
            className={cn(FIELD_CLASS, "tabular-nums")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="backoff" className={LABEL_CLASS}>
            Backoff strategy
          </label>
          <select
            id="backoff"
            value={backoff}
            disabled={isPending}
            onChange={(e) => setBackoff(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="none">None</option>
            <option value="linear">Linear</option>
            <option value="exponential">Exponential</option>
          </select>
        </div>
      </div>

      {/* Emergency stop */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border p-5 shadow-sm",
          emergencyStop
            ? "border-[var(--status-failed)]/40 bg-[var(--status-failed)]/10"
            : "border-border bg-elevated"
        )}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              emergencyStop ? "text-[var(--status-failed)]" : "text-muted-foreground"
            )}
            strokeWidth={1.75}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-foreground">Emergency stop</span>
            <span className="text-xs text-muted-foreground">
              Immediately halts all publishing for this workspace. Requires confirmation.
            </span>
          </div>
        </div>
        <Toggle
          checked={emergencyStop}
          onChange={toggleEmergencyStop}
          disabled={isPending}
          danger
        />
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      {saved && !error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-3 py-2 text-xs text-[var(--status-approved)]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>Schedule saved.</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Saving…" : "Save schedule"}
      </button>
    </form>
  );
}
