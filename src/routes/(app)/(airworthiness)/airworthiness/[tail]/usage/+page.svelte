<script lang="ts">
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	// After a failed submit the posted values come back.
	// svelte-ignore state_referenced_locally
	const v = form?.values;
	// svelte-ignore state_referenced_locally
	let onDate = $state(v?.on_date ?? '');
	// svelte-ignore state_referenced_locally
	let hoursDelta = $state(v?.hours_delta ?? '');
	// svelte-ignore state_referenced_locally
	let landingsDelta = $state(v?.landings_delta ?? '');
	// svelte-ignore state_referenced_locally
	let reason = $state(v?.reason ?? '');
	const sourceLabel = $derived({ tacho: 'Tacho end − start', block: 'block time', airborne: 'airborne time' }[data.source]);
</script>

<svelte:head>
	<title>{data.tail} usage — Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead tail={data.tail} subtitle="Usage" active="usage" />

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.saved}<p class="alert notice">Saved. The counters on every page follow.</p>{/if}

	<div class="cols c2">
		<div class="card stack">
			<h2>How today's counters add up</h2>
			<div class="table-wrap">
				<table class="table">
					<thead><tr><th></th><th class="num">Hours</th><th class="num">Landings</th></tr></thead>
					<tbody>
						<tr><td>Baseline · {data.baselineAt}</td><td class="num">{data.rows.baseline.hours}</td><td class="num">{data.rows.baseline.landings}</td></tr>
						<tr>
							<td>Flights since baseline · {data.rows.flights.count}<span class="sub">{sourceLabel} · day + night landings</span></td>
							<td class="num">{data.rows.flights.hours}</td>
							<td class="num">{data.rows.flights.landings}</td>
						</tr>
						<tr><td>Adjustments · {data.rows.adjustments.count}</td><td class="num">{data.rows.adjustments.hours}</td><td class="num">{data.rows.adjustments.landings}</td></tr>
					</tbody>
					<tfoot><tr><td>Today · {data.today}</td><td class="num">{data.rows.total.hours}</td><td class="num">{data.rows.total.landings}</td></tr></tfoot>
				</table>
			</div>
			{#if data.rows.flights.withoutReadings > 0}
				<p class="alert error">{data.rows.flights.withoutReadings} {data.rows.flights.withoutReadings === 1 ? 'flight' : 'flights'} since the baseline {data.rows.flights.withoutReadings === 1 ? 'has' : 'have'} no Tacho readings and counted 0 h — fix them in the flight log.</p>
			{/if}
			{#if data.tacho}
				<div class="alert {data.tacho.off ? 'error' : 'notice'} row">
					<Icon name={data.tacho.off ? 'alert' : 'check'} size={16} />
					<span>Last Tacho reading logged {data.tacho.last}{data.tacho.delta !== null ? ` — ${data.tacho.off ? 'differs from' : 'matches'} the computed total (Δ ${data.tacho.delta} h).` : '.'}</span>
				</div>
			{/if}
			<p class="hint">Utilisation for the projections: {data.utilisation.perDay} h/day — {data.utilisation.windowHours} h over {data.utilisation.windowFlights} flights in the trailing {data.utilisation.windowDays} days. A Tacho difference over 1.0 h usually means an unlogged flight or a mistyped reading; it never blocks anything, it is shown so it gets fixed in the flight log, not here.</p>
		</div>

		<div class="card stack">
			<h2>Adjustments</h2>
			{#if data.adjustments.length === 0}
				<p class="hint">None. Hours and landings the flight log does not have — a ferry flight by the shop, a meter change — go in here.</p>
			{:else}
				<div class="table-wrap">
					<table class="table">
						<thead><tr><th>Date</th><th class="num">Hours</th><th class="num">Ldg</th><th>Reason</th><th>By</th><th></th></tr></thead>
						<tbody>
							{#each data.adjustments as a (a.id)}
								<tr class:superseded={a.superseded}>
									<td>{a.date}{#if a.beforeBaseline}<span class="sub">inside baseline</span>{/if}</td>
									<td class="num">{a.hours}</td>
									<td class="num">{a.landings}</td>
									<td class="wrap">{a.reason}{#if a.supersedesId}<span class="sub">corrects an earlier row</span>{/if}{#if a.superseded}<span class="sub">superseded</span>{/if}</td>
									<td>{a.by}</td>
									<td class="actions">
										{#if !a.superseded && !a.reason.startsWith('Cancelled:')}
											<form method="POST" action="?/cancelAdjustment"><input type="hidden" name="id" value={a.id} /><button type="submit" class="btn btn-danger xs">Cancel</button></form>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<form method="POST" action="?/addAdjustment" class="add">
				<label class="field"><span>Date</span><input name="on_date" type="date" bind:value={onDate} required /></label>
				<label class="field"><span>Hours Δ</span><input name="hours_delta" type="number" step="0.1" bind:value={hoursDelta} placeholder="0.0" /></label>
				<label class="field"><span>Landings Δ</span><input name="landings_delta" type="number" step="1" bind:value={landingsDelta} placeholder="0" /></label>
				<label class="field reason"><span>Reason</span><input name="reason" bind:value={reason} placeholder="Why the flight log doesn't have it" required /></label>
				<button type="submit" class="btn sm">Add</button>
			</form>
			<p class="hint">Corrections are new rows that supersede old ones; nothing is edited in place. Cancelling adds a zero row that supersedes the original.</p>
		</div>
	</div>

	<div class="card stack">
		<div class="row between wrap">
			<h2>Flights since baseline</h2>
			<span class="faint">{data.rows.flights.count} {data.rows.flights.count === 1 ? 'flight' : 'flights'} · from the flight log, read-only here{data.rows.flights.count > data.flightsShown ? ` · latest ${data.flightsShown} shown` : ''}</span>
		</div>
		{#if data.flights.length === 0}
			<p class="hint">No flights after {data.baselineAt} yet.</p>
		{:else}
			<div class="table-wrap">
				<table class="table">
					<thead><tr><th>Date (UTC)</th><th>Pilot</th><th>Route</th><th>Tacho</th><th class="num">Hours</th><th class="num">Ldg</th><th>Type</th></tr></thead>
					<tbody>
						{#each data.flights as f (f.id)}
							<tr>
								<td>{f.date}</td>
								<td>{f.pilot}</td>
								<td class="mono">{f.route}</td>
								<td class="mono">{f.tacho}</td>
								<td class="num">{f.hours}</td>
								<td class="num">{f.landings}</td>
								<td>{f.type}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="hint">Correct a flight under <a href="/manage/flights">Flights</a> (unbilled ones only); the counters here follow.</p>
		{/if}
	</div>
</div>

<style>
	th.num {
		text-align: right;
	}
	tr.superseded td {
		color: var(--ink-faint);
		text-decoration: line-through;
	}
	tr.superseded td .sub {
		text-decoration: none;
	}
	.add {
		display: grid;
		grid-template-columns: 1.2fr 1fr 1fr 2fr auto;
		gap: 10px;
		align-items: end;
	}
	@media (max-width: 899px) {
		.add {
			grid-template-columns: 1fr 1fr;
		}
		.add .reason {
			grid-column: span 2;
		}
	}
	.alert.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
</style>
