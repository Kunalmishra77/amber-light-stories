"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, Check, Copy, UserPlus } from "lucide-react";
import { inviteMember } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

const ROLE_OPTIONS = [
  { value: "client_manager", label: "Manager" },
  { value: "client_editor", label: "Editor" },
  { value: "client_viewer", label: "Viewer" },
];

export function InviteForm() {
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInviteUrl(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await inviteMember(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't create the invite.");
        return;
      }
      setInviteUrl(result.inviteUrl ?? null);
      formRef.current?.reset();
    });
  }

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable — the link is still visible to select/copy manually.
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <UserPlus className="h-4 w-4 text-primary" strokeWidth={1.75} />
        Invite a member
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-email" className={LABEL_CLASS}>
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            disabled={isPending}
            placeholder="teammate@example.com"
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className={LABEL_CLASS}>
            Role
          </label>
          <select
            id="invite-role"
            name="role"
            disabled={isPending}
            defaultValue="client_editor"
            className={FIELD_CLASS}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
            {isPending ? "Creating…" : "Create invite"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      {inviteUrl ? (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">
            Share this link with your teammate. Email delivery isn&apos;t wired up yet — copy and
            send it yourself.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-elevated"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[var(--status-approved)]" strokeWidth={2} />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
