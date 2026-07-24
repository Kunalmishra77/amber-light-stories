-- Expiring onboarding links.
--
-- The onboarding link is a bearer credential: whoever holds the URL can fill in
-- a client's business details and paste their provider API keys. Until now it
-- never expired, so a link forwarded to the wrong person — or sitting in an old
-- email thread — stayed usable forever.
--
-- 48 hours is long enough for a client to finish onboarding and short enough
-- that a stale link stops working. The window only bites while the onboarding is
-- still EDITABLE (created / in_progress); once the client has submitted, the
-- link keeps resolving so they can still see their status, and an admin
-- requesting changes re-opens the window (see the admin onboarding action).

alter table onboarding
  add column if not exists link_expires_at timestamptz;

-- Backfill: existing links get 48h from when they were created, so anything
-- already older than that is closed immediately.
update onboarding
set link_expires_at = coalesce(created_at, now()) + interval '48 hours'
where link_expires_at is null;

alter table onboarding
  alter column link_expires_at set default now() + interval '48 hours';
