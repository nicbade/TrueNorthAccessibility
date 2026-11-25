-- Screenshots of a component, stored in the private audit-screenshots bucket at
-- <project_id>/components/<component_id>/<image_id>.<ext>, like issue_images. Viewers of the project can read
-- them (components are never hidden); only owners can write. Alt text is required.

create table public.component_images (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null default 0,
  storage_path text not null unique,
  name text not null default '',
  type text not null default '',
  size bigint not null default 0,
  width integer not null default 0,
  height integer not null default 0,
  alt text not null check (length(trim(alt)) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key (component_id, project_id) references public.components (id, project_id) on delete cascade
);
create index component_images_component_id_idx on public.component_images (component_id);

alter table public.component_images enable row level security;
revoke all on public.component_images from anon;

create policy "Owners and project viewers can read component images" on public.component_images
  for select to authenticated using (public.can_view_project(project_id));
create policy "Owners can create component images" on public.component_images
  for insert to authenticated with check (public.is_owner());
create policy "Owners can update component images" on public.component_images
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "Owners can delete component images" on public.component_images
  for delete to authenticated using (public.is_owner());

-- Storage: viewers of the project may also read <project_id>/components/<component_id>/... objects.
create or replace function public.can_view_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner() or (
    exists (
      select 1 from public.project_viewers v
      where v.project_id::text = split_part(object_name, '/', 1)
        and lower(v.email::text) = public.confirmed_email()
    )
    and case split_part(object_name, '/', 2)
      when 'pages' then exists (
        select 1 from public.pages p
        where p.id::text = split_part(object_name, '/', 3) and not p.hidden
      )
      when 'issues' then exists (
        select 1 from public.issues i join public.pages p on p.id = i.page_id
        where i.id::text = split_part(object_name, '/', 3) and not p.hidden
      )
      when 'components' then exists (
        select 1 from public.components c
        where c.id::text = split_part(object_name, '/', 3)
          and c.project_id::text = split_part(object_name, '/', 1)
      )
      else false
    end
  );
$$;
