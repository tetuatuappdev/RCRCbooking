begin;

alter table public.boat_permissions
  add column if not exists permission_until date;

create table if not exists public.captain_booking_requests (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  requested_start_time timestamptz not null,
  requested_end_time timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  decided_by_member_id uuid references public.members(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists captain_booking_requests_status_idx
  on public.captain_booking_requests (status, created_at);

alter table public.captain_booking_requests enable row level security;

drop policy if exists "Captain booking requests readable" on public.captain_booking_requests;
create policy "Captain booking requests readable" on public.captain_booking_requests
  for select to authenticated
  using (
    member_id = (select id from public.members where email = auth.email())
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

drop policy if exists "Captain booking requests insert by requester" on public.captain_booking_requests;
create policy "Captain booking requests insert by requester" on public.captain_booking_requests
  for insert to authenticated
  with check (
    member_id = (select id from public.members where email = auth.email())
    and status = 'pending'
  );

drop policy if exists "Captain booking requests update by approvers" on public.captain_booking_requests;
create policy "Captain booking requests update by approvers" on public.captain_booking_requests
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

drop policy if exists "Bookings insert for authed" on public.bookings;
create policy "Bookings insert for authed" on public.bookings
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end)
        in ('admin', 'captain', 'coordinator')
    )
    and (
      member_id = (select id from public.members where email = auth.email())
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
    )
  );

commit;
