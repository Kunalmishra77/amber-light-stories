"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mic, Pause, Play, Search } from "lucide-react";
import { fetchVoicesAction, selectVoiceAction } from "./actions";
import type { ElevenLabsVoice } from "@/lib/providers/elevenlabs-voices";

interface VoicePickerProps {
  /** voice_id currently stored for this workspace, if any. */
  selectedVoiceId: string | null;
}

/**
 * Lets a workspace choose which ElevenLabs voice narrates its videos. The
 * voice list is fetched on demand (a free metadata call made server-side, so
 * the API key never reaches the browser) and the choice is written to the
 * Vault, where the render worker reads it for every job.
 */
export function VoicePicker({ selectedVoiceId }: VoicePickerProps) {
  const [voices, setVoices] = useState<ElevenLabsVoice[] | null>(null);
  const [choice, setChoice] = useState(selectedVoiceId ?? "");
  const [saved, setSaved] = useState<string | null>(selectedVoiceId);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [query, setQuery] = useState("");

  // Which voice's sample is currently playing (voice_id), so each row can play
  // its own preview and only one plays at a time.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Stop audio when the component unmounts — otherwise a sample keeps talking
  // after you navigate away.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // Switching voices stops whatever sample is playing, so the previous one
  // doesn't keep talking under the new selection.
  function chooseVoice(id: string) {
    audioRef.current?.pause();
    setPlayingId(null);
    setChoice(id);
  }

  function togglePreview(voice: ElevenLabsVoice) {
    if (!voice.preview_url) return;
    // Clicking the one that's playing stops it.
    if (playingId === voice.voice_id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(voice.preview_url);
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    void audio
      .play()
      .then(() => setPlayingId(voice.voice_id))
      .catch(() => setPlayingId(null));
  }

  function load() {
    setError(null);
    startLoading(async () => {
      const result = await fetchVoicesAction();
      if (!result.ok || !result.voices) {
        setError(result.error ?? "Couldn't load voices.");
        return;
      }
      setVoices(result.voices);
      // Keep the stored voice selected if it's still on the account.
      if (saved && result.voices.some((v) => v.voice_id === saved)) setChoice(saved);
    });
  }

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await selectVoiceAction(choice);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the voice.");
        return;
      }
      setSaved(choice);
    });
  }

  const selectedName = voices?.find((v) => v.voice_id === saved)?.name;
  const dirty = choice !== "" && choice !== saved;

  const selectedVoice = voices?.find((v) => v.voice_id === choice) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = (voices ?? []).filter(
    (v) =>
      !q ||
      v.name.toLowerCase().includes(q) ||
      (v.category ?? "").toLowerCase().includes(q)
  );

  return (
    <section className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
          <Mic className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Narration voice</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The voice every video on this channel is narrated with, chosen from
            your own ElevenLabs account.
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {saved ? (
          <>
            Current voice:{" "}
            <span className="font-medium text-foreground">
              {selectedName ?? saved}
            </span>
          </>
        ) : (
          "No voice chosen yet — videos use the platform default."
        )}
      </p>

      {voices === null ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : null}
            {loading ? "Loading voices…" : "Load voices from ElevenLabs"}
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {/* Search filters what the dropdown lists — handy once an account has
              many voices. */}
          <div className="flex flex-col gap-2 sm:max-w-sm">
            <label htmlFor="voice-search" className="sr-only">
              Search voices
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                strokeWidth={2}
                aria-hidden="true"
              />
              <input
                id="voice-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={saving}
                placeholder={`Search ${voices.length} voices by name…`}
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50"
              />
            </div>

            <label htmlFor="voice" className="sr-only">
              Narration voice
            </label>
            <select
              id="voice"
              value={choice}
              onChange={(e) => chooseVoice(e.target.value)}
              disabled={saving}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary disabled:opacity-50"
            >
              <option value="">Choose a voice…</option>
              {filtered.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name}
                  {v.category ? ` — ${v.category}` : ""}
                </option>
              ))}
            </select>
            {q && filtered.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                No voice matches &ldquo;{query}&rdquo;.
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => selectedVoice && togglePreview(selectedVoice)}
              disabled={!selectedVoice?.preview_url}
              title={
                selectedVoice?.preview_url
                  ? "Hear a sample of this voice"
                  : "Pick a voice with a sample to preview it"
              }
              className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              {playingId && playingId === choice ? (
                <Pause className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <Play className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {playingId && playingId === choice ? "Stop" : "Play sample"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : null}
              {saving ? "Saving…" : "Save voice"}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-[var(--status-failed)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </p>
      ) : null}

      {!error && saved && !dirty && voices !== null ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-[var(--status-approved)]">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span>Saved — new videos will use this voice.</span>
        </p>
      ) : null}
    </section>
  );
}
