begin;

alter table public.allowed_member
  drop constraint if exists allowed_member_role_check;

alter table public.allowed_member
  add constraint allowed_member_role_check
  check (role in ('admin', 'captain', 'coordinator', 'guest'));

drop policy if exists "Race event requests readable" on public.race_event_change_requests;
create policy "Race event requests readable" on public.race_event_change_requests
  for select to authenticated
  using (
    requested_by_member_id = (select id from public.members where email = auth.email())
    or exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
    or exists (
      select 1
      from public.allowed_member am
      where lower(am.email) = lower(auth.email())
        and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

drop policy if exists "Race event requests update by admins" on public.race_event_change_requests;
drop policy if exists "Race event requests update by captains or admins" on public.race_event_change_requests;
create policy "Race event requests update by captains or admins" on public.race_event_change_requests
  for update to authenticated
  using (
    exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
    or exists (
      select 1
      from public.allowed_member am
      where lower(am.email) = lower(auth.email())
        and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  )
  with check (
    exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
    or exists (
      select 1
      from public.allowed_member am
      where lower(am.email) = lower(auth.email())
        and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

drop policy if exists "Allowed members insert for authed" on public.allowed_member;
create policy "Allowed members insert for authed" on public.allowed_member
  for insert to authenticated
  with check (
    (
      exists (
        select 1 from public.admins
        where member_id = (select id from public.members where email = auth.email())
      )
      and coalesce(role, case when is_admin then 'admin' else 'coordinator' end)
        in ('admin', 'captain', 'coordinator', 'guest')
    )
    or (
      exists (
        select 1
        from public.allowed_member am
        where lower(am.email) = lower(auth.email())
          and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
      )
      and coalesce(role, case when is_admin then 'admin' else 'coordinator' end) in ('coordinator', 'guest')
      and coalesce(is_admin, false) = false
    )
    or (
      exists (
        select 1
        from public.allowed_member am
        where lower(am.email) = lower(auth.email())
          and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'coordinator'
      )
      and coalesce(role, case when is_admin then 'admin' else 'coordinator' end) = 'guest'
      and coalesce(is_admin, false) = false
    )
  );

commit;
