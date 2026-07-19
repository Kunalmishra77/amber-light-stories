"use client";

import Link from "next/link";
import { AudioLines, ArrowRight, SlidersHorizontal } from "lucide-react";
import { updateVoiceSettings } from "./actions";
import { SectionCard } from "./section-card";
import { SettingsForm } from "./settings-form";
import { FIELD_CLASS, LABEL_CLASS } from "./field-styles";

export interface VoiceOption {
  id: string;
  name: string | null;
  provider: string | null;
  language: string | null;
}

export function VoiceForm({
  voices,
  defaultVoiceId,
  canEdit,
}: {
  voices: VoiceOption[];
  defaultVoiceId: string;
  canEdit: boolean;
}) {
  return (
    <SectionCard
      id="voice"
      icon={AudioLines}
      title="Voice & AI"
      description="Default narration voice for new stories, plus model routing for every pipeline stage."
      action={
        <Link
          href="/settings/models"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
          AI Model Settings
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      }
    >
      {voices.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No voices configured yet.{" "}
          <Link href="/voices" className="text-primary hover:text-primary-hover">
            Add a voice
          </Link>{" "}
          to set a default here.
        </p>
      ) : (
        <SettingsForm action={updateVoiceSettings} canEdit={canEdit} savedMessage="Default voice saved.">
          <div className="flex flex-col gap-1.5 sm:max-w-sm">
            <label htmlFor="default_voice_id" className={LABEL_CLASS}>
              Default narration voice
            </label>
            <select
              id="default_voice_id"
              name="default_voice_id"
              defaultValue={defaultVoiceId}
              className={FIELD_CLASS}
            >
              <option value="">No default — choose per story</option>
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name || "Untitled voice"}
                  {voice.language ? ` · ${voice.language}` : ""}
                  {voice.provider ? ` · ${voice.provider}` : ""}
                </option>
              ))}
            </select>
          </div>
        </SettingsForm>
      )}
    </SectionCard>
  );
}
