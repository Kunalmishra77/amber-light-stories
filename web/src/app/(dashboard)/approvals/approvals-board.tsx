"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, ExternalLink, X } from "lucide-react";
import { stageLabel } from "@/lib/pipeline/stage-content";
import { approveStage, rejectStage } from "../pipeline/actions";
import { approveItem, disableItem } from "../planner/actions";
import { approveDraftStory, rejectDraftStory } from "./actions";

export interface StageQueueItem {
  id: string;
  stage: string;
  runId: string;
  storyTopic: string | null;
}

export interface PlanQueueItem {
  id: string;
  topic: string | null;
  pillar: string | null;
  scheduledDate: string;
}

export interface StoryQueueItem {
  id: string;
  topic: string | null;
  logline: string | null;
}

type ActionFn = () => Promise<{ ok: boolean; error?: string }>;

function QueueRow({
  title,
  subtitle,
  href,
  onApprove,
  onReject,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  onApprove: ActionFn;
  onReject: ActionFn;
}) {
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: ActionFn) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setRemoved(true);
    });
  }

  if (removed) return null;

  return (
    <li className="flex flex-col gap-1.5 px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p lang="en" className="truncate text-sm font-medium text-foreground">
            {title || "Untitled"}
          </p>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {href ? (
            <Link
              href={href}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
              title="View"
              aria-label="View"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Link>
          ) : null}
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(onApprove)}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
            Approve
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(onReject)}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
            Reject
          </button>
        </div>
      </div>
      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}
    </li>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-elevated shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="tabular-nums text-xs text-muted-foreground">{count}</span>
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </div>
  );
}

export function ApprovalsBoard({
  stageItems,
  planItems,
  storyItems,
}: {
  stageItems: StageQueueItem[];
  planItems: PlanQueueItem[];
  storyItems: StoryQueueItem[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Pipeline stages awaiting review" count={stageItems.length}>
        {stageItems.map((item) => (
          <QueueRow
            key={item.id}
            title={item.storyTopic || "Untitled story"}
            subtitle={stageLabel(item.stage)}
            href="/pipeline"
            onApprove={() => approveStage(item.id)}
            onReject={() => rejectStage(item.id, "Rejected from Content Approval queue.")}
          />
        ))}
      </Section>

      <Section title="Plan items awaiting approval" count={planItems.length}>
        {planItems.map((item) => (
          <QueueRow
            key={item.id}
            title={item.topic || "Untitled topic"}
            subtitle={`${item.pillar ?? "Uncategorized"} · ${item.scheduledDate}`}
            href="/planner"
            onApprove={() => approveItem(item.id)}
            onReject={() => disableItem(item.id)}
          />
        ))}
      </Section>

      <Section title="Draft stories" count={storyItems.length}>
        {storyItems.map((item) => (
          <QueueRow
            key={item.id}
            title={item.topic || "Untitled story"}
            subtitle={item.logline ?? undefined}
            href={`/stories/${item.id}`}
            onApprove={() => approveDraftStory(item.id)}
            onReject={() => rejectDraftStory(item.id)}
          />
        ))}
      </Section>
    </div>
  );
}
