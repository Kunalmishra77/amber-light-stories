"use client";

import { useRef, useState, useTransition } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  ShieldQuestion,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { validateCredentialAction } from "../actions";
import { FIELD_CLASS, LABEL_CLASS } from "../field-styles";
import { REQUIRED_PROVIDERS, type ApiStatus, type CredentialProvider, type CredentialStatus } from "@/lib/onboarding/types";
import { REQUIRED_PROVIDER_META, OPTIONAL_PROVIDER_META, type RequiredProviderMeta } from "./provider-meta";

interface ApiCredentialsStepProps {
  token: string;
  apiStatus: ApiStatus;
  onStatusChange: (provider: CredentialProvider, result: { status: string; message: string }) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ApiCredentialsStep({ token, apiStatus, onStatusChange, onNext, onBack }: ApiCredentialsStepProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function validate(provider: CredentialProvider) {
    const input = inputRefs.current[provider];
    const key = input?.value ?? "";
    setPendingProvider(provider);
    startTransition(async () => {
      const result = await validateCredentialAction(token, provider, key);
      onStatusChange(provider, result);
      if (result.status === "connected" && input) input.value = "";
      setPendingProvider(null);
    });
  }

  const allRequiredConnected = REQUIRED_PROVIDERS.every((p) => apiStatus[p]?.status === "connected");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-elevated p-6 shadow-xl shadow-black/5 dark:shadow-black/40 sm:p-8">
        <h2 className="text-base font-semibold text-foreground">Connect your AI tools</h2>
        <p className="text-sm text-muted-foreground">
          Each of these powers a different part of your pipeline. We&rsquo;ll show you exactly where to find your
          key — keys are validated live and stored encrypted, and we never display them again.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {REQUIRED_PROVIDER_META.map((meta) => (
          <ProviderCard
            key={meta.key}
            meta={meta}
            entry={apiStatus[meta.key]}
            busy={isPending && pendingProvider === meta.key}
            inputRef={(el) => {
              inputRefs.current[meta.key] = el;
            }}
            onValidate={() => validate(meta.key)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-border bg-surface/40 p-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">Optional — connect later</h3>
          <p className="text-xs text-muted-foreground">
            These aren&rsquo;t required to get started. You can connect them any time from Settings once
            you&rsquo;re approved.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {OPTIONAL_PROVIDER_META.map((p) => (
            <div key={p.key} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in srgb, ${p.color} 14%, transparent)`, color: p.color }}
                >
                  <p.icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <span className="text-sm font-medium text-foreground">{p.label}</span>
                <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Optional
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{p.purpose}</p>
              <button
                type="button"
                disabled
                title="Connect later in Settings"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-60"
              >
                Connect with Google
              </button>
              <span className="text-[10px] text-muted-foreground">{p.note}</span>
            </div>
          ))}
        </div>
      </div>

      {!allRequiredConnected ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs text-muted-foreground">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>Connect all four required providers above to unlock the next step.</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-elevated p-6 shadow-xl shadow-black/5 dark:shadow-black/40 sm:p-8">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!allRequiredConnected}
          onClick={onNext}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function ProviderCard({
  meta,
  entry,
  busy,
  inputRef,
  onValidate,
}: {
  meta: RequiredProviderMeta;
  entry?: { status: string; message?: string };
  busy: boolean;
  inputRef: (el: HTMLInputElement | null) => void;
  onValidate: () => void;
}) {
  const connected = entry?.status === "connected";

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border p-6 shadow-xl shadow-black/5 transition-colors dark:shadow-black/40 sm:p-8 ${
        connected ? "border-[var(--status-approved)]/40 bg-elevated" : "border-border bg-elevated"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
          >
            <meta.icon className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{meta.label}</span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Required
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{meta.purpose}</span>
          </div>
        </div>
        <StatusPill entry={entry} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
        <span>
          <strong className="font-medium text-foreground">Permission needed:</strong> {meta.scope}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <ExternalLinkPill href={meta.website} label={meta.websiteLabel} />
        <ExternalLinkPill href={meta.docs} label="Docs" />
      </div>

      <details className="group rounded-lg border border-border bg-surface/60 open:bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-medium text-foreground">
          How to get your key
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" strokeWidth={2} />
        </summary>
        <ol className="flex flex-col gap-1.5 px-3.5 pb-3.5 pt-1 text-xs text-muted-foreground">
          {meta.steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 font-medium text-primary">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </details>

      <div className="flex flex-col gap-2">
        <label htmlFor={`cred-${meta.key}`} className={LABEL_CLASS}>
          Your {meta.label} API key
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`cred-${meta.key}`}
            ref={inputRef}
            type="password"
            autoComplete="off"
            placeholder={meta.placeholder}
            disabled={busy}
            className={`${FIELD_CLASS} sm:flex-1`}
          />
          <button
            type="button"
            disabled={busy}
            onClick={onValidate}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
            {busy ? "Testing…" : "Test connection"}
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">{meta.keyHint} — never shown again once saved.</span>
      </div>
    </div>
  );
}

function ExternalLinkPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary-hover"
    >
      {label}
      <ExternalLink className="h-3 w-3" strokeWidth={2} />
    </a>
  );
}

const STATUS_META: Record<CredentialStatus, { label: string; color: string; icon: LucideIcon }> = {
  not_started: { label: "Missing", color: "var(--status-pending)", icon: ShieldQuestion },
  connected: { label: "Connected", color: "var(--status-approved)", icon: CheckCircle2 },
  invalid: { label: "Invalid", color: "var(--status-failed)", icon: XCircle },
  quota_exceeded: { label: "Quota exceeded", color: "var(--status-running)", icon: XCircle },
  expired: { label: "Expired", color: "var(--status-paused)", icon: XCircle },
  error: { label: "Error", color: "var(--status-failed)", icon: XCircle },
};

function StatusPill({ entry }: { entry?: { status: string; message?: string } }) {
  const status = (entry?.status as CredentialStatus) || "not_started";
  const config = STATUS_META[status] ?? STATUS_META.not_started;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
      style={{
        color: config.color,
        backgroundColor: `color-mix(in srgb, ${config.color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${config.color} 30%, transparent)`,
      }}
      title={entry?.message}
    >
      <config.icon className="h-3 w-3" strokeWidth={2} />
      {config.label}
    </span>
  );
}
