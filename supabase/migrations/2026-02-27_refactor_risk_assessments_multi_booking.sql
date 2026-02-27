begin;

create table if not exists public.booking_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.booking_risk_assessments enable row level security;

drop policy if exists "Booking risk assessments readable for authed" on public.booking_risk_assessments;
create policy "Booking risk assessments readable for authed" on public.booking_risk_assessments
  for select to authenticated
  using (
    exists (
      select 1
      from public.risk_assessments ra
      where ra.id = risk_assessment_id
        and (
          ra.member_id = (select id from public.members where email = auth.email())
          or exists (
            select 1 from public.admins
            where member_id = (select id from public.members where email = auth.email())
          )
        )
    )
  );

drop policy if exists "Booking risk assessments insert for authed" on public.booking_risk_assessments;
create policy "Booking risk assessments insert for authed" on public.booking_risk_assessments
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.risk_assessments ra
      where ra.id = risk_assessment_id
        and (
          ra.member_id = (select id from public.members where email = auth.email())
          or exists (
            select 1 from public.admins
            where member_id = (select id from public.members where email = auth.email())
          )
        )
    )
    and (
      exists (
        select 1
        from public.bookings b
        where b.id = booking_id
          and b.member_id = (select id from public.members where email = auth.email())
      )
      or exists (
        select 1 from public.admins
        where member_id = (select id from public.members where email = auth.email())
      )
    )
  );

drop policy if exists "Booking risk assessments update for authed" on public.booking_risk_assessments;
create policy "Booking risk assessments update for authed" on public.booking_risk_assessments
  for update to authenticated
  using (
    exists (
      select 1
      from public.risk_assessments ra
      where ra.id = risk_assessment_id
        and (
          ra.member_id = (select id from public.members where email = auth.email())
          or exists (
            select 1 from public.admins
            where member_id = (select id from public.members where email = auth.email())
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.risk_assessments ra
      where ra.id = risk_assessment_id
        and (
          ra.member_id = (select id from public.members where email = auth.email())
          or exists (
            select 1 from public.admins
            where member_id = (select id from public.members where email = auth.email())
          )
        )
    )
  );

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'risk_assessments'
      and column_name = 'booking_id'
  ) then
    execute '
      insert into public.booking_risk_assessments (booking_id, risk_assessment_id)
      select booking_id, id
      from public.risk_assessments
      where booking_id is not null
      on conflict (booking_id) do update
      set risk_assessment_id = excluded.risk_assessment_id
    ';

    execute 'alter table public.risk_assessments drop column booking_id';
  end if;
end
$$;

commit;
