-- Phase 09: a second aircraft, billed by airborne time.
--
-- Which figure a flight is billed on is a property of the aircraft:
-- 'tacho' (OH-KML: tacho end - tacho start) or 'airborne' (take-off to
-- landing, to the exact minute). Each flight copies the basis when it is
-- saved, the way an invoice line freezes the rate, so changing a plane's
-- setting never rewrites history. Whether the log form asks for meter
-- readings is a separate per-aircraft switch: always on for tacho
-- billing, optional (maintenance record only) otherwise.
--
-- The pilot's logbook shows block time (off-block to on-block) for every
-- aircraft; flight_hours stays the billed figure and stays generated, so
-- invoicing, the billing page and the home stats keep reading it.

create type billing_basis as enum ('tacho', 'airborne');

alter table aircraft
	add column billing_basis billing_basis not null default 'tacho',
	add column records_tacho boolean not null default true,
	add constraint aircraft_tacho_billing_records_tacho
		check (billing_basis <> 'tacho' or records_tacho);

alter table flight_log_entries
	add column billing_basis billing_basis not null default 'tacho',
	add column takeoff_at timestamptz,
	add column landing_at timestamptz,
	alter column tacho_start drop not null,
	alter column tacho_end drop not null,
	add column block_hours numeric(6, 2) generated always as
		(round((extract(epoch from (block_on_at - block_off_at)) / 3600.0)::numeric, 2)) stored;

alter table flight_log_entries drop constraint flight_log_tacho_valid;
alter table flight_log_entries
	add constraint flight_log_tacho_valid
		check (tacho_end is null or tacho_start is null or tacho_end > tacho_start),
	add constraint flight_log_tacho_pair
		check ((tacho_start is null) = (tacho_end is null)),
	add constraint flight_log_airborne_pair
		check ((takeoff_at is null) = (landing_at is null)),
	add constraint flight_log_airborne_valid
		check (takeoff_at is null or (takeoff_at >= block_off_at and landing_at > takeoff_at and landing_at <= block_on_at)),
	add constraint flight_log_basis_complete
		check ((billing_basis = 'tacho' and tacho_start is not null)
		    or (billing_basis = 'airborne' and takeoff_at is not null));

-- The billed hours, by basis. Dropped and re-added because a generated
-- column's expression cannot be altered in place.
alter table flight_log_entries drop column flight_hours;
alter table flight_log_entries
	add column flight_hours numeric(6, 2) generated always as (
		case billing_basis
			when 'tacho' then tacho_end - tacho_start
			else round((extract(epoch from (landing_at - takeoff_at)) / 3600.0)::numeric, 2)
		end) stored;
