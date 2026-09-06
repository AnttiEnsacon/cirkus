-- Seeds OH-KML, co-owned by all 8 pilots seeded in 0003.
-- NOTE: ownership is linked by matching the placeholder emails from 0003.
-- If those addresses were already corrected to real ones (via Manage ->
-- Accounts) before this migration runs, the corresponding owner link is
-- silently skipped rather than failing — check Manage -> Fleet afterward
-- and add any missing co-owners by hand if that happened.
insert into aircraft (tail_number, type, seats, member_rate_per_hour, guest_rate_per_hour)
values ('OH-KML', 'Cirrus SR20', 4, 240.00, 380.00)
on conflict (tail_number) do nothing;

insert into aircraft_owners (aircraft_id, user_id)
select a.id, u.id
from aircraft a
cross join users u
where a.tail_number = 'OH-KML'
  and u.email in (
	'kari.hakkinen@kmlaviation.fi',
	'antti.hanninen@kmlaviation.fi',
	'siegfried.schobesberger@kmlaviation.fi',
	'mauri.halinen@kmlaviation.fi',
	'heikki.jouppila@kmlaviation.fi',
	'juha.valkonen@kmlaviation.fi',
	'seppo.yla-herttuala@kmlaviation.fi',
	'jari.tapaninen@kmlaviation.fi'
  )
on conflict (aircraft_id, user_id) do nothing;
