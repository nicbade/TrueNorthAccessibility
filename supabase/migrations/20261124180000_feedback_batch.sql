-- Audit Hub feedback batch: "UX / Content" severity, pages hidden from viewers, and comments that
-- viewers (clients) can leave on issues and pages.

-- ─── "UX / Content" severity ───────────────────────────────────────────────

alter table public.issues drop constraint issues_priority_check;
alter table public.issues add constraint issues_priority_check
  check (priority in ('', 'Blocker', 'Critical', 'Major', 'Minor', 'UX / Content'));

-- ─── Hidden pages ───────────────────────────────────────────────────────────
-- A hidden page, its issues, issue images and screenshots are visible to owners only.

alter table public.pages add column hidden boolean not null default false;

create function public.can_view_page(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner() or exists (
    select 1 from public.pages p
    where p.id = target and not p.hidden and public.can_view_project(p.project_id)
  );
$$;

create function public.can_view_issue(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner() or exists (
    select 1 from public.issues i where i.id = target and public.can_view_page(i.page_id)
  );
$$;

-- Storage object names: <project_id>/pages/<page_id>/... or <project_id>/issues/<issue_id>/...
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
      else false
    end
  );
$$;

revoke all on function public.can_view_page(uuid) from public, anon;
revoke all on function public.can_view_issue(uuid) from public, anon;
grant execute on function public.can_view_page(uuid), public.can_view_issue(uuid) to authenticated;

drop policy "Owners and project viewers can read pages" on public.pages;
create policy "Owners and project viewers can read visible pages" on public.pages
  for select to authenticated using (public.is_owner() or (not hidden and public.can_view_project(project_id)));

drop policy "Owners and project viewers can read issues" on public.issues;
create policy "Owners and project viewers can read issues on visible pages" on public.issues
  for select to authenticated using (public.can_view_page(page_id));

drop policy "Owners and project viewers can read issue images" on public.issue_images;
create policy "Owners and project viewers can read images on visible pages" on public.issue_images
  for select to authenticated using (public.can_view_issue(issue_id));

-- ─── Comments ───────────────────────────────────────────────────────────────
-- issue_id null = a comment on the page itself.

alter table public.issues add constraint issues_id_page_unique unique (id, page_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  page_id uuid not null,
  issue_id uuid,
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  author_email text not null,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (page_id, project_id) references public.pages (id, project_id) on delete cascade,
  foreign key (issue_id, page_id) references public.issues (id, page_id) on delete cascade
);
create index comments_page_id_idx on public.comments (page_id);

alter table public.comments enable row level security;
revoke all on public.comments from anon;

create policy "Owners and viewers of the page can read comments" on public.comments
  for select to authenticated using (public.can_view_page(page_id));
create policy "Owners and viewers of the page can comment as themselves" on public.comments
  for insert to authenticated with check (
    public.can_view_page(page_id)
    and author_id = auth.uid()
    and lower(author_email) = public.confirmed_email()
  );
create policy "Owners can delete any comment; authors can delete their own" on public.comments
  for delete to authenticated using (public.is_owner() or author_id = auth.uid());
