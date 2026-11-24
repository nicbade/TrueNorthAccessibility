-- Invite-only sign-in: the manage-viewer Edge Function (service role) looks up auth users by email
-- when the owner invites or revokes a viewer. Not callable from the browser.

create function public.auth_user_by_email(target_email text)
returns table (id uuid, confirmed boolean, is_owner boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email_confirmed_at is not null,
         exists (select 1 from public.app_owners o where o.user_id = u.id)
  from auth.users u
  where lower(u.email) = lower(target_email)
  limit 1;
$$;

revoke all on function public.auth_user_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_by_email(text) to service_role;
