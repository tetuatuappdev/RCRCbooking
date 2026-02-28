begin;

create table if not exists public.template_confirmations (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.booking_templates(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  occurrence_date date not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  booking_id uuid unique references public.bookings(id) on delete set null,
  notified_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, occurrence_date)
);

alter table public.template_confirmations enable row level security;

drop policy if exists "Template confirmations readable for authed" on public.template_confirmations;
create policy "Template confirmations readable for authed" on public.template_confirmations
  for select to authenticated
  using (
    member_id = (select id from public.members where email = auth.email())
    or exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

drop policy if exists "Template confirmations insert for authed" on public.template_confirmations;
create policy "Template confirmations insert for authed" on public.template_confirmations
  for insert to authenticated
  with check (
    member_id = (select id from public.members where email = auth.email())
    or exists (
      select 1 from public.admins
      where member_id = (select id from public.members where email = auth.email())
    )
  );

drop policy if exists "Template confirmations update for authed" on public.template_confirmations;
create policy "Template confirmations update for authed" on public.template_confirmations
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
