<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	const v = (key: string, fallback = '') => String(form?.values?.[key] ?? fallback);
	const firstAircraft = $derived(data.aircraft[0]);

	// Off/on-block as date + time pairs (UTC). The on-block date follows the
	// off-block date as long as the two were the same — a normal same-day
	// flight means picking only two times.
	// svelte-ignore state_referenced_locally
	let offDate = $state(v('block_off_date', data.defaultBlockOff.slice(0, 10)));
	// svelte-ignore state_referenced_locally
	let offTime = $state(v('block_off_time', data.defaultBlockOff.slice(11, 16)));
	// svelte-ignore state_referenced_locally
	let onDate = $state(v('block_on_date', data.defaultBlockOn.slice(0, 10)));
	// svelte-ignore state_referenced_locally
	let onTime = $state(v('block_on_time', data.defaultBlockOn.slice(11, 16)));
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

<svelte:head>
	<title>Log a flight — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Log a flight</h1>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}

	<form method="POST" class="stack form">
		<div class="card stack">
			<p class="section-label">Aircraft</p>
			<div class="fields">
				<label class="field">
					<span>Aircraft</span>
					<select name="aircraft_id" required>
						{#each data.aircraft as plane (plane.id)}
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
						{#each data.reservations as res (res.id)}
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
					<input name="tacho_start" class="mono" type="number" step="0.1" min="0" value={v('tacho_start', firstAircraft?.last_tacho ?? '')} required />
				</label>
				<label class="field">
					<span>Tacho end</span>
					<input name="tacho_end" class="mono" type="number" step="0.1" min="0" value={v('tacho_end')} required />
				</label>
			</div>
		</div>

		<div class="card stack">
			<p class="section-label">Route</p>
			<div class="grid2">
				<label class="field">
					<span>Departure (ICAO)</span>
					<input name="departure" class="mono" maxlength="4" value={v('departure', 'EFHK')} required />
				</label>
				<label class="field">
					<span>Arrival (ICAO)</span>
					<input name="arrival" class="mono" maxlength="4" value={v('arrival', 'EFHK')} required />
				</label>
				<label class="field">
					<span>Day landings</span>
					<input name="day_landings" type="number" min="0" step="1" value={v('day_landings', '1')} />
				</label>
				<label class="field">
					<span>Night landings</span>
					<input name="night_landings" type="number" min="0" step="1" value={v('night_landings', '0')} />
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
						{#each data.people as person (person.id)}
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
						{#each data.flightTypes as ft (ft.id)}
							<option value={ft.id} selected={v('flight_type_id', data.flightTypes[0]?.id ?? '') === ft.id}>{ft.code} · {ft.label}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>Persons on board</span>
					<input name="persons_on_board" type="number" min="1" max={firstAircraft?.seats ?? 9} step="1" value={v('persons_on_board', '1')} required />
				</label>
			</div>
		</div>

		<div class="card stack">
			<p class="section-label">Consumables &amp; remarks</p>
			<div class="grid2">
				<label class="field">
					<span>Fuel added (L)</span>
					<input name="refuel_liters" class="mono" type="number" step="0.01" min="0" value={v('refuel_liters')} />
				</label>
				<label class="field">
					<span>Oil added (L)</span>
					<input name="oil_added_liters" class="mono" type="number" step="0.01" min="0" value={v('oil_added_liters')} />
				</label>
			</div>
			<label class="field">
				<span>Remarks</span>
				<input name="remarks" type="text" value={v('remarks')} />
			</label>
		</div>

		<button type="submit" class="btn block"><Icon name="check" size={18} /> Save flight log</button>
	</form>
</div>

<style>
	.form {
		max-width: 44rem;
	}
</style>
