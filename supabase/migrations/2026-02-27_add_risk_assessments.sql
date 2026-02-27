begin;

create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  coordinator_name text not null,
  session_date date not null,
  session_time text not null,
  crew_type text not null,
  boat_type text not null,
  launch_supervision text not null,
  visibility text not null,
  river_level text not null,
  water_conditions text not null,
  air_temperature text not null,
  wind_conditions text not null,
  risk_actions text not null,
  incoming_tide text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.risk_assessments enable row level security;

drop policy if exists "Risk assessments readable for authed" on public.risk_assessments;
create policy "Risk assessments readable for authed" on public.risk_assessments
  for select to authenticated
  using (
    member_id = (select id from public.members where email = auth.email())
    or exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

drop policy if exists "Risk assessments insert for authed" on public.risk_assessments;
create policy "Risk assessments insert for authed" on public.risk_assessments
  for insert to authenticated
  with check (
    member_id = (select id from public.members where email = auth.email())
    or exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

drop policy if exists "Risk assessments update for authed" on public.risk_assessments;
create policy "Risk assessments update for authed" on public.risk_assessments
  for update to authenticated
  using (
    member_id = (select id from public.members where email = auth.email())
    or exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  )
  with check (
    member_id = (select id from public.members where email = auth.email())
    or exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

commit;
