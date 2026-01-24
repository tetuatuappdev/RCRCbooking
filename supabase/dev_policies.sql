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

create policy "Templates readable for anon" on booking_templates
  for select to anon
  using (true);

create policy "Templates delete for anon" on booking_templates
  for delete to anon
  using (true);

create policy "Template exceptions readable for anon" on template_exceptions
  for select to anon
  using (true);

create policy "Template exceptions insert for anon" on template_exceptions
  for insert to anon
  with check (true);

create policy "Template exceptions delete for anon" on template_exceptions
  for delete to anon
  using (true);

create policy "Boat permissions readable for anon" on boat_permissions
  for select to anon
  using (true);

create policy "Boat permissions insert for anon" on boat_permissions
  for insert to anon
  with check (true);

create policy "Boat permissions delete for anon" on boat_permissions
  for delete to anon
  using (true);
