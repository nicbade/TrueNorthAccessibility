-- Audit Hub: projects, pages, issues and screenshots with owner + per-project viewer access.
-- Owners (rows in public.app_owners) have full access. Viewers are invited per project by
-- email and get read-only access once they sign in with that (confirmed) email address.

create extension if not exists citext with schema extensions;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table public.app_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  client text not null default '',
  url text not null default '',
  platform text not null default 'Desktop' check (platform in ('Desktop', 'iOS', 'Mobile')),
  standard text not null default 'WCAG 2.2 AA',
  auditor text not null default '',
  start_date text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_viewers (
  project_id uuid not null references public.projects (id) on delete cascade,
  email extensions.citext not null check (position('@' in email) > 1),
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (project_id, email)
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  url text not null default '',
  notes text not null default '',
  -- { path, name, type, size, width, height, updatedAt } of the full-page screenshot in storage
  screenshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pages_project_id_idx on public.pages (project_id);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  page_id uuid not null references public.pages (id) on delete cascade,
  number integer not null check (number > 0),
  description text not null check (length(trim(description)) > 0),
  expected_behavior text not null default '',
  fix text not null default '',
  priority text not null default '' check (priority in ('', 'Blocker', 'Critical', 'Major', 'Minor')),
  examples jsonb not null default '[]'::jsonb,
  wcag text[] not null default '{}',
  category text not null default '',
  comments text not null default '',
  status text not null default 'Open'
    check (status in ('Open', 'In progress', 'Needs retest', 'Fixed', 'Won''t fix')),
  location text not null default '',
  common_issue_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);
create index issues_page_id_idx on public.issues (page_id);

create table public.issue_images (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null default 0,
  storage_path text not null unique,
  name text not null default '',
  type text not null default '',
  size bigint not null default 0,
  width integer not null default 0,
  height integer not null default 0,
  alt text not null default '',
  created_at timestamptz not null default now()
);
create index issue_images_issue_id_idx on public.issue_images (issue_id);

-- Child rows must stay in the same project as their parent.
alter table public.pages add constraint pages_id_project_unique unique (id, project_id);
alter table public.issues add constraint issues_page_same_project
  foreign key (page_id, project_id) references public.pages (id, project_id) on delete cascade;
alter table public.issues add constraint issues_id_project_unique unique (id, project_id);
alter table public.issue_images add constraint issue_images_issue_same_project
  foreign key (issue_id, project_id) references public.issues (id, project_id) on delete cascade;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger pages_touch before update on public.pages
  for each row execute function public.touch_updated_at();
create trigger issues_touch before update on public.issues
  for each row execute function public.touch_updated_at();

-- ─── Access helpers ─────────────────────────────────────────────────────────

create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_owners where user_id = auth.uid());
$$;

-- Email of the signed-in user, only once the address is confirmed.
create function public.confirmed_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null;
$$;

create function public.can_view_project(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner() or exists (
    select 1 from public.project_viewers v
    where v.project_id = target and lower(v.email::text) = public.confirmed_email()
  );
$$;

-- Storage object names start with the project id: <project_id>/pages/... or <project_id>/issues/...
create function public.can_view_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner() or exists (
    select 1 from public.project_viewers v
    where v.project_id::text = split_part(object_name, '/', 1)
      and lower(v.email::text) = public.confirmed_email()
  );
$$;

-- Run as postgres (SQL editor or CLI) to grant full access: select public.make_owner('you@example.com');
create function public.make_owner(owner_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(owner_email);
  if uid is null then
    raise exception 'No auth user with email %. Sign in once (or add the user in Authentication > Users) first.', owner_email;
  end if;
  insert into public.app_owners (user_id) values (uid) on conflict do nothing;
  return uid;
end;
$$;

revoke all on function public.make_owner(text) from public, anon, authenticated;
revoke all on function public.confirmed_email() from public, anon;
revoke all on function public.is_owner() from public, anon;
revoke all on function public.can_view_project(uuid) from public, anon;
revoke all on function public.can_view_object(text) from public, anon;
grant execute on function public.is_owner(), public.confirmed_email(), public.can_view_project(uuid),
  public.can_view_object(text) to authenticated;

-- ─── Row level security ─────────────────────────────────────────────────────

alter table public.app_owners enable row level security;
alter table public.projects enable row level security;
alter table public.project_viewers enable row level security;
alter table public.pages enable row level security;
alter table public.issues enable row level security;
alter table public.issue_images enable row level security;

revoke all on public.app_owners, public.projects, public.project_viewers, public.pages, public.issues,
  public.issue_images from anon;

create policy "Users can see their own owner row" on public.app_owners
  for select to authenticated using (user_id = auth.uid());

create policy "Owners and project viewers can read projects" on public.projects
  for select to authenticated using (public.can_view_project(id));
create policy "Owners can create projects" on public.projects
  for insert to authenticated with check (public.is_owner());
create policy "Owners can update projects" on public.projects
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "Owners can delete projects" on public.projects
  for delete to authenticated using (public.is_owner());

create policy "Owners see all viewers; viewers see their own invitations" on public.project_viewers
  for select to authenticated using (public.is_owner() or lower(email::text) = public.confirmed_email());
create policy "Owners can invite viewers" on public.project_viewers
  for insert to authenticated with check (public.is_owner());
create policy "Owners can remove viewers" on public.project_viewers
  for delete to authenticated using (public.is_owner());

create policy "Owners and project viewers can read pages" on public.pages
  for select to authenticated using (public.can_view_project(project_id));
create policy "Owners can create pages" on public.pages
  for insert to authenticated with check (public.is_owner());
create policy "Owners can update pages" on public.pages
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "Owners can delete pages" on public.pages
  for delete to authenticated using (public.is_owner());

create policy "Owners and project viewers can read issues" on public.issues
  for select to authenticated using (public.can_view_project(project_id));
create policy "Owners can create issues" on public.issues
  for insert to authenticated with check (public.is_owner());
create policy "Owners can update issues" on public.issues
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "Owners can delete issues" on public.issues
  for delete to authenticated using (public.is_owner());

create policy "Owners and project viewers can read issue images" on public.issue_images
  for select to authenticated using (public.can_view_project(project_id));
create policy "Owners can create issue images" on public.issue_images
  for insert to authenticated with check (public.is_owner());
create policy "Owners can update issue images" on public.issue_images
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "Owners can delete issue images" on public.issue_images
  for delete to authenticated using (public.is_owner());

-- ─── Storage ────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audit-screenshots', 'audit-screenshots', false, 52428800,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update set public = false;

create policy "Owners and project viewers can read audit screenshots" on storage.objects
  for select to authenticated
  using (bucket_id = 'audit-screenshots' and public.can_view_object(name));
create policy "Owners can upload audit screenshots" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audit-screenshots' and public.is_owner());
create policy "Owners can update audit screenshots" on storage.objects
  for update to authenticated
  using (bucket_id = 'audit-screenshots' and public.is_owner())
  with check (bucket_id = 'audit-screenshots' and public.is_owner());
create policy "Owners can delete audit screenshots" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audit-screenshots' and public.is_owner());
