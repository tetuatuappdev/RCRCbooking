create extension if not exists "pgcrypto";

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists boats (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text,
  weight text,
  build_year text,
  usage_type text,
  in_service text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists race_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_date date not null,
  end_date date not null,
  driver text,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint race_events_date_range_check check (end_date >= start_date)
);

create table if not exists race_event_boats (
  id uuid primary key default gen_random_uuid(),
  race_event_id uuid not null references race_events(id) on delete cascade,
  boat_id uuid not null references boats(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (race_event_id, boat_id)
);

create table if not exists race_event_change_requests (
  id uuid primary key default gen_random_uuid(),
  race_event_id uuid not null references race_events(id) on delete cascade,
  requested_by_member_id uuid not null references members(id) on delete cascade,
  previous_boat_ids uuid[] not null default '{}',
  requested_boat_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_reason text,
  reviewed_by_member_id uuid references members(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists coordinator_groups (
  id uuid primary key default gen_random_uuid(),
  coordinator_member_id uuid not null references members(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists coordinator_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references coordinator_groups(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (group_id, email)
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references boats(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  usage_status text not null default 'scheduled' check (usage_status in ('scheduled', 'pending', 'confirmed', 'cancelled')),
  usage_confirmed_at timestamptz,
  usage_confirmed_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint end_after_start check (end_time > start_time)
);

create table if not exists booking_templates (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday >= 0 and weekday <= 6),
  boat_id uuid references boats(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  start_time time not null,
  end_time time not null,
  boat_label text,
  member_label text,
  created_at timestamptz not null default now(),
  constraint template_end_after_start check (end_time > start_time)
);

create table if not exists risk_assessments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
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

create table if not exists booking_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  risk_assessment_id uuid not null references risk_assessments(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists template_exceptions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references booking_templates(id) on delete cascade,
  exception_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (template_id, exception_date)
);

create table if not exists template_confirmations (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references booking_templates(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  occurrence_date date not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  booking_id uuid unique references bookings(id) on delete set null,
  notified_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, occurrence_date)
);

create table if not exists boat_permissions (
  boat_id uuid not null references boats(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  permission_until date,
  created_at timestamptz not null default now(),
  primary key (boat_id, member_id)
);

create table if not exists captain_booking_requests (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references boats(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  requested_start_time timestamptz not null,
  requested_end_time timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  decided_by_member_id uuid references members(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists admins (
  member_id uuid primary key references members(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists allowed_member (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  role text not null default 'coordinator' check (role in ('admin', 'captain', 'coordinator', 'guest')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table allowed_member add column if not exists role text;
update allowed_member
set role = case when is_admin then 'admin' else 'coordinator' end
where role is null;
alter table allowed_member alter column role set default 'coordinator';
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'allowed_member_role_check'
  ) then
    alter table allowed_member
      add constraint allowed_member_role_check
      check (role in ('admin', 'captain', 'coordinator', 'guest'));
  end if;
end
$$;
alter table allowed_member alter column role set not null;

create or replace function handle_allowed_member_insert()
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

drop trigger if exists allowed_member_sync on allowed_member;
create trigger allowed_member_sync
after insert on allowed_member
for each row execute function handle_allowed_member_insert();

create index if not exists bookings_boat_time_idx on bookings (boat_id, start_time, end_time);

alter table members enable row level security;
alter table boats enable row level security;
alter table bookings enable row level security;
alter table admins enable row level security;
alter table allowed_member enable row level security;
alter table booking_templates enable row level security;
alter table risk_assessments enable row level security;
alter table booking_risk_assessments enable row level security;
alter table template_exceptions enable row level security;
alter table template_confirmations enable row level security;
alter table boat_permissions enable row level security;
alter table captain_booking_requests enable row level security;
alter table race_events enable row level security;
alter table race_event_boats enable row level security;
alter table race_event_change_requests enable row level security;
alter table coordinator_groups enable row level security;
alter table coordinator_group_members enable row level security;

create policy "Members readable for login" on members
  for select to anon, authenticated
  using (true);

create policy "Members insert for authed" on members
  for insert to authenticated
  with check (
    lower(email) = lower(auth.email())
    and exists (
      select 1 from allowed_member
      where lower(email) = lower(auth.email())
    )
  );

create policy "Members delete for authed" on members
  for delete to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Boats readable for authed" on boats
  for select to authenticated
  using (true);

create policy "Boats insert for captains or admins" on boats
  for insert to authenticated
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Boats update for captains or admins" on boats
  for update to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  )
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Boats delete for captains or admins" on boats
  for delete to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Race events readable for authed" on race_events
  for select to authenticated
  using (true);

create policy "Race event boats readable for authed" on race_event_boats
  for select to authenticated
  using (true);

create policy "Race event requests readable" on race_event_change_requests
  for select to authenticated
  using (
    requested_by_member_id = (select id from members where email = auth.email())
    or exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Captain booking requests readable" on captain_booking_requests
  for select to authenticated
  using (
    member_id = (select id from members where email = auth.email())
    or exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Captain booking requests insert by requester" on captain_booking_requests
  for insert to authenticated
  with check (
    member_id = (select id from members where email = auth.email())
    and status = 'pending'
  );

create policy "Captain booking requests update by approvers" on captain_booking_requests
  for update to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  )
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Race events insert for admins" on race_events
  for insert to authenticated
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Race events update for admins" on race_events
  for update to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  )
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Race events delete for admins" on race_events
  for delete to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Race event boats insert for admins" on race_event_boats
  for insert to authenticated
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Race event boats update for admins" on race_event_boats
  for update to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  )
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Race event boats delete for admins" on race_event_boats
  for delete to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Race event requests insert by requester" on race_event_change_requests
  for insert to authenticated
  with check (
    requested_by_member_id = (select id from members where email = auth.email())
    and status = 'pending'
  );

create policy "Race event requests update by captains or admins" on race_event_change_requests
  for update to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  )
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Coordinator groups readable for owner" on coordinator_groups
  for select to authenticated
  using (coordinator_member_id = (select id from members where email = auth.email()));

create policy "Coordinator groups insert for owner" on coordinator_groups
  for insert to authenticated
  with check (coordinator_member_id = (select id from members where email = auth.email()));

create policy "Coordinator groups update for owner" on coordinator_groups
  for update to authenticated
  using (coordinator_member_id = (select id from members where email = auth.email()))
  with check (coordinator_member_id = (select id from members where email = auth.email()));

create policy "Coordinator groups delete for owner" on coordinator_groups
  for delete to authenticated
  using (coordinator_member_id = (select id from members where email = auth.email()));

create policy "Coordinator group members readable for owner" on coordinator_group_members
  for select to authenticated
  using (
    exists (
      select 1
      from coordinator_groups cg
      where cg.id = group_id
        and cg.coordinator_member_id = (select id from members where email = auth.email())
    )
  );

create policy "Coordinator group members insert for owner" on coordinator_group_members
  for insert to authenticated
  with check (
    exists (
      select 1
      from coordinator_groups cg
      where cg.id = group_id
        and cg.coordinator_member_id = (select id from members where email = auth.email())
    )
  );

create policy "Coordinator group members update for owner" on coordinator_group_members
  for update to authenticated
  using (
    exists (
      select 1
      from coordinator_groups cg
      where cg.id = group_id
        and cg.coordinator_member_id = (select id from members where email = auth.email())
    )
  )
  with check (
    exists (
      select 1
      from coordinator_groups cg
      where cg.id = group_id
        and cg.coordinator_member_id = (select id from members where email = auth.email())
    )
  );

create policy "Coordinator group members delete for owner" on coordinator_group_members
  for delete to authenticated
  using (
    exists (
      select 1
      from coordinator_groups cg
      where cg.id = group_id
        and cg.coordinator_member_id = (select id from members where email = auth.email())
    )
  );

create policy "Bookings readable for authed" on bookings
  for select to authenticated
  using (true);

create policy "Templates readable for authed" on booking_templates
  for select to authenticated
  using (true);

create policy "Templates insert for captains or admins" on booking_templates
  for insert to authenticated
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Templates update for captains or admins" on booking_templates
  for update to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  )
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Risk assessments readable for authed" on risk_assessments
  for select to authenticated
  using (
    member_id = (select id from members where email = auth.email())
    or exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Risk assessments insert for authed" on risk_assessments
  for insert to authenticated
  with check (
    member_id = (select id from members where email = auth.email())
    or exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Risk assessments update for authed" on risk_assessments
  for update to authenticated
  using (
    member_id = (select id from members where email = auth.email())
    or exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  )
  with check (
    member_id = (select id from members where email = auth.email())
    or exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Booking risk assessments readable for authed" on booking_risk_assessments
  for select to authenticated
  using (
    exists (
      select 1
      from risk_assessments ra
      where ra.id = risk_assessment_id
      and (
        ra.member_id = (select id from members where email = auth.email())
        or exists (
          select 1 from admins
          where member_id = (select id from members where email = auth.email())
        )
      )
    )
  );

create policy "Booking risk assessments insert for authed" on booking_risk_assessments
  for insert to authenticated
  with check (
    exists (
      select 1
      from risk_assessments ra
      where ra.id = risk_assessment_id
      and (
        ra.member_id = (select id from members where email = auth.email())
        or exists (
          select 1 from admins
          where member_id = (select id from members where email = auth.email())
        )
      )
    )
    and (
      exists (
        select 1 from bookings b
        where b.id = booking_id
        and b.member_id = (select id from members where email = auth.email())
      )
      or exists (
        select 1 from admins
        where member_id = (select id from members where email = auth.email())
      )
    )
  );

create policy "Booking risk assessments update for authed" on booking_risk_assessments
  for update to authenticated
  using (
    exists (
      select 1
      from risk_assessments ra
      where ra.id = risk_assessment_id
      and (
        ra.member_id = (select id from members where email = auth.email())
        or exists (
          select 1 from admins
          where member_id = (select id from members where email = auth.email())
        )
      )
    )
  )
  with check (
    exists (
      select 1
      from risk_assessments ra
      where ra.id = risk_assessment_id
      and (
        ra.member_id = (select id from members where email = auth.email())
        or exists (
          select 1 from admins
          where member_id = (select id from members where email = auth.email())
        )
      )
    )
  );

create policy "Templates delete for captains or admins" on booking_templates
  for delete to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Template exceptions readable for authed" on template_exceptions
  for select to authenticated
  using (true);

create policy "Template exceptions insert for captains or admins" on template_exceptions
  for insert to authenticated
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Template exceptions delete for captains or admins" on template_exceptions
  for delete to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Template confirmations readable for authed" on template_confirmations
  for select to authenticated
  using (
    member_id = (select id from members where email = auth.email())
    or exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Template confirmations insert for authed" on template_confirmations
  for insert to authenticated
  with check (
    member_id = (select id from members where email = auth.email())
    or exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Template confirmations update for authed" on template_confirmations
  for update to authenticated
  using (
    member_id = (select id from members where email = auth.email())
    or exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  )
  with check (
    member_id = (select id from members where email = auth.email())
    or exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Boat permissions readable for authed" on boat_permissions
  for select to authenticated
  using (true);

create policy "Boat permissions insert for captains or admins" on boat_permissions
  for insert to authenticated
  with check (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Boat permissions delete for captains or admins" on boat_permissions
  for delete to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
    or exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
    )
  );

create policy "Bookings insert for authed" on bookings
  for insert to authenticated
  with check (
    exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end)
        in ('admin', 'captain', 'coordinator')
    )
    and (
      member_id = (select id from members where email = auth.email())
      or exists (
        select 1 from admins
        where member_id = (select id from members where email = auth.email())
      )
      or exists (
        select 1
        from allowed_member am
        where lower(am.email) = lower(auth.email())
        and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
      )
    )
  );

create policy "Bookings update for authed" on bookings
  for update to authenticated
  using (
    exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) in ('admin', 'coordinator')
    )
    and (
      member_id = (select id from members where email = auth.email())
      or exists (
        select 1 from admins
        where member_id = (select id from members where email = auth.email())
      )
    )
  )
  with check (
    exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) in ('admin', 'coordinator')
    )
    and (
      member_id = (select id from members where email = auth.email())
      or exists (
        select 1 from admins
        where member_id = (select id from members where email = auth.email())
      )
    )
  );

create policy "Bookings delete for authed" on bookings
  for delete to authenticated
  using (
    exists (
      select 1
      from allowed_member am
      where lower(am.email) = lower(auth.email())
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) in ('admin', 'coordinator')
    )
    and (
      member_id = (select id from members where email = auth.email())
      or exists (
        select 1 from admins
        where member_id = (select id from members where email = auth.email())
      )
    )
  );

create policy "Admins self readable" on admins
  for select to authenticated
  using (
    member_id = (select id from members where email = auth.email())
  );

create policy "Admins insert for authed" on admins
  for insert to authenticated
  with check (
    exists (
      select 1
      from allowed_member am
      join members m on m.id = member_id
      where m.email = auth.email()
      and am.email = m.email
      and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'admin'
    )
  );

create policy "Admins delete for authed" on admins
  for delete to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create policy "Allowed members readable" on allowed_member
  for select to anon, authenticated
  using (true);

create policy "Allowed members insert for authed" on allowed_member
  for insert to authenticated
  with check (
    (
      exists (
        select 1 from admins
        where member_id = (select id from members where email = auth.email())
      )
      and coalesce(role, case when is_admin then 'admin' else 'coordinator' end) in ('admin', 'captain', 'coordinator', 'guest')
    )
    or (
      exists (
        select 1
        from allowed_member am
        where lower(am.email) = lower(auth.email())
        and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'captain'
      )
      and coalesce(role, case when is_admin then 'admin' else 'coordinator' end) in ('coordinator', 'guest')
      and coalesce(is_admin, false) = false
    )
    or (
      exists (
        select 1
        from allowed_member am
        where lower(am.email) = lower(auth.email())
        and coalesce(am.role, case when am.is_admin then 'admin' else 'coordinator' end) = 'coordinator'
      )
      and coalesce(role, case when is_admin then 'admin' else 'coordinator' end) = 'guest'
      and coalesce(is_admin, false) = false
    )
  );

create policy "Allowed members delete for authed" on allowed_member
  for delete to authenticated
  using (
    exists (
      select 1 from admins
      where member_id = (select id from members where email = auth.email())
    )
  );

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists booking_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  remind_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (booking_id, remind_at)
);

create table if not exists booking_usage_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  notified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (booking_id)
);

create index if not exists push_subscriptions_member_idx on push_subscriptions (member_id);
create index if not exists booking_reminders_booking_idx on booking_reminders (booking_id);
create index if not exists bookings_usage_status_idx on bookings (usage_status, end_time);
create index if not exists booking_usage_notifications_booking_idx on booking_usage_notifications (booking_id);

alter table push_subscriptions enable row level security;
alter table booking_reminders enable row level security;
alter table booking_usage_notifications enable row level security;

create policy "Push subscriptions readable for authed" on push_subscriptions
  for select to authenticated
  using (
    member_id = (select id from members where email = auth.email())
  );

create policy "Push subscriptions insert for authed" on push_subscriptions
  for insert to authenticated
  with check (
    member_id = (select id from members where email = auth.email())
  );

create policy "Push subscriptions delete for authed" on push_subscriptions
  for delete to authenticated
  using (
    member_id = (select id from members where email = auth.email())
  );
