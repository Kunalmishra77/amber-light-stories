-- 011_operator_membership_removal.sql
-- Migration epic M1 (platform/tenant separation & isolation), slice 2.
-- Closes ISS-C1: a platform operator (super admin) must hold ZERO tenant
-- memberships. Operators reach a client workspace only via the audited
-- "View as Workspace" impersonation (Bible Part 2 / ADR-002, ADR-050).
--
-- Reversible: see the ROLLBACK section at the bottom. Before running, a
-- row-level backup of the affected memberships is captured in
-- db/backups/m1-operator-memberships.json.
--
-- SPLIT EXECUTION NOTE:
--   * Section A (data removal) is executed programmatically via the
--     service-role key (PostgREST DELETE bypasses RLS). This is the
--     essential ISS-C1 fix and has been applied + verified.
--   * Section B (by-design DB enforcement trigger) is DDL and must be run
--     in the Supabase SQL editor (the service-role JWT cannot run DDL, and
--     no Postgres superuser password is provisioned to this environment).
--     It is OPTIONAL defense-in-depth: the application already never creates
--     operator memberships, and auth.getCurrentTenantId() ignores any
--     operator membership by design. Apply it when convenient.

-- =====================================================================
-- Section A — DATA: remove every membership held by a super admin.
-- Idempotent: re-running removes nothing further.
-- =====================================================================
DELETE FROM public.memberships m
USING public.profiles p
WHERE m.user_id = p.user_id
  AND p.is_super_admin = true;

-- =====================================================================
-- Section B — BY DESIGN (optional, DDL — run in Supabase SQL editor):
-- block creating/holding a membership for a super admin. Enforces the
-- invariant at the database. (Fires on membership insert/update only; a
-- later refinement can also guard profile promotion — out of M1 scope.)
-- =====================================================================
-- CREATE OR REPLACE FUNCTION public.forbid_super_admin_membership()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- AS $$
-- BEGIN
--   IF EXISTS (
--     SELECT 1 FROM public.profiles p
--     WHERE p.user_id = NEW.user_id AND p.is_super_admin = true
--   ) THEN
--     RAISE EXCEPTION 'Platform operators (super admins) may not hold tenant memberships (ISS-C1 / ADR-002).';
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS trg_forbid_super_admin_membership ON public.memberships;
-- CREATE TRIGGER trg_forbid_super_admin_membership
--   BEFORE INSERT OR UPDATE ON public.memberships
--   FOR EACH ROW EXECUTE FUNCTION public.forbid_super_admin_membership();

-- =====================================================================
-- ROLLBACK (restore the exact removed row(s) from the backup file):
-- =====================================================================
-- INSERT INTO public.memberships (id, tenant_id, user_id, role, status, invited_by, created_at)
-- VALUES (
--   '450f8193-fb0f-4e36-95f9-c06c0e25fb73',
--   '83b936ee-dcc2-4bbc-81af-98094024f535',
--   '8e2f4513-2c5d-4b4f-a3e7-603a8fbe1854',
--   'client_owner', 'active', NULL, '2026-07-18T17:01:08.090529+00:00'
-- );
-- -- and, if Section B was applied:
-- -- DROP TRIGGER IF EXISTS trg_forbid_super_admin_membership ON public.memberships;
-- -- DROP FUNCTION IF EXISTS public.forbid_super_admin_membership();
