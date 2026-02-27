-- Migration: track actual boat usage after a booking ends.
--
-- Booking lifecycle:
-- - scheduled: booking exists, not yet awaiting confirmation
-- - pending: booking ended, member must confirm if the outing actually happened
-- - confirmed: outing happened
-- - cancelled: outing did not happen

begin;

alter table public.bookings
  add column if not exists usage_status text;

alter table public.bookings
  add column if not exists usage_confirmed_at timestamptz;

alter table public.bookings
  add column if not exists usage_confirmed_by uuid references public.members(id) on delete set null;

update public.bookings
set usage_status = 'scheduled'
where usage_status is null;

alter table public.bookings
  alter column usage_status set default 'scheduled';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_usage_status_check'
  ) then
    alter table public.bookings
      add constraint bookings_usage_status_check
      check (usage_status in ('scheduled', 'pending', 'confirmed', 'cancelled'));
  end if;
end
$$;

alter table public.bookings
  alter column usage_status set not null;

create index if not exists bookings_usage_status_idx
  on public.bookings (usage_status, end_time);

create table if not exists public.booking_usage_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  notified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (booking_id)
);

create index if not exists booking_usage_notifications_booking_idx
  on public.booking_usage_notifications (booking_id);

alter table public.booking_usage_notifications enable row level security;

commit;
