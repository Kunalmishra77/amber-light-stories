-- Link a scene to the character featured in it.
--
-- The character library, the appearance/seed consistency in
-- pipeline.orchestrator._load_character_refs, and the "Feature a character"
-- pickers all read/write scenes.character_id — but the column never existed,
-- so assigning a character to a video failed with "Could not find the
-- 'character_id' column of 'scenes'". This adds it, so a created character can
-- actually appear (same face + voice) across a video's scenes.
alter table scenes
  add column if not exists character_id uuid references characters(id) on delete set null;

create index if not exists idx_scenes_character_id
  on scenes (character_id)
  where character_id is not null;

-- PostgREST caches the schema; tell it to pick up the new column immediately.
notify pgrst, 'reload schema';
