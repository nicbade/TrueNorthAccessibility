-- Components: reusable parts of a site (header, cart drawer, date picker…) that issues can be attached to.
-- Each component belongs to one project; viewers of the project can read them and only owners can write.
-- Issues on hidden pages stay hidden from viewers through the existing issues policies.

create table public.components (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);
create index components_project_id_idx on public.components (project_id);
create unique index components_project_name_unique on public.components (project_id, lower(trim(name)));

create trigger components_touch before update on public.components
  for each row execute function public.touch_updated_at();

-- The component must be in the issue's project. Deleting a component detaches its issues (only component_id
-- is set to null; project_id stays).
alter table public.issues add column component_id uuid;
alter table public.issues add constraint issues_component_same_project
  foreign key (component_id, project_id) references public.components (id, project_id)
  on delete set null (component_id);
create index issues_component_id_idx on public.issues (component_id);

alter table public.components enable row level security;
revoke all on public.components from anon;

create policy "Owners and project viewers can read components" on public.components
  for select to authenticated using (public.can_view_project(project_id));
create policy "Owners can create components" on public.components
  for insert to authenticated with check (public.is_owner());
create policy "Owners can update components" on public.components
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "Owners can delete components" on public.components
  for delete to authenticated using (public.is_owner());
