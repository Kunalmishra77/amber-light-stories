import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Rocket } from "lucide-react";
import type { Readiness } from "@/lib/ops/readiness";
import { cn } from "@/lib/utils";

/**
 * First-run "Getting Started" checklist. Rendered on the dashboard until every
 * required step is done, giving a non-technical client a clear, ordered path
 * from first login to running automation — the layer the audit found missing.
 * Every item is computed from real workspace state.
 */
export function GettingStarted({ readiness }: { readiness: Readiness }) {
  // The next incomplete step is the call to action.
  const next = readiness.steps.find((s) => !s.done);

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-primary/30 bg-primary/5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Rocket className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Get set up</p>
            <p className="text-xs text-muted-foreground">
              {readiness.requiredDone} of {readiness.requiredTotal} required steps done
              {readiness.ready ? " — you're ready to automate" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-elevated">
            <div className="h-full rounded-full bg-primary" style={{ width: `${readiness.percent}%` }} />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{readiness.percent}%</span>
        </div>
      </div>

      <ul className="divide-y divide-primary/10">
        {readiness.steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-primary/5"
            >
              {step.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-approved)]" strokeWidth={2} />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.done ? "text-muted-foreground line-through" : "text-foreground"
                  )}
                >
                  {step.title}
                  {!step.required && (
                    <span className="ml-2 rounded-md bg-elevated px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                      optional
                    </span>
                  )}
                </p>
                {!step.done && (
                  <p className="truncate text-xs text-muted-foreground">{step.description}</p>
                )}
              </div>
              {next?.key === step.key && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-on-primary">
                  Start
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
