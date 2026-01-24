-- Dev-only policies to allow anon access without auth.
-- Remove or tighten these before production.

create policy "Members readable for anon" on members
  for select to anon
  using (true);

create policy "Boats readable for anon" on boats
  for select to anon
  using (true);

create policy "Bookings readable for anon" on bookings
  for select to anon
  using (true);

create policy "Bookings insert for anon" on bookings
  for insert to anon
  with check (member_id is not null);

create policy "Bookings update for anon" on bookings
  for update to anon
  using (true)
  with check (member_id is not null);

create policy "Bookings delete for anon" on bookings
  for delete to anon
  using (true);
