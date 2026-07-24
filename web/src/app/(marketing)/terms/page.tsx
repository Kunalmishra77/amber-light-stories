import type { Metadata } from "next";
import { getPlatformSettings } from "@/lib/branding";

const LAST_UPDATED = "24 July 2026";
const CONTACT_EMAIL = "kunal.mishra.50999@gmail.com";

export async function generateMetadata(): Promise<Metadata> {
  const { platform_name } = await getPlatformSettings();
  return {
    title: `Terms of Service — ${platform_name}`,
    description: `The terms that govern use of ${platform_name}.`,
  };
}

export default async function TermsPage() {
  const { platform_name } = await getPlatformSettings();

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Terms of Service
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground sm:text-base">
        <section>
          <p>
            These terms govern your use of {platform_name} (&quot;the Service&quot;). By
            signing in you agree to them. If you are using the Service on behalf of a
            company, you confirm you are authorised to accept these terms for it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">1. The Service</h2>
          <p className="mt-3">
            {platform_name} generates short-form video — script, visuals, narration,
            captions and metadata — and, once you approve it, uploads it to the
            YouTube channel you connected. The Service is provided to invited
            business customers; accounts are created for you rather than
            self-registered.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. Your account</h2>
          <p className="mt-3">
            Keep your login credentials confidential and tell us promptly if you
            believe they have been misused. You are responsible for activity carried
            out under your account, including by team members you invite.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            3. Your provider keys and costs
          </h2>
          <p className="mt-3">
            You supply your own OpenAI, Google Gemini, ElevenLabs and fal.ai keys.
            Generation is billed by those providers directly to you, under your
            agreement with them. The Service enforces a per-video budget ceiling and
            degrades to cheaper rendering rather than exceeding it, but it cannot
            guarantee any particular provider price, and you remain responsible for
            charges incurred on your keys. Keep enough credit with those providers
            for generation to succeed.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            4. Your content and ownership
          </h2>
          <p className="mt-3">
            As between you and us, you own the briefs you provide and the videos
            produced for your workspace. You grant us only the permission needed to
            operate the Service — to process your inputs, generate the output, store
            it, and upload approved videos to your channel. We claim no ownership of
            your channel or its revenue.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            5. You approve what is published
          </h2>
          <p className="mt-3">
            Videos are not published automatically without your approval. You are
            responsible for reviewing each video before approving it, and for the
            content once it is on your channel — including its accuracy, its rights
            clearances, and any disclosure that it contains synthetic or
            AI-generated material where a platform or law requires it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. Acceptable use</h2>
          <p className="mt-3">You must not use the Service to produce or publish:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>content that infringes someone else&apos;s copyright, trademark or likeness;</li>
            <li>content that is unlawful, defamatory, harassing, or sexually explicit;</li>
            <li>content that impersonates a real person or organisation deceptively;</li>
            <li>
              content that breaches the{" "}
              <a
                className="text-primary underline underline-offset-2 hover:text-primary-hover"
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
              >
                YouTube Terms of Service
              </a>{" "}
              or YouTube&apos;s community and monetisation policies.
            </li>
          </ul>
          <p className="mt-3">
            You must also not attempt to access another customer&apos;s workspace,
            probe or disrupt the platform, or resell access without our agreement.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. Availability</h2>
          <p className="mt-3">
            We aim to keep the Service running and improving, but it is provided on
            an &quot;as is&quot; basis without an uptime guarantee. Generation depends
            on third-party providers and on YouTube; outages, rate limits or policy
            changes at those providers can delay or block a video. We may change or
            discontinue features, and will give reasonable notice of material
            changes that affect you.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. Fees</h2>
          <p className="mt-3">
            Any subscription or service fee is what was agreed with you in writing,
            separately from the provider costs in section 3. Non-payment may lead to
            suspension after notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. Suspension and termination</h2>
          <p className="mt-3">
            You may stop using the Service at any time and ask us to delete your
            workspace. We may suspend or terminate an account that breaches these
            terms, creates legal risk, or endangers the platform&apos;s security. On
            termination we delete workspace data as described in the Privacy Policy;
            videos already on your YouTube channel remain yours.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">10. Liability</h2>
          <p className="mt-3">
            To the extent permitted by law, we are not liable for indirect or
            consequential loss, lost profit, lost revenue, or loss of channel
            standing, and our total liability for any claim is limited to the
            service fees you paid us in the three months before the claim arose.
            Nothing here excludes liability that cannot lawfully be excluded.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">11. Changes to these terms</h2>
          <p className="mt-3">
            If these terms change materially we will update the date above and
            notify account owners by email. Continuing to use the Service after that
            means you accept the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">12. Contact</h2>
          <p className="mt-3">
            Questions about these terms:{" "}
            <a
              className="text-primary underline underline-offset-2 hover:text-primary-hover"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
