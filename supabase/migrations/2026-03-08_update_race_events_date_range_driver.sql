begin;

alter table public.race_events
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists driver text;

update public.race_events
set
  start_date = coalesce(start_date, event_date),
  end_date = coalesce(end_date, event_date)
where start_date is null
   or end_date is null;

alter table public.race_events
  alter column start_date set not null,
  alter column end_date set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'race_events_date_range_check'
  ) then
    alter table public.race_events
      add constraint race_events_date_range_check
      check (end_date >= start_date);
  end if;
end
$$;

commit;
