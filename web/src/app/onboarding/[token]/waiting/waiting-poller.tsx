"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { getOnboardingStatusAction } from "../actions";

interface WaitingPollerProps {
  token: string;
  initialStatus: string;
  initialNotes: string | null;
  businessName: string;
  ownerEmail: string | null;
}

const POLL_INTERVAL_MS = 3000;

export function WaitingPoller({ token, initialStatus, initialNotes, businessName, ownerEmail }: WaitingPollerProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const redirected = useRef(false);

  // Poll while the outcome could still change. approved/rejected are terminal.
  useEffect(() => {
    if (status === "approved" || status === "rejected") return;

    let cancelled = false;
    const interval = setInterval(async () => {
      const result = await getOnboardingStatusAction(token);
      if (!cancelled && result) {
        setStatus(result.status);
        setNotes(result.notes);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, status]);

  useEffect(() => {
    if (status === "approved" && !redirected.current) {
      redirected.current = true;
      router.push("/login?onboarded=1");
    }
  }, [status, router]);

  if (status === "rejected") {
    return (
      <StateCard
        icon={MailWarning}
        color="var(--status-failed)"
        title="This request wasn't approved"
        description={notes || "Please contact your Amber Light Stories contact for details."}
      />
    );
  }

  if (status === "changes_requested") {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-border bg-elevated p-8 text-center shadow-xl shadow-black/5 dark:shadow-black/40">
        <IconBadge icon={MailWarning} color="var(--status-paused)" />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold text-foreground">Changes requested</h1>
          <p className="text-sm text-muted-foreground">
            Your reviewer asked for a few updates before approving {businessName}.
          </p>
        </div>
        {notes ? (
          <p className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-xs text-foreground">
            {notes}
          </p>
        ) : null}
        <a
          href={`/onboarding/${token}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          Back to the form
        </a>
      </div>
    );
  }

  if (status === "approved") {
    return (
      <StateCard
        icon={CheckCircle2}
        color="var(--status-approved)"
        title="Approved!"
        description="Redirecting you to sign in…"
      />
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-border bg-elevated p-8 text-center shadow-xl shadow-black/5 dark:shadow-black/40">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Loader2 className="h-7 w-7 animate-spin" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold text-foreground">Waiting for Super Admin approval</h1>
        <p className="text-sm text-muted-foreground">
          Thanks{ownerEmail ? `, ${ownerEmail}` : ""} — {businessName} has been submitted for review. Our team is
          reviewing your setup and you&rsquo;ll get access shortly. We&rsquo;ll take you straight to sign in the
          moment it&rsquo;s approved — feel free to leave this page open, it checks automatically.
        </p>
      </div>
    </div>
  );
}

function IconBadge({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-2xl"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      <Icon className="h-7 w-7" strokeWidth={1.75} />
    </div>
  );
}

function StateCard({
  icon,
  color,
  title,
  description,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-border bg-elevated p-8 text-center shadow-xl shadow-black/5 dark:shadow-black/40">
      <IconBadge icon={icon} color={color} />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
