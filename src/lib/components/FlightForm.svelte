<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	interface Aircraft {
		id: string;
		tail_number: string;
		type: string;
		seats: number;
		billing_basis: 'tacho' | 'airborne';
		records_tacho: boolean;
		last_tacho: string | null;
	}
	interface Props {
		aircraft: Aircraft[];
		flightTypes: { id: string; code: string; label: string }[];
		people: { id: string; name: string }[];
		reservations: { id: string; label: string }[];
		/** Field values to start from (create: defaults; edit: the stored entry). Keys are the input names. */
		initial: Record<string, string>;
		/** Values re-posted after a failed submit take precedence over `initial`. */
		form: { error?: string; values?: Record<string, unknown> } | null | undefined;
		/** Shown read-only when an admin edits another pilot's flight. */
		pilotName?: string;
		/** Editing: the basis the entry was logged under, whatever the aircraft says now. */
		basisOverride?: 'tacho' | 'airborne';
		submitLabel: string;
	}
	let { aircraft, flightTypes, people, reservations, initial, form, pilotName, basisOverride, submitLabel }: Props = $props();

	const v = (key: string, fallback = '') => String(form?.values?.[key] ?? initial[key] ?? fallback);
	const firstAircraft = $derived(aircraft[0]);

	// The selected aircraft decides what the Times card asks for.
	// svelte-ignore state_referenced_locally
	let aircraftId = $state(v('aircraft_id', firstAircraft?.id ?? ''));
	const plane = $derived(aircraft.find((a) => a.id === aircraftId) ?? firstAircraft);
	const basis = $derived(basisOverride ?? plane?.billing_basis ?? 'tacho');
	const asksTacho = $derived(basis === 'tacho' || (plane?.records_tacho ?? true));

	// Off/on-block as date + time pairs (UTC). The on-block date follows the
	// off-block date as long as the two were the same — a normal same-day
	// flight means picking only two times.
	// svelte-ignore state_referenced_locally
	let offDate = $state(v('block_off_date'));
	// svelte-ignore state_referenced_locally
	let offTime = $state(v('block_off_time'));
	// svelte-ignore state_referenced_locally
	let onDate = $state(v('block_on_date'));
	// svelte-ignore state_referenced_locally
	let onTime = $state(v('block_on_time'));
	// Take-off and landing (airborne-billed aircraft): default to the block
	// times, and their dates follow the block dates.
	// svelte-ignore state_referenced_locally
	let toDate = $state(v('takeoff_date', v('block_off_date')));
	// svelte-ignore state_referenced_locally
	let toTime = $state(v('takeoff_time', v('block_off_time')));
	// svelte-ignore state_referenced_locally
	let ldgDate = $state(v('landing_date', v('block_on_date')));
	// svelte-ignore state_referenced_locally
	let ldgTime = $state(v('landing_time', v('block_on_time')));

	// Plain inputs are bound too: Svelte re-syncs an unbound value={…}
	// whenever a sibling update runs (the on-block date following the
	// off-block date, say), which would wipe what was typed.
	// svelte-ignore state_referenced_locally
	let tachoStart = $state(v('tacho_start', firstAircraft?.last_tacho ?? ''));
	// svelte-ignore state_referenced_locally
	let tachoEnd = $state(v('tacho_end'));
	// svelte-ignore state_referenced_locally
	let departure = $state(v('departure', 'EFHK'));
	// svelte-ignore state_referenced_locally
	let arrival = $state(v('arrival', 'EFHK'));
	// svelte-ignore state_referenced_locally
	let dayLandings = $state(v('day_landings', '1'));
	// svelte-ignore state_referenced_locally
	let nightLandings = $state(v('night_landings', '0'));
	// svelte-ignore state_referenced_locally
	let personsOnBoard = $state(v('persons_on_board', '1'));
	// svelte-ignore state_referenced_locally
	let refuelLiters = $state(v('refuel_liters'));
	// svelte-ignore state_referenced_locally
	let oilAddedLiters = $state(v('oil_added_liters'));
	// svelte-ignore state_referenced_locally
	let remarks = $state(v('remarks'));
	// svelte-ignore state_referenced_locally
	let lastOffDate = offDate;
	$effect(() => {
		const d = offDate;
		untrack(() => {
			if (onDate === lastOffDate) onDate = d;
			if (toDate === lastOffDate) toDate = d;
			lastOffDate = d;
		});
	});
	// Switching aircraft moves the Tacho-start prefill along, unless the
	// pilot has already typed something else.
	// svelte-ignore state_referenced_locally
	let lastPrefill = plane?.last_tacho ?? '';
	$effect(() => {
		const next = plane?.records_tacho ? (plane?.last_tacho ?? '') : '';
		untrack(() => {
			if (tachoStart === lastPrefill || tachoStart === '') tachoStart = next;
			lastPrefill = next;
		});
	});
	// svelte-ignore state_referenced_locally
	let lastOnDate = onDate;
	$effect(() => {
		const d = onDate;
		untrack(() => {
			if (ldgDate === lastOnDate) ldgDate = d;
			lastOnDate = d;
		});
	});

	// What will be billed and what the logbook records, as the pilot types.
	const mins = (d: string, t: string) => {
		const ms = Date.parse(`${d}T${t}:00Z`);
		return Number.isFinite(ms) ? ms / 60000 : NaN;
	};
	const hours = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) && b > a ? ((b - a) / 60).toFixed(2) : '—');
	const blockHours = $derived(hours(mins(offDate, offTime), mins(onDate, onTime)));
	const billedHours = $derived.by(() => {
		if (basis === 'airborne') return hours(mins(toDate, toTime), mins(ldgDate, ldgTime));
		const a = Number(tachoStart), b = Number(tachoEnd);
		return tachoStart !== '' && tachoEnd !== '' && Number.isFinite(a) && Number.isFinite(b) && b > a ? (b - a).toFixed(2) : '—';
	});
