-- Moving an issue to another page: the owner updates issues.page_id (already owner-only under RLS) and the
-- issue's comments follow it. Without ON UPDATE CASCADE the comments' (issue_id, page_id) key blocks the move.
-- issues_page_same_project still keeps the new page inside the same project.

alter table public.comments drop constraint comments_issue_id_page_id_fkey;
alter table public.comments add constraint comments_issue_id_page_id_fkey
  foreign key (issue_id, page_id) references public.issues (id, page_id) on delete cascade on update cascade;
