"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { createFlagAction } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

interface TenantOption {
  id: string;
  name: string;
}

export function CreateFlagForm({ tenants }: { tenants: TenantOption[] }) {
  const [scope, setScope] = useState<"global" | "tenant">("global");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createFlagAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't create flag.");
        return;
      }
      setSaved(true);
      formRef.current?.reset();
      setScope("global");
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-foreground">Add feature flag</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="key" className={LABEL_CLASS}>
            Key
          </label>
          <input
            id="key"
            name="key"
            type="text"
            required
            disabled={isPending}
            placeholder="e.g. beta_scene_engine"
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="scope" className={LABEL_CLASS}>
            Scope
          </label>
          <select
            id="scope"
            name="scope"
            disabled={isPending}
            value={scope}
            onChange={(e) => setScope(e.target.value as "global" | "tenant")}
            className={FIELD_CLASS}
          >
            <option value="global">Global</option>
            <option value="tenant">Tenant</option>
          </select>
        </div>
        {scope === "tenant" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tenant_id" className={LABEL_CLASS}>
              Tenant
            </label>
            <select
              id="tenant_id"
              name="tenant_id"
              required
              disabled={isPending}
              defaultValue=""
              className={FIELD_CLASS}
            >
              <option value="" disabled>
                Choose a tenant
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
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
          <span>Flag created (disabled by default).</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        {isPending ? "Creating…" : "Add flag"}
      </button>
    </form>
  );
}
