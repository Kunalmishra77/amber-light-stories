import type { Metadata } from "next";
import { getPlatformSettings } from "@/lib/branding";

const LAST_UPDATED = "24 July 2026";
/** Where privacy requests are received. Change this if the product moves to a
 * dedicated support address — it is shown publicly and must stay reachable. */
const CONTACT_EMAIL = "kunal.mishra.50999@gmail.com";

export async function generateMetadata(): Promise<Metadata> {
  const { platform_name } = await getPlatformSettings();
  return {
    title: `Privacy Policy — ${platform_name}`,
    description: `How ${platform_name} collects, uses, stores and deletes your data, including data obtained from Google and YouTube APIs.`,
  };
}

export default async function PrivacyPage() {
  const { platform_name } = await getPlatformSettings();

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground sm:text-base">
        <section>
          <p>
            {platform_name} (&quot;we&quot;, &quot;the Service&quot;) produces short-form
            video for a customer&apos;s own YouTube channel. This policy explains what
            data we collect, why, how it is stored, and how to have it deleted. The
            Service is provided to invited business customers; we do not sell data
            and we do not run advertising.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">1. What we collect</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Account data</strong> — the email
              address and name used to create your workspace, and authentication
              records needed to sign you in.
            </li>
            <li>
              <strong className="text-foreground">Provider API keys you supply</strong> —
              your own OpenAI, Google Gemini, ElevenLabs and fal.ai keys. These are
              stored encrypted, scoped to your workspace, and used only to generate
              your content.
            </li>
            <li>
              <strong className="text-foreground">Google / YouTube data</strong> — when
              you connect your channel we receive an OAuth token, your channel
              identity, and the analytics described in section 3.
            </li>
            <li>
              <strong className="text-foreground">Content you and the Service create</strong>{" "}
              — briefs, scripts, generated images, audio, video files, thumbnails,
              titles, descriptions and tags.
            </li>
            <li>
              <strong className="text-foreground">Operational records</strong> — job
              history, per-video generation cost, error logs and audit entries for
              actions taken in your workspace.
            </li>
          </ul>
          <p className="mt-3">
            We do not knowingly collect special-category personal data, and the
            Service is not directed at children.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. How we use it</h2>
          <p className="mt-3">
            Data is used solely to operate the Service for you: to generate and
            render videos, to upload approved videos to the channel you connected,
            to show you analytics for those videos, to bill and support your
            account, and to keep the platform secure. We do not use your content or
            your Google data to train machine-learning models, and we do not share
            it with other customers.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            3. Google user data and Limited Use
          </h2>
          <p className="mt-3">
            When you connect YouTube, you grant scopes that let the Service upload
            videos to your channel, read your channel&apos;s basic details, and read
            your own YouTube Analytics. We use that access only to publish the
            videos you approve and to display your performance data back to you.
          </p>
          <p className="mt-3">
            {platform_name}&apos;s use and transfer of information received from Google
            APIs adheres to the{" "}
            <a
              className="text-primary underline underline-offset-2 hover:text-primary-hover"
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. We do not transfer Google user
            data to third parties except as necessary to provide the Service, do not
            use it for advertising, and do not allow humans to read it except with
            your explicit consent, for security purposes, or where required by law.
          </p>
          <p className="mt-3">
            By using the YouTube features you are also bound by the{" "}
            <a
              className="text-primary underline underline-offset-2 hover:text-primary-hover"
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              YouTube Terms of Service
            </a>{" "}
            and the{" "}
            <a
              className="text-primary underline underline-offset-2 hover:text-primary-hover"
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Privacy Policy
            </a>
            .
          </p>
          <p className="mt-3">
            You can revoke our access at any time from your{" "}
            <a
              className="text-primary underline underline-offset-2 hover:text-primary-hover"
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google account permissions
            </a>{" "}
            page, or by disconnecting the channel inside the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            4. Processors we rely on
          </h2>
          <p className="mt-3">
            The Service sends the minimum data needed to these providers:
            <strong className="text-foreground"> OpenAI</strong> and{" "}
            <strong className="text-foreground">Google Gemini</strong> (script and
            metadata generation), <strong className="text-foreground">fal.ai</strong>{" "}
            (image and video generation),{" "}
            <strong className="text-foreground">ElevenLabs</strong> (voice), and{" "}
            <strong className="text-foreground">YouTube</strong> (publishing and
            analytics). Hosting and storage are provided by{" "}
            <strong className="text-foreground">Supabase</strong> and our own server
            infrastructure. Where you supply your own provider keys, those calls are
            made under your account with that provider and are also governed by their
            terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Storage and security</h2>
          <p className="mt-3">
            Data is stored in managed Postgres and object storage with row-level
            isolation between workspaces, so one customer cannot read another&apos;s
            data. API keys and OAuth tokens are held in an encrypted secrets vault,
            never in plain text and never exposed to the browser. Access is limited
            to the accounts that need it, and privileged actions are recorded in an
            audit log. No system is perfectly secure, but we treat credentials and
            customer content as sensitive by default.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. Retention and deletion</h2>
          <p className="mt-3">
            We keep your workspace data while your account is active. You may ask us
            to delete your workspace at any time; on deletion we remove your account,
            stored credentials, generated media and operational records, except
            anything we must retain for legal or accounting reasons. Videos already
            published to your YouTube channel remain under your control on YouTube —
            deleting your workspace here does not delete them there.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. Your rights</h2>
          <p className="mt-3">
            You can request a copy of your data, ask us to correct it, ask us to
            delete it, or withdraw a permission you previously granted. Write to us
            at the address below and we will respond within a reasonable period.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. Changes</h2>
          <p className="mt-3">
            If this policy changes materially we will update the date at the top of
            this page and, where the change affects how your data is used, notify
            account owners by email.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. Contact</h2>
          <p className="mt-3">
            Privacy questions and deletion requests:{" "}
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
