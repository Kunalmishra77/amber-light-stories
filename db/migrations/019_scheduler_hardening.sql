-- M11 Phase G: scheduler hardening (ADR-034).
-- Explicit misfire policy for windows the engine missed (deploy, outage,
-- worker down). Default 'skip' PRESERVES the existing behaviour exactly, so
-- this migration changes nothing until an operator opts in per schedule.
--   skip     — ignore missed windows; only today's slot is considered (current)
--   run_once — a missed window collapses into a single catch-up run now
--   backfill — enqueue one run per missed day, bounded by backfill_limit_days

alter table schedules add column if not exists misfire_policy text not null default 'skip';
alter table schedules add column if not exists backfill_limit_days int not null default 3;
alter table schedules add column if not exists last_fired_date date;

-- Guard the vocabulary (safe: the default satisfies it for every existing row).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'schedules_misfire_policy_check'
  ) then
    alter table schedules
      add constraint schedules_misfire_policy_check
      check (misfire_policy in ('skip', 'run_once', 'backfill'));
  end if;
end $$;
