"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { changePasswordAction } from "@/lib/actions/password";
import { signOutAction } from "@/lib/actions/auth";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";

interface ChangePasswordFormProps {
  email: string;
}

export function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    startTransition(async () => {
      const result = await changePasswordAction(password);
      if (!result.ok) {
        setError(result.error ?? "Couldn't update your password.");
        return;
      }
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground">Signed in as</label>
        <div className="w-full truncate rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-muted-foreground">
          {email}
        </div>
      </div>

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
          disabled={isPending}
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
          disabled={isPending}
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
        disabled={isPending}
        className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Updating…" : "Update password"}
        {!isPending ? <ArrowRight className="h-4 w-4" strokeWidth={2} /> : null}
      </button>
      </form>

      <form action={signOutAction} className="text-center">
        <button
          type="submit"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Sign in as someone else
        </button>
      </form>
    </div>
  );
}
