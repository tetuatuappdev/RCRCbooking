begin;

create table if not exists public.race_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.race_event_boats (
  id uuid primary key default gen_random_uuid(),
  race_event_id uuid not null references public.race_events(id) on delete cascade,
  boat_id uuid not null references public.boats(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (race_event_id, boat_id)
);

alter table public.race_events enable row level security;
alter table public.race_event_boats enable row level security;

drop policy if exists "Race events readable for authed" on public.race_events;
create policy "Race events readable for authed" on public.race_events
  for select to authenticated
  using (true);

drop policy if exists "Race event boats readable for authed" on public.race_event_boats;
create policy "Race event boats readable for authed" on public.race_event_boats
  for select to authenticated
  using (true);

drop policy if exists "Race events insert for admins" on public.race_events;
create policy "Race events insert for admins" on public.race_events
  for insert to authenticated
  with check (
    exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

drop policy if exists "Race events update for admins" on public.race_events;
create policy "Race events update for admins" on public.race_events
  for update to authenticated
  using (
    exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  )
  with check (
    exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

drop policy if exists "Race events delete for admins" on public.race_events;
create policy "Race events delete for admins" on public.race_events
  for delete to authenticated
  using (
    exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

drop policy if exists "Race event boats insert for admins" on public.race_event_boats;
create policy "Race event boats insert for admins" on public.race_event_boats
  for insert to authenticated
  with check (
    exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

drop policy if exists "Race event boats update for admins" on public.race_event_boats;
create policy "Race event boats update for admins" on public.race_event_boats
  for update to authenticated
  using (
    exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  )
  with check (
    exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

drop policy if exists "Race event boats delete for admins" on public.race_event_boats;
create policy "Race event boats delete for admins" on public.race_event_boats
  for delete to authenticated
  using (
    exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

commit;
