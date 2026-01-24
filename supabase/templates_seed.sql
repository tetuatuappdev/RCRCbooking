insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (6, (select id from boats where name ilike 'Roland Evans' limit 1), (select id from members where name ilike 'WM' limit 1), '07:30', '09:00', 'Roland Evans', 'WM');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (6, (select id from boats where name ilike 'Trevor Lloyd' limit 1), (select id from members where name ilike 'WM' limit 1), '07:30', '09:00', 'Trevor Lloyd', 'WM');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (6, (select id from boats where name ilike 'Sue Beaumont' limit 1), (select id from members where name ilike 'Elaine' limit 1), '07:30', '09:00', 'Sue Beaumont', 'Elaine');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (6, (select id from boats where name ilike 'Sue Beaumont' limit 1), (select id from members where name ilike 'Will' limit 1), '09:30', '11:00', 'Sue Beaumont', 'Will');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (0, (select id from boats where name ilike 'Sue Beaumont' limit 1), (select id from members where name ilike 'Tony' limit 1), '09:30', '11:00', 'Sue Beaumont', 'Tony');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (0, null, (select id from members where name ilike 'M dev squad' limit 1), '11:00', '12:30', 'All gen boats', 'M dev squad');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (1, (select id from boats where name ilike 'Trevor Loyd' limit 1), (select id from members where name ilike 'WM CH' limit 1), '09:30', '11:00', 'Trevor Loyd', 'WM CH');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (1, (select id from boats where name ilike 'Empacher' limit 1), (select id from members where name ilike 'MM CB' limit 1), '11:00', '12:30', 'Empacher', 'MM CB');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (2, (select id from boats where name ilike 'Empacher' limit 1), (select id from members where name ilike 'MM CB' limit 1), '11:00', '12:30', 'Empacher', 'MM CB');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (3, (select id from boats where name ilike 'Trevor Lloyd' limit 1), (select id from members where name ilike 'WM CH' limit 1), '08:30', '10:00', 'Trevor Lloyd', 'WM CH');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (3, (select id from boats where name ilike 'Chaplin' limit 1), (select id from members where name ilike 'Kerry' limit 1), '09:30', '11:00', 'Chaplin', 'Kerry');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (3, (select id from boats where name ilike 'Trevor Lloyd' limit 1), (select id from members where name ilike 'Elaine' limit 1), '10:00', '11:30', 'Trevor Lloyd', 'Elaine');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (3, (select id from boats where name ilike 'Empacher' limit 1), (select id from members where name ilike 'MM CB' limit 1), '11:00', '12:30', 'Empacher', 'MM CB');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (4, (select id from boats where name ilike 'Sue Beaumont' limit 1), (select id from members where name ilike 'MM JG' limit 1), '14:00', '15:30', 'Sue Beaumont', 'MM JG');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (4, (select id from boats where name ilike 'Biglands' limit 1), (select id from members where name ilike 'MM CB' limit 1), '16:30', '18:00', 'Biglands', 'MM CB');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (5, (select id from boats where name ilike 'Boothman' limit 1), (select id from members where name ilike 'WMAT' limit 1), '08:00', '09:30', 'Boothman', 'WMAT');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (5, (select id from boats where name ilike 'Trevor Lloyd' limit 1), (select id from members where name ilike 'WM CH' limit 1), '08:30', '10:00', 'Trevor Lloyd', 'WM CH');

insert into booking_templates (weekday, boat_id, member_id, start_time, end_time, boat_label, member_label)
values (5, null, (select id from members where name ilike 'M dev squad' limit 1), '09:30', '11:00', 'All gen boats', 'M dev squad');
