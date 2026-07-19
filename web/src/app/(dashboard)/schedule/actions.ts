"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const VALID_FREQUENCIES = new Set(["daily", "weekdays", "custom"]);
const VALID_BACKOFFS = new Set(["none", "linear", "exponential"]);
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Upserts the tenant's single `schedules` row (unique on tenant_id) from the
 * scheduler form. All times/dates are interpreted in the submitted
 * `timezone` — never converted to UTC here.
 */
export async function updateSchedule(formData: FormData): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const timezone = ((formData.get("timezone") as string | null) ?? "").trim();
  if (!timezone) return { ok: false, error: "Choose a timezone." };

  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => formData.get(`day_${d}`) === "on");
  if (days.length === 0) return { ok: false, error: "Pick at least one publishing day." };

  const publishTimes = parseJsonArray(formData.get("publish_times_json") as string | null);
  if (publishTimes.length === 0 || !publishTimes.every((t) => TIME_RE.test(t))) {
    return { ok: false, error: "Add at least one valid publish time (HH:MM)." };
  }

  const frequency = (formData.get("frequency") as string | null) ?? "daily";
  if (!VALID_FREQUENCIES.has(frequency)) {
    return { ok: false, error: "Choose a valid frequency." };
  }

  const pauseDates = parseJsonArray(formData.get("pause_dates_json") as string | null);
  if (!pauseDates.every((d) => DATE_RE.test(d))) {
    return { ok: false, error: "Pause dates must be valid calendar dates." };
  }

  const holidayMode = formData.get("holiday_mode") === "on";
  const emergencyStop = formData.get("emergency_stop") === "on";

  const maxRetriesRaw = (formData.get("retry_max_retries") as string | null) ?? "3";
  const maxRetries = Number(maxRetriesRaw);
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
    return { ok: false, error: "Max retries must be a whole number between 0 and 10." };
  }

  const backoff = (formData.get("retry_backoff") as string | null) ?? "linear";
  if (!VALID_BACKOFFS.has(backoff)) {
    return { ok: false, error: "Choose a valid backoff strategy." };
  }

  const uploadLimitRaw = (formData.get("upload_limit_per_day") as string | null) ?? "1";
  const uploadLimit = Number(uploadLimitRaw);
  if (!Number.isInteger(uploadLimit) || uploadLimit < 1 || uploadLimit > 20) {
    return { ok: false, error: "Upload limit must be a whole number between 1 and 20." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("schedules").upsert(
    {
      tenant_id: tenantId,
      timezone,
      days,
      publish_times: publishTimes,
      frequency,
      pause_dates: pauseDates,
      holiday_mode: holidayMode,
      emergency_stop: emergencyStop,
      retry_rules: { max_retries: maxRetries, backoff },
      upload_limit_per_day: uploadLimit,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/schedule");
  revalidatePath("/");
  return { ok: true };
}
