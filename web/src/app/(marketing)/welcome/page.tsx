import Link from "next/link";
import type { Metadata } from "next";
import {
  BadgeCheck,
  BarChart3,
  KeyRound,
  Languages,
  Mic,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { getPlatformSettings } from "@/lib/branding";

export async function generateMetadata(): Promise<Metadata> {
  const { platform_name } = await getPlatformSettings();
  return {
    title: `${platform_name} — AI short-form video, published for you`,
    description:
      "Turn an idea into a finished vertical video — AI visuals, real narration, captions and metadata — reviewed by you and published straight to your YouTube channel.",
  };
}

const FEATURES = [
  {
    icon: Sparkles,
    title: "Real AI video, not slideshows",
    body: "Every scene gets an AI-generated keyframe that is then animated into a moving clip, assembled into a finished 1080×1920 vertical video.",
  },
  {
    icon: Mic,
    title: "Narration in your voice",
    body: "Scripts are voiced with ElevenLabs, so each channel keeps its own consistent sound across every upload.",
  },
  {
    icon: Languages,
    title: "Hindi and English captions",
    body: "Burned-in captions render correctly in Devanagari and Latin scripts — most short-form is watched on mute.",
  },
  {
    icon: KeyRound,
    title: "Your own provider keys",
    body: "You bring your own OpenAI, Gemini, ElevenLabs and fal.ai keys. They are stored encrypted, scoped to your workspace alone, and used only for your videos.",
  },
  {
    icon: Wallet,
    title: "A hard cost ceiling",
    body: "A per-video budget is enforced in code. When a scene would exceed it, the pipeline automatically falls back to a cheaper render instead of overspending.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing publishes without you",
    body: "Every video waits for your review. You approve it — then it uploads to your channel. Never the other way round.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect your channel",
    body: "Sign in, add your provider keys, and connect your YouTube channel with Google.",
  },
  {
    n: "02",
    title: "Set your content plan",
    body: "Describe your niche, characters and posting schedule. The plan drives every script.",
  },
  {
    n: "03",
    title: "Review what was made",
    body: "Scripts, visuals, voice-over and thumbnail arrive ready. Approve, request changes, or reject.",
  },
  {
    n: "04",
    title: "Publish and track",
    body: "Approved videos upload to your channel, and views and watch time flow back into your dashboard.",
  },
];

export default async function WelcomePage() {
  const { platform_name } = await getPlatformSettings();

  return (
    <>
      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-3 py-1 text-xs font-medium text-muted-foreground">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
            Built for creators and agencies
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Your YouTube channel,
            <span className="text-primary"> on autopilot</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {platform_name} turns an idea into a finished short-form video — AI
            visuals, real narration, captions and metadata — then waits for your
            approval before publishing it to your channel.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover sm:w-auto"
            >
              Sign in to your studio
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-elevated px-6 py-3 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-surface sm:w-auto"
            >
              See how it works
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Invite-only. Your account is created for you by your {platform_name} manager.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-elevated p-6 shadow-sm"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface">
                <Icon className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 pb-20 sm:px-6"
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            How it works
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Four steps from an empty channel to a published video.
          </p>
        </div>
        <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ n, title, body }) => (
            <li key={n} className="rounded-xl border border-border bg-elevated p-6 shadow-sm">
              <span className="text-xs font-semibold tracking-widest text-primary">{n}</span>
              <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Analytics / closing CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="rounded-2xl border border-border bg-elevated p-8 text-center shadow-sm sm:p-12">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface">
            <BarChart3 className="h-5 w-5 text-accent" strokeWidth={2} aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            See what each video actually did
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Views, watch time and subscribers flow back from YouTube into your
            dashboard, so the next script is informed by the last one.
          </p>
          <Link
            href="/login"
            className="mt-7 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover"
          >
            Sign in to your studio
          </Link>
        </div>
      </section>
    </>
  );
}
