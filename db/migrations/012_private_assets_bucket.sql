-- 012_private_assets_bucket.sql
-- Migration epic M2 (security & storage hardening).
-- Closes ISS-C2: the `assets` storage bucket was public-read, allowing
-- cross-tenant enumeration/reading of any object by URL. It is now PRIVATE;
-- the app serves objects only via short-lived signed URLs, generated
-- server-side with the service role after the request is gated to the
-- owning tenant (Bible Part 9 §7 / ADR-073).
--
-- EXECUTION NOTE:
--   Applied programmatically via the Storage Management API
--   (`supabase.storage.updateBucket("assets", { public: false })`) and
--   VERIFIED: the public URL now returns HTTP 400 (enumeration closed) while
--   a signed URL returns 200. The SQL below is the equivalent, for the
--   record / to reproduce in the Supabase SQL editor.
--
-- No data migration is required: application code (`web/src/lib/assets.ts`,
-- `resolveAssetUrl`) resolves ANY stored form (legacy public URL, signed
-- URL, or bare path) to a fresh signed URL, and new uploads store a stable
-- tenant-prefixed bucket path.

-- Make the bucket private (equivalent to updateBucket public:false):
update storage.buckets set public = false where id = 'assets';

-- ROLLBACK (re-enable public read — NOT recommended; reopens ISS-C2):
-- update storage.buckets set public = true where id = 'assets';

-- OPTIONAL DEFENSE-IN-DEPTH (DDL — run in the Supabase SQL editor if desired):
-- Tenant-scoped RLS on storage.objects so even a direct authed client can
-- only touch its own tenant's prefix. Not required for ISS-C2 (the private
-- bucket + service-role-mediated signed URLs already close enumeration, and
-- all app reads go through resolveAssetUrl), but aligns with ADR-073's
-- "tenant-scoped keys". New uploads use paths like `<tenant_id>/...`.
-- CREATE POLICY "assets_tenant_read" ON storage.objects FOR SELECT
--   USING ( bucket_id = 'assets'
--           AND (storage.foldername(name))[1] = ANY (
--             SELECT tenant_id::text FROM public.memberships
--             WHERE user_id = auth.uid() AND status = 'active') );
