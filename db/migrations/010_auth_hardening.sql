-- P6.2 Auth hardening: forced password change, lockout, password expiry (future-ready).
alter table profiles add column if not exists must_change_password boolean default false;
alter table profiles add column if not exists password_changed_at timestamptz;
alter table profiles add column if not exists failed_login_attempts int default 0;
alter table profiles add column if not exists locked_until timestamptz;

-- Newly provisioned clients must change their temp password on first login.
-- (Demo client flagged to exercise the flow.)
update profiles set must_change_password = true
where user_id in (select m.user_id from memberships m join tenants t on t.id = m.tenant_id
                  where t.slug = 'demo-client');
