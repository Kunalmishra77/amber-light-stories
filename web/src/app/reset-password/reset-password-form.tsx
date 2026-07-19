"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resetPasswordAction } from "@/lib/actions/password";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";

type LinkState = "verifying" | "ready" | "invalid";

/**
 * The password-reset email link carries a one-time PKCE `code` in the URL.
 * The Supabase browser client (createClient in @/lib/supabase/client, with
 * detectSessionInUrl enabled) exchanges it for a recovery session
 * automatically on load — we just need to wait for the PASSWORD_RECOVERY
 * event (or an already-established session) before showing the form.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [linkState, setLinkState] = useState<LinkState>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setLinkState("ready");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setLinkState("ready");
      }
    });

    // If no recovery session shows up in a few seconds, the link is
    // missing/expired/already used.
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setLinkState((current) => (current === "verifying" ? "invalid" : current));
      }
    }, 4000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    resetPasswordAction(password)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Couldn't update your password.");
          setIsSubmitting(false);
          return;
        }
        router.replace("/login?reset=1");
      })
      .catch(() => {
        setError("Couldn't update your password. Please try again.");
        setIsSubmitting(false);
      });
  }

  if (linkState === "verifying") {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        Verifying your reset link…
      </div>
    );
  }

  if (linkState === "invalid") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>This reset link is invalid or has expired. Please request a new one.</span>
        </div>
        <a
          href="/forgot-password"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          Request a new link
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="text-xs font-medium text-foreground">
          New password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={isSubmitting}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          className={FIELD_CLASS}
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className="text-xs font-medium text-foreground">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          disabled={isSubmitting}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="••••••••"
          className={FIELD_CLASS}
        />
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Updating…" : "Update password"}
        {!isSubmitting ? <ArrowRight className="h-4 w-4" strokeWidth={2} /> : null}
      </button>
    </form>
  );
}
