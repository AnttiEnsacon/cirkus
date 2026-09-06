<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	const v = (key: string, fallback = '') => String(form?.values?.[key] ?? fallback);
	const firstAircraft = $derived(data.aircraft[0]);
</script>

<svelte:head>
	<title>Log a flight — Cirkus</title>
</svelte:head>

<h1>Log a flight</h1>
<p class="hint">All times on this page are UTC.</p>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

<form method="POST" class="log-form">
	<fieldset>
		<legend>Aircraft</legend>
		<div class="row">
			<label>
				Aircraft
				<select name="aircraft_id" required>
					{#each data.aircraft as plane (plane.id)}
						<option value={plane.id} selected={v('aircraft_id', firstAircraft?.id ?? '') === plane.id}>
							{plane.tail_number} — {plane.type}{plane.last_hobbs ? ` (last Hobbs ${plane.last_hobbs})` : ''}
						</option>
					{/each}
				</select>
			</label>
			<label>
				Linked reservation (optional)
				<select name="reservation_id">
					<option value="">— none —</option>
					{#each data.reservations as res (res.id)}
						<option value={res.id} selected={v('reservation_id') === res.id}>{res.label}</option>
					{/each}
				</select>
			</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Times (UTC)</legend>
		<div class="row">
			<label>
				Off-block
				<input name="block_off_at" type="datetime-local" value={v('block_off_at', data.defaultBlockOff)} required />
			</label>
			<label>
				On-block
				<input name="block_on_at" type="datetime-local" value={v('block_on_at', data.defaultBlockOn)} required />
			</label>
			<label>
				Hobbs start
				<input name="hobbs_start" type="number" step="0.1" min="0" value={v('hobbs_start', firstAircraft?.last_hobbs ?? '')} required />
			</label>
			<label>
				Hobbs end
				<input name="hobbs_end" type="number" step="0.1" min="0" value={v('hobbs_end')} required />
			</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Route</legend>
		<div class="row">
			<label>
				Departure (ICAO)
				<input name="departure" class="mono" maxlength="4" value={v('departure', 'EFHK')} required />
			</label>
			<label>
				Arrival (ICAO)
				<input name="arrival" class="mono" maxlength="4" value={v('arrival', 'EFHK')} required />
			</label>
			<label>
				Day landings
				<input name="day_landings" type="number" min="0" step="1" value={v('day_landings', '1')} />
			</label>
			<label>
				Night landings
				<input name="night_landings" type="number" min="0" step="1" value={v('night_landings', '0')} />
			</label>
		</div>
		<p class="hint">Use XXXX when no aerodrome is involved (e.g. seaplane ops).</p>
	</fieldset>

	<fieldset>
		<legend>Crew & flight type</legend>
		<div class="row">
			<label>
				Second pilot (optional)
				<select name="second_pilot_id">
					<option value="">— none —</option>
					{#each data.people as person (person.id)}
						<option value={person.id} selected={v('second_pilot_id') === person.id}>{person.name}</option>
					{/each}
				</select>
			</label>
			<label>
				Their role
				<select name="second_pilot_role">
					<option value="">—</option>
					<option value="instructor" selected={v('second_pilot_role') === 'instructor'}>Instructor</option>
					<option value="backup_pilot" selected={v('second_pilot_role') === 'backup_pilot'}>Backup pilot</option>
				</select>
			</label>
			<label>
				Flight type
				<select name="flight_type_id" required>
					{#each data.flightTypes as ft (ft.id)}
						<option value={ft.id} selected={v('flight_type_id', data.flightTypes[0]?.id ?? '') === ft.id}>{ft.label}</option>
					{/each}
				</select>
			</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Consumables & remarks</legend>
		<div class="row">
			<label>
				Fuel added (L)
				<input name="refuel_liters" type="number" step="0.01" min="0" value={v('refuel_liters')} />
			</label>
			<label>
				Oil added (L)
				<input name="oil_added_liters" type="number" step="0.01" min="0" value={v('oil_added_liters')} />
			</label>
			<label class="wide">
				Remarks
				<input name="remarks" type="text" value={v('remarks')} />
			</label>
		</div>
	</fieldset>

	<button type="submit">Save flight log</button>
</form>

<style>
	.hint {
		color: #55585c;
		font-size: 0.85rem;
		margin: 0.25rem 0 0;
	}
	h1 + .hint {
		margin-top: -0.5rem;
		margin-bottom: 1rem;
	}
	.log-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 52rem;
	}
	fieldset {
		border: 1px solid #dddee0;
		border-radius: 8px;
		padding: 0.75rem 1rem 0.9rem;
	}
	legend {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #55585c;
		padding: 0 0.3rem;
	}
	.row {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		align-items: flex-end;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.85rem;
	}
	.wide {
		flex: 1;
		min-width: 14rem;
	}
	input,
	select {
		padding: 0.4rem;
		font-size: 0.95rem;
	}
	.mono {
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		width: 5.5rem;
	}
	button {
		align-self: flex-start;
		cursor: pointer;
		padding: 0.55rem 1.1rem;
		font-size: 1rem;
	}
	.error {
		color: #b3261e;
	}
</style>
