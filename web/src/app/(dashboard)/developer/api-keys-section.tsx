"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_SCOPES } from "@/lib/api/constants";
import { issueApiKeyAction, rotateApiKeyAction, revokeApiKeyAction, type ActionResult } from "./actions";

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rate_limit_per_min: number;
  last_used_at: string | null;
  revoked_at: string | null;
  rotated_at: string | null;
  created_at: string;
}

const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50";
const FIELD =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary";

function fmt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** One-time secret reveal — the raw token is never recoverable afterwards. */
function SecretReveal({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-xs font-medium text-foreground">
        Copy this secret now — it won’t be shown again.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-elevated px-2 py-1.5 font-mono text-xs text-foreground">
          {secret}
        </code>
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

export function ApiKeysSection({ keys, canEdit }: { keys: ApiKeyView[]; canEdit: boolean }) {
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
          <KeyRound className="h-4 w-4 text-primary" strokeWidth={1.75} />
          API keys
        </h2>
        {canEdit ? (
          <button type="button" className={BTN} onClick={() => setShowForm((s) => !s)} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New key
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
            run(() => issueApiKeyAction(new FormData(form)), { reveal: true, reset: form });
          }}
        >
          <input name="name" placeholder="Key name (e.g. Production integration)" className={FIELD} required />
          <div className="flex flex-wrap gap-3">
            {API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-1.5 text-xs text-foreground">
                <input type="checkbox" name="scopes" value={scope} defaultChecked={scope === "read"} />
                <code className="font-mono">{scope}</code>
              </label>
            ))}
          </div>
          <button type="submit" disabled={isPending} className={cn(BTN, "w-fit bg-primary text-on-primary hover:bg-primary-hover")}>
            {isPending ? "Issuing…" : "Issue key"}
          </button>
        </form>
      ) : null}

      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-elevated">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Scopes</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    No API keys yet.
                  </td>
                </tr>
              ) : (
                keys.map((k) => {
                  const revoked = Boolean(k.revoked_at);
                  return (
                    <tr key={k.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 text-foreground">{k.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.prefix}…</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{k.scopes.join(", ")}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(k.last_used_at)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                            revoked
                              ? "border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 text-[var(--status-failed)]"
                              : "border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 text-[var(--status-approved)]"
                          )}
                        >
                          {revoked ? "Revoked" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={isPending}
                              className={BTN}
                              onClick={() => run(() => rotateApiKeyAction(k.id), { reveal: true })}
                            >
                              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                              Rotate
                            </button>
                            {!revoked ? (
                              <button
                                type="button"
                                disabled={isPending}
                                className={cn(BTN, "text-[var(--status-failed)] hover:border-[var(--status-failed)]/40")}
                                onClick={() => {
                                  if (typeof window !== "undefined" && !window.confirm("Revoke this key? Calls using it will immediately fail.")) return;
                                  run(() => revokeApiKeyAction(k.id));
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                                Revoke
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="flex justify-end text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
