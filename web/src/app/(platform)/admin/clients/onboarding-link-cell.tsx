"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { StatusBadge, type PipelineStatus } from "@/components/status-badge";

const ONBOARDING_STATUS_BADGE: Record<string, PipelineStatus> = {
  created: "pending",
  in_progress: "running",
  submitted: "awaiting_review",
  approved: "approved",
  rejected: "rejected",
  changes_requested: "paused",
};

interface OnboardingLinkCellProps {
  token: string;
  status: string;
}

/** Status pill + copy-link button for a tenant's onboarding row on /admin/clients. */
export function OnboardingLinkCell({ token, status }: OnboardingLinkCellProps) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const url = `${window.location.origin}/onboarding/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable — nothing to fall back to in a table cell.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={ONBOARDING_STATUS_BADGE[status] ?? status} />
      {status !== "approved" ? (
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" strokeWidth={2} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
          {copied ? "Copied" : "Copy link"}
        </button>
      ) : null}
    </div>
  );
}
