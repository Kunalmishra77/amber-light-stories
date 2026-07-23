import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasTenantCredential } from "@/lib/providers/tenant-providers";

/**
 * Workspace readiness (Priority: client onboarding).
 *
 * The audit found a client lands on the raw dashboard after first login with no
 * guided route from "logged in" to "automation running". This computes, from
 * REAL state, exactly which setup steps are done and what is next — so the
 * Getting Started card and any readiness gate speak the truth, never a
 * hardcoded checklist.
 */
export interface ReadinessStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
  /** Required for the core automation loop (vs a nice-to-have). */
  required: boolean;
}

export interface Readiness {
  steps: ReadinessStep[];
  completed: number;
  requiredTotal: number;
  requiredDone: number;
  /** True when every REQUIRED step is done. */
  ready: boolean;
  percent: number;
}

export async function getWorkspaceReadiness(
  db: SupabaseClient,
  tenantId: string
): Promise<Readiness> {
  const [
    { data: settings },
    { data: plan },
    { data: schedule },
    { data: channel },
    hasOpenAI,
    hasGemini,
  ] = await Promise.all([
    db.from("tenant_settings").select("config, brand, industry").eq("tenant_id", tenantId).maybeSingle(),
    db.from("content_plans").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle(),
    db.from("schedules").select("days, publish_times").eq("tenant_id", tenantId).maybeSingle(),
    db.from("channels").select("id, status").eq("tenant_id", tenantId).eq("provider", "youtube").eq("status", "connected").maybeSingle(),
    hasTenantCredential(tenantId, "openai"),
    hasTenantCredential(tenantId, "gemini"),
  ]);

  const config = (settings?.config ?? {}) as { automation_enabled?: boolean };
  const brand = (settings?.brand ?? {}) as { brand_name?: string | null };

  const brandConfigured = Boolean(brand.brand_name || settings?.industry);
  const aiConnected = hasOpenAI || hasGemini;
  const scheduleConfigured =
    Array.isArray(schedule?.days) && schedule!.days.length > 0 &&
    Array.isArray(schedule?.publish_times) && schedule!.publish_times.length > 0;

  const steps: ReadinessStep[] = [
    {
      key: "ai_credentials",
      title: "Connect an AI provider",
      description: "Add your OpenAI or Gemini key so real AI generation can run.",
      done: aiConnected,
      href: "/api-management",
      required: true,
    },
    {
      key: "brand",
      title: "Set up your brand",
      description: "Tell us your business, niche, and tone so content fits your channel.",
      done: brandConfigured,
      href: "/brand",
      required: true,
    },
    {
      key: "content_plan",
      title: "Generate a content plan",
      description: "Create a 30-day plan of topics for the automation to work from.",
      done: Boolean(plan),
      href: "/planner",
      required: true,
    },
    {
      key: "schedule",
      title: "Set your publishing schedule",
      description: "Choose the days and times videos should go out.",
      done: scheduleConfigured,
      href: "/schedule",
      required: true,
    },
    {
      key: "youtube",
      title: "Connect YouTube",
      description: "Sign in with Google so approved videos publish to your channel.",
      done: Boolean(channel),
      href: "/youtube",
      required: false,
    },
    {
      key: "automation",
      title: "Turn on automation",
      description: "Enable hands-off production once everything above is ready.",
      done: Boolean(config.automation_enabled),
      href: "/automation",
      required: false,
    },
  ];

  const requiredSteps = steps.filter((s) => s.required);
  const requiredDone = requiredSteps.filter((s) => s.done).length;
  const completed = steps.filter((s) => s.done).length;

  return {
    steps,
    completed,
    requiredTotal: requiredSteps.length,
    requiredDone,
    ready: requiredDone === requiredSteps.length,
    percent: Math.round((completed / steps.length) * 100),
  };
}
