"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { requestPasswordResetAction } from "@/lib/actions/forgot-password";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = (formData.get("email") as string | null)?.trim() ?? "";

    startTransition(async () => {
      await requestPasswordResetAction(email);
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-3 py-2.5 text-xs text-[var(--status-approved)]">
        <MailCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span>If an account exists for that email, a reset link was sent. Check your inbox.</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          placeholder="you@company.com"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Sending…" : "Send reset link"}
        {!isPending ? <ArrowRight className="h-4 w-4" strokeWidth={2} /> : null}
      </button>
    </form>
  );
}
