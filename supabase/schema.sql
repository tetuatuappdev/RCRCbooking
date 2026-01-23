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

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references boats(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_at timestamptz not null default now(),
  constraint end_after_start check (end_time > start_time)
);

create index if not exists bookings_boat_time_idx on bookings (boat_id, start_time, end_time);

alter table members enable row level security;
alter table boats enable row level security;
alter table bookings enable row level security;

create policy "Members readable for login" on members
  for select to anon, authenticated
  using (true);

create policy "Boats readable for authed" on boats
  for select to authenticated
  using (true);

create policy "Bookings readable for authed" on bookings
  for select to authenticated
  using (true);

create policy "Bookings insert for authed" on bookings
  for insert to authenticated
  with check (true);
