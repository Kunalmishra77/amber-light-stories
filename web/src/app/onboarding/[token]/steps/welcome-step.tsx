"use client";

import { ChevronRight, ShieldCheck } from "lucide-react";
import {
  Lightbulb,
  FileText,
  Clapperboard,
  Mic2,
  Film,
  UserCheck,
  Rocket,
  type LucideIcon,
} from "lucide-react";

interface WelcomeStepProps {
  platformName: string;
  onNext: () => void;
}

const PIPELINE: { icon: LucideIcon; label: string; caption: string }[] = [
  { icon: Lightbulb, label: "Topic", caption: "AI finds a trending idea for your niche" },
  { icon: FileText, label: "Script", caption: "A full narration script is written" },
  { icon: Clapperboard, label: "Scenes", caption: "Cinematic scenes are planned & designed" },
  { icon: Mic2, label: "Voice", caption: "Natural narration is recorded" },
  { icon: Film, label: "Video", caption: "Everything is assembled into a video" },
  { icon: UserCheck, label: "Your review", caption: "You watch it and approve, or ask for changes" },
  { icon: Rocket, label: "Publish", caption: "It goes live — only once you say go" },
];

/**
 * Step 0 — a full-width welcome/education screen shown before any data is
 * collected. Purely informational: sets expectations for a non-technical
 * client so the rest of the wizard (business info, API keys, plan) reads as
 * "filling in the blanks" rather than a cold start.
 */
export function WelcomeStep({ platformName, onNext }: WelcomeStepProps) {
  return (
    <div className="flex flex-col gap-8 rounded-2xl border border-border bg-elevated p-6 shadow-xl shadow-black/5 dark:shadow-black/40 sm:p-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Welcome to {platformName}
        </h1>
        <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
          You&rsquo;re a few minutes away from an AI studio that writes, voices, and edits videos for you — around
          the clock. No editing skills needed. We&rsquo;ll walk you through everything, one simple step at a time.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          How a video gets made
        </h2>
        <div className="flex flex-wrap items-stretch justify-center gap-y-6">
          {PIPELINE.map((step, i) => (
            <div key={step.label} className="flex items-center">
              <div className="flex w-24 flex-col items-center gap-2 text-center sm:w-28">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <step.icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-foreground">{step.label}</span>
                  <span className="text-[10px] leading-snug text-muted-foreground">{step.caption}</span>
                </div>
              </div>
              {i < PIPELINE.length - 1 ? (
                <ChevronRight
                  className="mx-0.5 hidden h-4 w-4 shrink-0 self-start mt-4 text-muted-foreground/50 sm:block"
                  strokeWidth={2}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
        <p className="text-xs leading-relaxed text-foreground">
          <strong className="font-semibold">AI generates every video — you approve every step.</strong> Nothing is
          ever published to your channel without your review and OK.
        </p>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          Let&rsquo;s get started
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
