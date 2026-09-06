// All timestamps are stored in UTC (see the build plan). This module is
// the one place that converts between UTC and Helsinki wall-clock time,
// so reservations can be entered and read in local time without any
// timezone library — Node's built-in Intl already ships full tz data.
const TIME_ZONE = 'Europe/Helsinki';

function partsOf(date: Date) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).formatToParts(date);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	return {
		year: get('year'),
		month: get('month'),
		day: get('day'),
		hour: get('hour') === 24 ? 0 : get('hour'), // midnight can format as "24:00"
		minute: get('minute')
	};
}

/** Formats a UTC Date as "YYYY-MM-DDTHH:mm" Helsinki wall-clock time, for <input type="datetime-local">. */
export function toHelsinkiInputValue(date: Date): string {
	const p = partsOf(date);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Parses a "YYYY-MM-DDTHH:mm" string as Helsinki wall-clock time and returns the equivalent UTC Date. */
export function fromHelsinkiInputValue(value: string): Date {
	const [datePart, timePart] = value.split('T');
	const [year, month, day] = datePart.split('-').map(Number);
	const [hour, minute] = timePart.split(':').map(Number);
	const wanted = Date.UTC(year, month - 1, day, hour, minute);

	// Guess the UTC instant is the wall-clock numbers taken as UTC, then see
	// what that instant actually renders as in Helsinki time and correct by
	// the difference. Converges in at most two passes across a DST edge.
	let guess = wanted;
	for (let i = 0; i < 2; i++) {
		const rendered = partsOf(new Date(guess));
		const renderedUtc = Date.UTC(
			rendered.year,
			rendered.month - 1,
			rendered.day,
			rendered.hour,
			rendered.minute
		);
		guess += wanted - renderedUtc;
	}

	return new Date(guess);
}

/** Formats a UTC Date for display, e.g. "6 Sep 2026, 18:00 (Helsinki)". */
export function formatHelsinki(date: Date): string {
	const formatted = new Intl.DateTimeFormat('en-GB', {
		timeZone: TIME_ZONE,
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	}).format(date);
	return `${formatted} (Helsinki)`;
}
