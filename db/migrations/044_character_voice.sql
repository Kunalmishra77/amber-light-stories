-- Give each character their own narration voice.
--
-- Scenes already carry `character_id`, so the speaker for a scene is already
-- known — what was missing was which ElevenLabs voice that character speaks
-- with. Nullable on purpose: a character without a voice falls back to the
-- workspace's default narrator, so existing workspaces keep behaving exactly
-- as they do today and multi-voice only switches on once someone opts in.

alter table characters
  add column if not exists voice_id text;
