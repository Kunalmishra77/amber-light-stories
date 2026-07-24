-- Track which incidents the operator has already been emailed about.
--
-- Incidents were written to `security_incidents` and nobody was told. A dead
-- render (raised by the Python render worker) or a workspace failing every job
-- sat there until a client complained.
--
-- A nullable timestamp is all the state an alert sweep needs: it selects
-- high/critical incidents where this is null, emails one digest, then stamps
-- them. If the email fails the stamp is not written, so the next sweep retries
-- rather than silently dropping the alert. Backfilled to now() so the first
-- sweep does not email about every historical incident at once.

alter table security_incidents
  add column if not exists alerted_at timestamptz;

update security_incidents
set alerted_at = now()
where alerted_at is null;

create index if not exists security_incidents_unalerted_idx
  on security_incidents (severity, alerted_at)
  where alerted_at is null;
