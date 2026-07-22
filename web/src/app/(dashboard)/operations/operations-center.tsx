"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ListChecks, Power, ShieldAlert } from "lucide-react";
import type { IncidentRow } from "@/lib/ops/incidents";
import type { WorkspaceHealth } from "@/lib/ops/health";
import {
  acknowledgeIncident,
  createManualIncident,
  recordPlaybookStep,
  resolveIncident,
  setWorkspaceStop,
} from "./actions";
import { cn } from "@/lib/utils";

interface PlaybookView {
  title: string;
  version: number;
  steps: { key: string; title: string; detail?: string }[];
  done: string[];
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-status-failed/10 text-status-failed",
  high: "bg-status-failed/10 text-status-failed",
  medium: "bg-status-running/10 text-status-running",
  low: "bg-elevated text-muted-foreground",
};

export function OperationsCenter({
  health,
  incidents,
  playbooks,
  canStop,
  stopped,
}: {
  health: WorkspaceHealth;
  incidents: IncidentRow[];
  playbooks: Record<string, PlaybookView | null>;
  canStop: boolean;
  stopped: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      setMessage(r.ok ? "Done." : r.error ?? "That didn't work.");
      router.refresh();
    });
  }

  const openIncidents = incidents.filter((i) =>
    ["open", "acknowledged", "investigating"].includes(i.status)
  );
  const closed = incidents.filter((i) => !["open", "acknowledged", "investigating"].includes(i.status));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-elevated p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Open incidents</h2>

            {openIncidents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing needs an operator right now. Failed jobs and blocked runs open an incident
                here automatically.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {openIncidents.map((incident) => {
                  const pb = playbooks[incident.id];
                  const isOpen = expanded === incident.id;
                  return (
                    <li key={incident.id} className="rounded-lg border border-border bg-surface p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                            SEVERITY_TONE[incident.severity] ?? SEVERITY_TONE.low
                          )}
                        >
                          {incident.severity}
                        </span>
                        <span className="text-sm font-medium text-foreground">{incident.title}</span>
                        {incident.sla_breached && (
                          <span className="rounded-md bg-status-failed/10 px-1.5 py-0.5 text-[11px] font-medium text-status-failed">
                            past SLA
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {incident.category} · {incident.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : incident.id)}
                          className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        >
                          {isOpen ? "Hide" : "Open"}
                        </button>
                      </div>

                      {incident.summary && (
                        <p className="mt-1 text-xs text-muted-foreground">{incident.summary}</p>
                      )}

                      {isOpen && (
                        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                          {pb && (
                            <div>
                              <div className="mb-2 flex items-center gap-1.5">
                                <ListChecks className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
                                <span className="text-xs font-medium text-foreground">
                                  {pb.title}
                                </span>
                                <span className="text-[11px] text-muted-foreground">v{pb.version}</span>
                              </div>
                              <ul className="flex flex-col gap-1.5">
                                {pb.steps.map((step) => {
                                  const done = pb.done.includes(step.key);
                                  return (
                                    <li
                                      key={step.key}
                                      className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2"
                                    >
                                      <CheckCircle2
                                        className={cn(
                                          "mt-0.5 h-3.5 w-3.5 shrink-0",
                                          done ? "text-status-approved" : "text-muted-foreground"
                                        )}
                                        strokeWidth={1.75}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-foreground">
                                          {step.title}
                                        </p>
                                        {step.detail && (
                                          <p className="text-[11px] text-muted-foreground">
                                            {step.detail}
                                          </p>
                                        )}
                                      </div>
                                      {!done && (
                                        <button
                                          type="button"
                                          disabled={pending}
                                          onClick={() =>
                                            act(() =>
                                              recordPlaybookStep(incident.id, step.key, "done")
                                            )
                                          }
                                          className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                                        >
                                          Mark done
                                        </button>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {!incident.acknowledged_at && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => act(() => acknowledgeIncident(incident.id))}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-elevated disabled:opacity-50"
                              >
                                Acknowledge
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                const res = window.prompt("What was done to resolve this?")?.trim();
                                if (!res) return;
                                act(() => resolveIncident(incident.id, res));
                              }}
                              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                            >
                              Resolve
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Open an incident manually…"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                disabled={pending || !newTitle.trim()}
                onClick={() =>
                  act(async () => {
                    const r = await createManualIncident(newTitle, "", "medium");
                    if (r.ok) setNewTitle("");
                    return r;
                  })
                }
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
              >
                Open incident
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-elevated p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Service levels</h2>
            <ul className="flex flex-col gap-1.5">
              {health.slas.map((sla) => (
                <li
                  key={sla.slug}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <span className="text-xs font-medium text-foreground">{sla.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    target {sla.target} · {sla.observed}
                  </span>
                  <span
                    className={cn(
                      "ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                      sla.met === null
                        ? "bg-elevated text-muted-foreground"
                        : sla.met
                          ? "bg-status-approved/10 text-status-approved"
                          : "bg-status-failed/10 text-status-failed"
                    )}
                  >
                    {sla.attainment === null
                      ? "not measured"
                      : `${(sla.attainment * 100).toFixed(0)}% · ${sla.sampleSize} sampled`}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {closed.length > 0 && (
            <section className="rounded-xl border border-border bg-elevated p-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Recently closed</h2>
              <ul className="flex flex-col gap-1">
                {closed.slice(0, 10).map((i) => (
                  <li key={i.id} className="text-xs text-muted-foreground">
                    <span className="text-foreground">{i.title}</span>
                    {i.resolution ? ` — ${i.resolution}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="flex h-fit flex-col gap-4">
          <section className="rounded-xl border border-border bg-elevated p-4">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Health breakdown</h2>
            <ul className="flex flex-col gap-2">
              {health.components.map((c) => (
                <li key={c.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{c.label}</span>
                    <span className="tabular-nums text-muted-foreground">{c.score}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        c.score >= 80
                          ? "bg-status-approved"
                          : c.score >= 55
                            ? "bg-status-running"
                            : "bg-status-failed"
                      )}
                      style={{ width: `${c.score}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{c.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          <section
            className={cn(
              "rounded-xl border p-4",
              stopped ? "border-status-failed/40 bg-status-failed/5" : "border-border bg-elevated"
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              {stopped ? (
                <ShieldAlert className="h-4 w-4 text-status-failed" strokeWidth={1.75} />
              ) : (
                <Power className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              )}
              <h2 className="text-sm font-semibold text-foreground">
                {stopped ? "Workspace stopped" : "Emergency stop"}
              </h2>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {stopped
                ? "Every automated path is halted. Approvals, publishing and regeneration are all refused until this is lifted."
                : "Halts every automated path in this workspace immediately. Approvals and publishing are refused while it is on."}
            </p>
            <button
              type="button"
              disabled={pending || !canStop}
              onClick={() => act(() => setWorkspaceStop(!stopped))}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
                stopped
                  ? "bg-primary text-on-primary hover:bg-primary-hover"
                  : "border border-status-failed/40 text-status-failed hover:bg-status-failed/10"
              )}
            >
              {stopped ? "Lift the stop" : "Stop the workspace"}
            </button>
            {!canStop && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Only an owner or manager can use this.
              </p>
            )}
          </section>

          {message && (
            <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
              {message}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
