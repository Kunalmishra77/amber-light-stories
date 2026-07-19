"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Save, UploadCloud, User } from "lucide-react";
import { updateProfile, uploadAvatar } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50";
const LABEL_CLASS = "text-xs font-medium text-foreground";

export interface ProfileData {
  full_name: string | null;
  avatar: string | null;
  email: string;
  roles: string[];
}

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, startUpload] = useTransition();
  const avatarFormRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateProfile(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save your profile.");
        return;
      }
      setSaved(true);
    });
  }

  function handleAvatarSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAvatarError(null);
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setAvatarError("Choose an image file to upload.");
      return;
    }
    const preview = URL.createObjectURL(file);
    setAvatarUrl(preview);

    startUpload(async () => {
      const result = await uploadAvatar(formData);
      if (!result.ok) {
        setAvatarError(result.error ?? "Upload failed. Please try again.");
        setAvatarUrl(profile.avatar);
        return;
      }
      if (result.avatarUrl) setAvatarUrl(result.avatarUrl);
      avatarFormRef.current?.reset();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Photo</h2>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
              <img src={avatarUrl} alt="Your avatar" className="h-full w-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
          <form ref={avatarFormRef} onSubmit={handleAvatarSubmit} className="flex flex-1 flex-col gap-2">
            <input
              type="file"
              name="file"
              accept="image/*"
              disabled={isUploading}
              className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/15 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isUploading}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadCloud className="h-3.5 w-3.5" strokeWidth={1.75} />
              {isUploading ? "Uploading…" : "Upload photo"}
            </button>
            {avatarError ? <span className="text-xs text-[var(--status-failed)]">{avatarError}</span> : null}
          </form>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="full_name" className={LABEL_CLASS}>
              Full name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              disabled={isPending}
              defaultValue={profile.full_name ?? ""}
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL_CLASS}>Email</label>
            <input
              type="email"
              readOnly
              disabled
              value={profile.email}
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={LABEL_CLASS}>Role(s)</label>
            <div className="flex flex-wrap gap-1.5">
              {profile.roles.length === 0 ? (
                <span className="text-xs text-muted-foreground">No active memberships.</span>
              ) : (
                profile.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs capitalize text-muted-foreground"
                  >
                    {role.replace(/_/g, " ")}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-3 py-2 text-xs text-[var(--status-failed)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span>{error}</span>
          </div>
        ) : null}

        {saved && !error ? (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-3 py-2 text-xs text-[var(--status-approved)]">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span>Profile saved.</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2} />
          {isPending ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}
