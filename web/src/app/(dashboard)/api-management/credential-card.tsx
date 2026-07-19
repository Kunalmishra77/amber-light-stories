"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { updateCredentialKey, testConnection } from "./actions";

export interface CredentialCardData {
  provider: string;
  label: string;
  status: string | null;
  lastCheckedAt: string | null;
  connected: boolean;
}

function formatDateTime(value: string | null) {
  if (!value) return "Never checked";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never checked";
  return `Checked ${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export function CredentialCard({ credential, canEdit }: { credential: CredentialCardData; canEdit: boolean }) {
  const [status, setStatus] = useState(credential.status);
  const [lastChecked, setLastChecked] = useState(credential.lastCheckedAt);
  const [connected, setConnected] = useState(credential.connected);
  const [editing, setEditing] = useState(!connected);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isTesting, startTest] = useTransition();
  const [isSaving, startSave] = useTransition();

  function handleTest() {
    setError(null);
    startTest(async () => {
      const result = await testConnection(credential.provider);
      setLastChecked(new Date().toISOString());
      if (!result.ok) {
        setStatus("missing_permission");
        setError(result.error ?? "Test failed.");
        return;
      }
      setStatus("connected");
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(event.currentTarget);
    formData.set("provider", credential.provider);

    startSave(async () => {
      const result = await updateCredentialKey(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the key.");
        return;
      }
      setConnected(true);
      setStatus("connected");
      setSaved(true);
      setEditing(false);
      (event.target as HTMLFormElement).reset();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{credential.label}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(lastChecked)}</p>
          </div>
        </div>
        {connected ? <StatusBadge status={status ?? "connected"} /> : (
          <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground">
            Not configured
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {connected && canEdit ? (
          <button
            type="button"
            disabled={isTesting}
            onClick={handleTest}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isTesting ? "animate-spin" : ""}`} strokeWidth={1.75} />
            {isTesting ? "Testing…" : "Test connection"}
          </button>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
          >
            {connected ? (editing ? "Cancel" : "Rotate key") : editing ? "Cancel" : "Add key"}
          </button>
        ) : null}
      </div>

      {editing && canEdit ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-border pt-3">
          <input
            type="password"
            name="secret"
            required
            autoComplete="off"
            placeholder={`Paste ${credential.label} API key`}
            disabled={isSaving}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save key"}
          </button>
        </form>
      ) : null}

      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
      {saved && !error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-approved)]">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>Key saved.</span>
        </div>
      ) : null}
    </div>
  );
}
