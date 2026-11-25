-- Marks an issue that affects the whole site rather than one page. Writes stay owner-only through the
-- existing issues RLS policies.
alter table public.issues add column site_wide boolean not null default false;
