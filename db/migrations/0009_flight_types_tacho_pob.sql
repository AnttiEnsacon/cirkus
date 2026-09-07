-- Flight types as the club actually keeps them (abbreviation, Finnish
-- name, bookkeeping account, VAT flag), Hobbs renamed to Tacho, and
-- persons on board on every flight.

alter table flight_types
	add column account text,
	add column taxable boolean not null default true;

-- The placeholder types from 0007 are kept but switched off, in case a
-- logged flight already references one.
update flight_types set is_active = false where code in ('local', 'training', 'cross_country');

insert into flight_types (code, label, account, taxable, sort_order) values
	('HAR', 'Harjoituslento',           '3210', true,  1),
	('MAT', 'Matkalento',               '3220', true,  2),
	('PAL', 'Palolento',                '3250', false, 3),
	('KOU', 'Tyyppi tai lisäkoulutus',  '3130', false, 4),
	('TAR', 'Tarkastuslento',           '3300', false, 7),
	('SAR', 'Etsintälento',             '3280', false, 8),
	('SII', 'Siirtolento',              '3220', true,  10),
	('KOE', 'Koelento (huolto)',        '3320', true,  11)
on conflict (code) do update
	set label = excluded.label, account = excluded.account, taxable = excluded.taxable,
	    sort_order = excluded.sort_order, is_active = true;

-- The meter on OH-KML is a tacho, not a Hobbs. The generated flight_hours
-- column follows the rename.
alter table flight_log_entries rename column hobbs_start to tacho_start;
alter table flight_log_entries rename column hobbs_end to tacho_end;
alter table flight_log_entries rename constraint flight_log_hobbs_valid to flight_log_tacho_valid;

alter table flight_log_entries
	add column persons_on_board integer not null default 1 check (persons_on_board >= 1);
