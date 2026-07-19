import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CalendarGrid, type CalendarPlanItem } from "./calendar-grid";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

function parseMonth(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function shiftMonth(monthStart: string, delta: number): string {
  const [y, m] = monthStart.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthEnd(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const monthStart = parseMonth(month);
  const rangeEnd = monthEnd(monthStart);

  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: items } = await supabase
    .from("plan_items")
    .select("id, scheduled_date, topic, pillar, status")
    .eq("tenant_id", tenantId)
    .gte("scheduled_date", monthStart)
    .lte("scheduled_date", rangeEnd)
    .order("scheduled_date", { ascending: true });

  const planItems = (items as CalendarPlanItem[] | null) ?? [];
  const itemsByDate: Record<string, CalendarPlanItem[]> = {};
  for (const item of planItems) {
    (itemsByDate[item.scheduled_date] ??= []).push(item);
  }

  const monthLabel = new Date(`${monthStart}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Content Calendar"
          description="A month view of your scheduled content — click any day to review or edit."
        />
        <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated p-1">
          <Link
            href={`/calendar?month=${shiftMonth(monthStart, -1)}`}
            aria-label="Previous month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </Link>
          <span className="min-w-[130px] text-center text-sm font-medium text-foreground">{monthLabel}</span>
          <Link
            href={`/calendar?month=${shiftMonth(monthStart, 1)}`}
            aria-label="Next month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </Link>
        </div>
      </div>

      <CalendarGrid monthStart={monthStart} itemsByDate={itemsByDate} todayStr={todayStr} />
    </div>
  );
}
