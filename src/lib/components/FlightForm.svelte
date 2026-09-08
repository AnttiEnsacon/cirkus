<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	interface Aircraft {
		id: string;
		tail_number: string;
		type: string;
		seats: number;
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
		submitLabel: string;
	}
	let { aircraft, flightTypes, people, reservations, initial, form, pilotName, submitLabel }: Props = $props();

	const v = (key: string, fallback = '') => String(form?.values?.[key] ?? initial[key] ?? fallback);
	const firstAircraft = $derived(aircraft[0]);

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
			lastOffDate = d;
		});
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
				<select name="aircraft_id" required>
					{#each aircraft as plane (plane.id)}
						<option value={plane.id} selected={v('aircraft_id', firstAircraft?.id ?? '') === plane.id}>
							{plane.tail_number} — {plane.type}{plane.last_tacho ? ` (last Tacho ${plane.last_tacho})` : ''}
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
		<p class="section-label">Times &amp; Tacho</p>
		<div class="field">
			<span>Off-block (UTC)</span>
			<div class="dt">
				<input name="block_off_date" type="date" bind:value={offDate} required aria-label="Off-block date" />
				<input name="block_off_time" type="time" bind:value={offTime} required aria-label="Off-block time" />
			</div>
		</div>
		<div class="field">
			<span>On-block (UTC)</span>
			<div class="dt">
				<input name="block_on_date" type="date" bind:value={onDate} required aria-label="On-block date" />
				<input name="block_on_time" type="time" bind:value={onTime} required aria-label="On-block time" />
			</div>
		</div>
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
	</div>

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
</style>
