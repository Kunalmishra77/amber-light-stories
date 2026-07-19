"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface TotpFactor {
  id: string;
  friendly_name?: string;
  status: string;
  created_at: string;
}

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-foreground outline-none placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";

/**
 * Real Supabase MFA (TOTP) enrollment — supabase.auth.mfa.enroll/challenge/
 * verify, using the browser client (auth cookie session). Runs entirely
 * client-side since the QR code / secret only exist on the client response.
 *
 * Gracefully degrades to a "not enabled for this project" notice if the
 * Supabase project doesn't have MFA turned on (listFactors throws) —
 * this never blocks the build or the rest of the Security page.
 */
export function TwoFactorSection() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();

  const loadFactors = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      setFactors(((data?.totp ?? []) as TotpFactor[]).filter((f) => f.status === "verified"));
      setSupported(true);
    } catch {
      setSupported(false);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadFactors();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFactors]);

  function startEnroll() {
    setError(null);
    startTransition(async () => {
      try {
        const { data, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
        });
        if (enrollError) throw enrollError;
        setFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setEnrolling(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't start 2FA enrollment.");
      }
    });
  }

  function cancelEnroll() {
    const idToDrop = factorId;
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setCode("");
    // Best-effort cleanup so an abandoned enrollment doesn't linger unverified.
    if (idToDrop) {
      void supabase.auth.mfa.unenroll({ factorId: idToDrop }).catch(() => {});
    }
  }

  function verifyCode() {
    if (!factorId || code.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
        if (challengeError) throw challengeError;
        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId,
          challengeId: challenge.id,
          code: code.trim(),
        });
        if (verifyError) throw verifyError;
        setEnrolling(false);
        setQrCode(null);
        setSecret(null);
        setFactorId(null);
        setCode("");
        await loadFactors();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That code didn't verify — check your app and try again.");
      }
    });
  }

  function removeFactor(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: id });
        if (unenrollError) throw unenrollError;
        await loadFactors();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't remove this authenticator.");
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        Checking two-factor status…
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
          <p className="mt-1 max-w-lg text-xs text-muted-foreground">
            2FA (TOTP) isn&apos;t enabled for this project yet — enrollment will appear here automatically
            once it is.
          </p>
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-border bg-elevated px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Coming soon
        </span>
      </div>
    );
  }

  const enabled = factors.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div
          className={
            enabled
              ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--status-approved)]/10 text-[var(--status-approved)]"
              : "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted-foreground"
          }
        >
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
          <p className="mt-1 max-w-lg text-xs text-muted-foreground">
            Add a time-based one-time-password (TOTP) authenticator app for an extra layer of protection
            on top of your password.
          </p>
        </div>
        {enabled ? (
          <span className="ml-auto shrink-0 rounded-full border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--status-approved)]">
            Enabled
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      {enabled ? (
        <ul className="flex flex-col gap-2">
          {factors.map((factor) => (
            <li
              key={factor.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                {factor.friendly_name || "Authenticator app"}
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => removeFactor(factor.id)}
                aria-label={`Remove ${factor.friendly_name || "authenticator app"}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--status-failed)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" strokeWidth={2} />
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!enabled && !enrolling ? (
        <button
          type="button"
          onClick={startEnroll}
          disabled={isPending}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Starting…" : "Enable 2FA"}
        </button>
      ) : null}

      {enrolling ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-start">
          {qrCode ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrCode}
              alt="Scan this QR code with your authenticator app"
              className="h-36 w-36 shrink-0 rounded-lg border border-border bg-white p-2"
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <p className="text-xs font-medium text-foreground">
                1. Scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password…)
              </p>
              {secret ? (
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                  Or enter this key manually: {secret}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="totp-code" className="text-xs font-medium text-foreground">
                2. Enter the 6-digit code it shows
              </label>
              <input
                id="totp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className={`${FIELD_CLASS} mt-1.5`}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={verifyCode}
                disabled={isPending || code.trim().length < 6}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                )}
                Verify & enable
              </button>
              <button
                type="button"
                onClick={cancelEnroll}
                disabled={isPending}
                className="inline-flex items-center rounded-lg border border-border bg-elevated px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
