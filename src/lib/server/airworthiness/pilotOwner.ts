import { db } from '../db';

/**
 * Who may release pilot-owner maintenance (Part-ML Appendix II): a
 * co-owner of the aircraft (Fleet → owners) with a licence number on the
 * account (Accounts). The aircraft must be tracked, since the release is
 * a work order on the programme.
 */
export interface EligibleAircraft {
	aircraft_id: string;
	tail_number: string;
	type: string;
	records_tacho: boolean;
}

export interface Eligibility {
	/** The tracked aircraft the pilot co-owns — empty without a licence number. */
	aircraft: EligibleAircraft[];
	licence: string | null;
	ownsAny: boolean;
}

export async function eligibility(userId: string): Promise<Eligibility> {
	const u = await db.selectFrom('users').select('licence_no').where('id', '=', userId).executeTakeFirstOrThrow();
	const licence = u.licence_no?.trim() || null;
	const owned = await db
		.selectFrom('aircraft_owners as ao')
		.innerJoin('aircraft as a', 'a.id', 'ao.aircraft_id')
		.innerJoin('mx_aircraft as m', 'm.aircraft_id', 'a.id')
		.select(['a.id as aircraft_id', 'a.tail_number', 'a.type', 'a.records_tacho'])
		.where('ao.user_id', '=', userId)
		.orderBy('a.tail_number')
		.execute();
	const ownsAny = (await db.selectFrom('aircraft_owners').select('aircraft_id').where('user_id', '=', userId).executeTakeFirst()) !== undefined;
	return { aircraft: licence ? owned : [], licence, ownsAny };
}