</script>

{#if form?.error}<p class="alert error">{form.error}</p>{/if}

<form method="POST" class="stack form">
	<div class="card stack">
		<p class="section-label">Aircraft</p>
		<div class="fields">
			{#if pilotName}
				<label class="field">
					<span>Pilot</span>
					<input value={pilotName} readonly />
				</label>
			{/if}
			<label class="field">
				<span>Aircraft</span>
				<select name="aircraft_id" bind:value={aircraftId} required>
					{#each aircraft as a (a.id)}
						<option value={a.id}>
							{a.tail_number} — {a.type}{a.last_tacho && a.records_tacho ? ` (last Tacho ${a.last_tacho})` : ''}
						</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Linked reservation (optional)</span>
				<select name="reservation_id">
					<option value="">— none —</option>
					{#each reservations as res (res.id)}
						<option value={res.id} selected={v('reservation_id') === res.id}>{res.label}</option>
					{/each}
				</select>
			</label>
		</div>
	</div>

	<div class="card stack">
		<p class="section-label">{basis === 'tacho' ? 'Times & Tacho' : 'Times'}</p>
		<div class="field">
			<span>Off-block (UTC)</span>
			<div class="dt">
				<input name="block_off_date" type="date" bind:value={offDate} required aria-label="Off-block date" />
				<input name="block_off_time" type="time" bind:value={offTime} required aria-label="Off-block time" />
			</div>
		</div>
		{#if basis === 'airborne'}
			<div class="field">
				<span>Take-off (UTC)</span>
				<div class="dt">
					<input name="takeoff_date" type="date" bind:value={toDate} required aria-label="Take-off date" />
					<input name="takeoff_time" type="time" bind:value={toTime} required aria-label="Take-off time" />
				</div>
			</div>
			<div class="field">
				<span>Landing (UTC)</span>
				<div class="dt">
					<input name="landing_date" type="date" bind:value={ldgDate} required aria-label="Landing date" />
					<input name="landing_time" type="time" bind:value={ldgTime} required aria-label="Landing time" />
				</div>
			</div>
		{/if}
		<div class="field">
			<span>On-block (UTC)</span>
			<div class="dt">
				<input name="block_on_date" type="date" bind:value={onDate} required aria-label="On-block date" />
				<input name="block_on_time" type="time" bind:value={onTime} required aria-label="On-block time" />
			</div>
		</div>
		{#if basis === 'tacho'}
			<div class="grid2">
				<label class="field">
					<span>Tacho start</span>
					<input name="tacho_start" class="mono" type="number" step="0.1" min="0" bind:value={tachoStart} required />
				</label>
				<label class="field">
					<span>Tacho end</span>
					<input name="tacho_end" class="mono" type="number" step="0.1" min="0" bind:value={tachoEnd} required />
				</label>
			</div>
		{/if}
		<div class="row between figures">
			<span>{basis === 'airborne' ? 'Airborne' : 'Tacho'} {billedHours} h · billed</span>
			<span>Block {blockHours} h · logbook</span>
		</div>
	</div>

	{#if basis === 'airborne' && asksTacho}
		<div class="card stack">
			<p class="section-label">Tacho (for maintenance, optional)</p>
			<div class="grid2">
				<label class="field">
					<span>Tacho start</span>
					<input name="tacho_start" class="mono" type="number" step="0.1" min="0" bind:value={tachoStart} />
				</label>
				<label class="field">
					<span>Tacho end</span>
					<input name="tacho_end" class="mono" type="number" step="0.1" min="0" bind:value={tachoEnd} />
				</label>
			</div>
		</div>
	{/if}

	<div class="card stack">
		<p class="section-label">Route</p>
		<div class="grid2">
			<label class="field">
				<span>Departure (ICAO)</span>
				<input name="departure" class="mono" maxlength="4" bind:value={departure} required />
			</label>
			<label class="field">
				<span>Arrival (ICAO)</span>
				<input name="arrival" class="mono" maxlength="4" bind:value={arrival} required />
			</label>
			<label class="field">
				<span>Day landings</span>
				<input name="day_landings" type="number" min="0" step="1" bind:value={dayLandings} />
			</label>
			<label class="field">
				<span>Night landings</span>
				<input name="night_landings" type="number" min="0" step="1" bind:value={nightLandings} />
			</label>
		</div>
		<p class="hint">XXXX = no aerodrome</p>
	</div>

	<div class="card stack">
		<p class="section-label">Crew &amp; flight type</p>
		<div class="fields">
			<label class="field">
				<span>Instructor / backup pilot (optional)</span>
				<select name="second_pilot_id">
					<option value="">— none —</option>
					{#each people as person (person.id)}
						<option value={person.id} selected={v('second_pilot_id') === person.id}>{person.name}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Their role</span>
				<select name="second_pilot_role">
					<option value="">—</option>
					<option value="instructor" selected={v('second_pilot_role') === 'instructor'}>Instructor</option>
					<option value="backup_pilot" selected={v('second_pilot_role') === 'backup_pilot'}>Backup pilot</option>
				</select>
			</label>
			<label class="field">
				<span>Flight type</span>
				<select name="flight_type_id" required>
					{#each flightTypes as ft (ft.id)}
						<option value={ft.id} selected={v('flight_type_id', flightTypes[0]?.id ?? '') === ft.id}>{ft.code} · {ft.label}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Persons on board</span>
				<input name="persons_on_board" type="number" min="1" max={firstAircraft?.seats ?? 9} step="1" bind:value={personsOnBoard} required />
			</label>
		</div>
	</div>

	<div class="card stack">
		<p class="section-label">Consumables &amp; remarks</p>
		<div class="grid2">
			<label class="field">
				<span>Fuel added (L)</span>
				<input name="refuel_liters" class="mono" type="number" step="0.01" min="0" bind:value={refuelLiters} />
			</label>
			<label class="field">
				<span>Oil added (L)</span>
				<input name="oil_added_liters" class="mono" type="number" step="0.01" min="0" bind:value={oilAddedLiters} />
			</label>
		</div>
		<label class="field">
			<span>Remarks</span>
			<input name="remarks" type="text" bind:value={remarks} />
		</label>
	</div>

	<button type="submit" class="btn block"><Icon name="check" size={18} /> {submitLabel}</button>
</form>

<style>
	.form {
		max-width: 44rem;
	}
	.figures {
		border-top: 1px solid var(--line);
		padding-top: 10px;
		color: var(--ink-faint);
		font-size: 12.5px;
	}
</style>
