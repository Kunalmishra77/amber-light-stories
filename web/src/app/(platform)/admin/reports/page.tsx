import { Download, ListChecks, Building2, Wallet, FileSpreadsheet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

// Live counts on every request.
export const dynamic = "force-dynamic";

interface ReportDef {
  dataset: "runs" | "usage" | "tenants";
  title: string;
  description: string;
  icon: LucideIcon;
}

const REPORTS: ReportDef[] = [
  {
    dataset: "runs",
    title: "Pipeline runs",
    description: "Every cross-tenant run with status, stage, cost, budget, and timestamps (most recent 5,000).",
    icon: ListChecks,
  },
  {
    dataset: "usage",
    title: "Usage & cost rollup",
    description: "Per-tenant stories, videos, allocated budget, and metered API cost — one row per tenant.",
    icon: Wallet,
  },
  {
    dataset: "tenants",
    title: "Tenants",
    description: "All tenants with slug, status, and creation date.",
    icon: Building2,
  },
];

async function loadCounts() {
  const supabase = await createClient();
  const [runs, tenants] = await Promise.all([
    supabase.from("pipeline_runs").select("*", { count: "exact", head: true }),
    supabase.from("tenants").select("*", { count: "exact", head: true }),
  ]);
  return { runs: runs.count ?? 0, tenants: tenants.count ?? 0 };
}

export default async function AdminReportsPage() {
  let counts = { runs: 0, tenants: 0 };
  try {
    counts = await loadCounts();
  } catch {
    // Counts are contextual only; the exports still work if this fails.
  }

  return (
    <div>
      <PageHeader
        title="Reports & Exports"
        description="Download cross-tenant operational data as CSV for finance, audits, or offline analysis. Exports are super-admin only and every download is written to the audit log."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          const contextCount =
            report.dataset === "runs" ? counts.runs : report.dataset === "tenants" ? counts.tenants : null;
          return (
            <div
              key={report.dataset}
              className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
                {contextCount !== null ? (
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {contextCount.toLocaleString("en-US")} rows
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-semibold text-foreground">{report.title}</h2>
                <p className="text-xs text-muted-foreground">{report.description}</p>
              </div>
              <a
                href={`/admin/reports/export?dataset=${report.dataset}`}
                className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                Download CSV
              </a>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span>
          CSVs use RFC-4180 quoting (safe for commas, quotes, and newlines in text fields) and CRLF line
          endings for spreadsheet compatibility.
        </span>
      </div>
    </div>
  );
}
