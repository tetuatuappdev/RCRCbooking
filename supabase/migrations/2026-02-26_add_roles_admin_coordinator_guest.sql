-- Migration: introduce explicit roles in allowed_member
-- Roles:
-- - admin
-- - coordinator
-- - guest (read-only)
--
-- This migration is intended for an existing database.

begin;

-- 1) Add explicit role column and backfill from legacy is_admin flag.
alter table public.allowed_member
  add column if not exists role text;

update public.allowed_member
set role = case when is_admin then 'admin' else 'coordinator' end
where role is null;

alter table public.allowed_member
  alter column role set default 'coordinator';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'allowed_member_role_check'
  ) then
    alter table public.allowed_member
      add constraint allowed_member_role_check
      check (role in ('admin', 'coordinator', 'guest'));
  end if;
end
$$;

alter table public.allowed_member
  alter column role set not null;

-- Keep legacy boolean in sync for compatibility with existing code/policies.
update public.allowed_member
set is_admin = (role = 'admin')
where is_admin is distinct from (role = 'admin');

-- 2) Update trigger so only role=admin creates an admins row.
create or replace function public.handle_allowed_member_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into members (name, email)
  values (new.name, lower(new.email))
  on conflict (email) do nothing;

  if coalesce(new.role, case when new.is_admin then 'admin' else 'coordinator' end) = 'admin' then
    insert into admins (member_id)
    select id from members where lower(email) = lower(new.email)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- 3) Guests are read-only for bookings.
drop policy if exists "Bookings insert for authed" on public.bookings;
create policy "Bookings insert for authed" on public.bookings
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.allowed_member am
      where lower(am.email) = lower(auth.email())
        and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end)
          in ('admin', 'coordinator')
    )
    and (
      member_id = (select id from public.members where email = auth.email())
      or exists (
        select 1 from public.admins
        where member_id = (select id from public.members where email = auth.email())
      )
    )
  );

drop policy if exists "Bookings update for authed" on public.bookings;
create policy "Bookings update for authed" on public.bookings
  for update to authenticated
  using (
    exists (
      select 1
      from public.allowed_member am
      where lower(am.email) = lower(auth.email())
        and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end)
          in ('admin', 'coordinator')
    )
    and (
      member_id = (select id from public.members where email = auth.email())
      or exists (
        select 1 from public.admins
        where member_id = (select id from public.members where email = auth.email())
      )
    )
  )
  with check (
    exists (
      select 1
      from public.allowed_member am
      where lower(am.email) = lower(auth.email())
        and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end)
          in ('admin', 'coordinator')
    )
    and (
      member_id = (select id from public.members where email = auth.email())
      or exists (
        select 1 from public.admins
        where member_id = (select id from public.members where email = auth.email())
      )
    )
  );

drop policy if exists "Bookings delete for authed" on public.bookings;
create policy "Bookings delete for authed" on public.bookings
  for delete to authenticated
  using (
    exists (
      select 1
      from public.allowed_member am
      where lower(am.email) = lower(auth.email())
        and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end)
          in ('admin', 'coordinator')
    )
    and (
      member_id = (select id from public.members where email = auth.email())
      or exists (
        select 1 from public.admins
        where member_id = (select id from public.members where email = auth.email())
      )
    )
  );

-- 4) Guests cannot skip template bookings (template exceptions).
drop policy if exists "Template exceptions insert for authed" on public.template_exceptions;
create policy "Template exceptions insert for authed" on public.template_exceptions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.booking_templates bt
      where bt.id = template_id
        and exists (
          select 1
          from public.allowed_member am
          where lower(am.email) = lower(auth.email())
            and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end)
              in ('admin', 'coordinator')
        )
        and (
          bt.member_id = (select id from public.members where email = auth.email())
          or exists (
            select 1 from public.admins
            where member_id = (select id from public.members where email = auth.email())
          )
        )
    )
  );

drop policy if exists "Template exceptions delete for authed" on public.template_exceptions;
create policy "Template exceptions delete for authed" on public.template_exceptions
  for delete to authenticated
  using (
    exists (
      select 1 from public.booking_templates bt
      where bt.id = template_id
        and exists (
          select 1
          from public.allowed_member am
          where lower(am.email) = lower(auth.email())
            and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end)
              in ('admin', 'coordinator')
        )
        and (
          bt.member_id = (select id from public.members where email = auth.email())
          or exists (
            select 1 from public.admins
            where member_id = (select id from public.members where email = auth.email())
          )
        )
    )
  );

-- 5) Coordinators can add guests only; admins can add admins/coordinators.
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
        in ('admin', 'coordinator', 'guest')
    )
    or (
      exists (
        select 1
        from public.allowed_member am
        where lower(am.email) = lower(auth.email())
          and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end)
            = 'coordinator'
      )
      and coalesce(role, case when is_admin then 'admin' else 'coordinator' end) = 'guest'
      and coalesce(is_admin, false) = false
    )
  );

commit;
