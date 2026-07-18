"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2, ShieldQuestion, XCircle } from "lucide-react";
import { validateCredentialAction } from "../actions";
import { FIELD_CLASS, LABEL_CLASS } from "../field-styles";
import { REQUIRED_PROVIDERS, type ApiStatus, type CredentialProvider } from "@/lib/onboarding/types";

const PROVIDER_META: Record<string, { label: string; placeholder: string; helper: string }> = {
  openai: { label: "OpenAI", placeholder: "sk-…", helper: "Scripts, prompts & reasoning." },
  gemini: { label: "Google Gemini", placeholder: "AIza…", helper: "Image & video generation prompts." },
  elevenlabs: { label: "ElevenLabs", placeholder: "Your ElevenLabs API key", helper: "Narration voiceovers." },
  fal: { label: "fal.ai", placeholder: "key_id:key_secret", helper: "Image & video rendering." },
};

const OPTIONAL_PROVIDERS = [
  { key: "youtube", label: "YouTube" },
  { key: "gmail", label: "Gmail" },
];

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
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-elevated p-6 shadow-xl shadow-black/5 dark:shadow-black/40 sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">API credentials</h2>
        <p className="text-sm text-muted-foreground">
          These power your automated content pipeline. Keys are validated live and stored encrypted — we never
          display them again.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-border">
        {REQUIRED_PROVIDERS.map((provider) => {
          const meta = PROVIDER_META[provider];
          const entry = apiStatus[provider];
          const busy = isPending && pendingProvider === provider;
          return (
            <div key={provider} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`cred-${provider}`} className={LABEL_CLASS}>
                  {meta.label} <span className="text-primary">*</span>
                </label>
                <StatusPill entry={entry} />
              </div>
              <p className="text-xs text-muted-foreground">{meta.helper}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={`cred-${provider}`}
                  ref={(el) => {
                    inputRefs.current[provider] = el;
                  }}
                  type="password"
                  autoComplete="off"
                  placeholder={meta.placeholder}
                  disabled={busy}
                  className={`${FIELD_CLASS} sm:flex-1`}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => validate(provider)}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
                  {busy ? "Validating…" : "Validate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-surface/60 p-4">
        <p className="text-xs font-medium text-foreground">Optional — connect later</p>
        {OPTIONAL_PROVIDERS.map((p) => (
          <div key={p.key} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{p.label}</span>
            <span className="rounded-full border border-border px-2 py-0.5">
              Connect via Google in workspace after approval — optional now
            </span>
          </div>
        ))}
      </div>

      {!allRequiredConnected ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs text-muted-foreground">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>
            Connect all four required providers to unlock submission. You can continue and finish these later — the
            final step will remind you.
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function StatusPill({ entry }: { entry?: { status: string; message?: string } }) {
  if (!entry || entry.status === "not_started") {
    return <span className="text-[11px] text-muted-foreground">Not connected</span>;
  }
  if (entry.status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--status-approved)]">
        <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> Connected
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--status-failed)]"
      title={entry.message}
    >
      <XCircle className="h-3 w-3" strokeWidth={2} /> {entry.message ?? "Failed"}
    </span>
  );
}
