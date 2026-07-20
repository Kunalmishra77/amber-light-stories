"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, Plus, Trash2, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import { WEBHOOK_EVENT_TYPES } from "@/lib/api/constants";
import {
  createWebhookAction,
  toggleWebhookAction,
  deleteWebhookAction,
  type ActionResult,
} from "./actions";

export interface WebhookView {
  id: string;
  url: string;
  event_types: string[];
  enabled: boolean;
  description: string | null;
  created_at: string;
}

export interface DeliveryView {
  id: string;
  endpoint_id: string | null;
  event_type: string;
  status: string;
  status_code: number | null;
  created_at: string;
}

const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50";
const FIELD =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary";

function fmt(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function SecretReveal({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-xs font-medium text-foreground">
        Save this signing secret now — use it to verify the X-Webhook-Signature header. It won’t be shown again.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-elevated px-2 py-1.5 font-mono text-xs text-foreground">{secret}</code>
        <button
          type="button"
          className={BTN}
          onClick={() => {
            navigator.clipboard?.writeText(secret);
            setCopied(true);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" className={BTN} onClick={onDismiss}>
          Done
        </button>
      </div>
    </div>
  );
}

export function WebhooksSection({
  endpoints,
  deliveries,
  canEdit,
}: {
  endpoints: WebhookView[];
  deliveries: DeliveryView[];
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function run(fn: () => Promise<ActionResult>, opts?: { reveal?: boolean; reset?: HTMLFormElement | null }) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Action failed.");
        return;
      }
      if (opts?.reveal && result.secret) setRevealed(result.secret);
      if (opts?.reset) opts.reset.reset();
      setShowForm(false);
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Webhook className="h-4 w-4 text-primary" strokeWidth={1.75} />
          Webhooks
        </h2>
        {canEdit ? (
          <button type="button" className={BTN} onClick={() => setShowForm((s) => !s)} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New endpoint
          </button>
        ) : null}
      </div>

      {revealed ? <SecretReveal secret={revealed} onDismiss={() => setRevealed(null)} /> : null}

      {showForm && canEdit ? (
        <form
          className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            run(() => createWebhookAction(new FormData(form)), { reveal: true, reset: form });
          }}
        >
          <input name="url" type="url" placeholder="https://your-app.com/webhooks/amber" className={FIELD} required />
          <input name="description" placeholder="Description (optional)" className={FIELD} />
          <div className="flex flex-wrap gap-3">
            {WEBHOOK_EVENT_TYPES.map((evt) => (
              <label key={evt} className="flex items-center gap-1.5 text-xs text-foreground">
                <input type="checkbox" name="event_types" value={evt} />
                <code className="font-mono">{evt}</code>
              </label>
            ))}
          </div>
          <button type="submit" disabled={isPending} className={cn(BTN, "w-fit bg-primary text-on-primary hover:bg-primary-hover")}>
            {isPending ? "Saving…" : "Register endpoint"}
          </button>
        </form>
      ) : null}

      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {endpoints.length === 0 ? (
          <p className="rounded-xl border border-border bg-elevated px-4 py-6 text-center text-xs text-muted-foreground">
            No webhook endpoints yet.
          </p>
        ) : (
          endpoints.map((e) => (
            <div key={e.id} className="flex flex-col gap-2 rounded-xl border border-border bg-elevated p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <code className="truncate font-mono text-xs text-foreground">{e.url}</code>
                  <span className="text-xs text-muted-foreground">
                    {e.event_types.join(", ")}
                    {e.description ? ` · ${e.description}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                      e.enabled
                        ? "border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 text-[var(--status-approved)]"
                        : "border-border bg-surface text-muted-foreground"
                    )}
                  >
                    {e.enabled ? "Enabled" : "Disabled"}
                  </span>
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        disabled={isPending}
                        className={BTN}
                        onClick={() => run(() => toggleWebhookAction(e.id, !e.enabled))}
                      >
                        {e.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        className={cn(BTN, "text-[var(--status-failed)] hover:border-[var(--status-failed)]/40")}
                        onClick={() => {
                          if (typeof window !== "undefined" && !window.confirm("Delete this endpoint and its delivery history?")) return;
                          run(() => deleteWebhookAction(e.id));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {deliveries.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-border bg-elevated">
          <div className="border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground">
            Recent deliveries
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">{d.event_type}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          d.status === "success" ? "text-[var(--status-approved)]" : "text-[var(--status-failed)]"
                        )}
                      >
                        {d.status}
                        {d.status_code ? ` · ${d.status_code}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{fmt(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
