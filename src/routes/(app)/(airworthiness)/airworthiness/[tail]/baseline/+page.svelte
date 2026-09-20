<script lang="ts">
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	// Bound inputs (HANDOFF §4). After a failed submit the posted values win
	// over the stored ones, so nothing typed is lost.
	// svelte-ignore state_referenced_locally
	const v = form?.values;
	// svelte-ignore state_referenced_locally
	let baselineAt = $state(v?.baseline_at ?? data.profile.baselineAt);
	// svelte-ignore state_referenced_locally
	let hours = $state(v?.baseline_hours ?? data.profile.hours);
	// svelte-ignore state_referenced_locally
	let landings = $state(v?.baseline_landings ?? data.profile.landings);
	// svelte-ignore state_referenced_locally
	let source = $state(v?.source ?? data.order?.source ?? '');
	// svelte-ignore state_referenced_locally
	let rows = $state(data.rows.map((r) => ({ ...r, ...(v?.rows[r.id] ?? {}) })));
	const filled = $derived(rows.filter((r) => r.active && !r.oneTime && r.done_on).length);
</script>

<svelte:head>
	<title>{data.tail} baseline — Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead tail={data.tail} subtitle="Baseline" active="baseline" />

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.saved === 'draft'}<p class="alert notice">Draft saved.</p>{/if}
	{#if form?.saved === 'released'}<p class="alert notice">Baseline released. The dashboard counts from it now.</p>{/if}

	{#if !data.released}
		<p class="alert notice">The baseline is the day-one record: for every task, when it was last done, read from the logbooks or the CAO's last status list. It is released once. After that, compliance comes only from released work orders.</p>
	{/if}

	<form method="POST" class="card stack">
		<div class="row between wrap">
			<div class="row">
				<h2>Baseline work order</h2>
				<span class="status {data.released ? 'released' : 'open'}">{data.released ? 'Released' : 'Open'}</span>
			</div>
			{#if data.released && data.order}
				<span class="faint">Released {data.order.releasedAt}{data.order.releasedBy ? ` by ${data.order.releasedBy}` : ''}</span>
			{/if}
		</div>

		<div class="fields figures">
			<label class="field"><span>Baseline date</span><input name="baseline_at" type="date" bind:value={baselineAt} disabled={data.released} required /></label>
			<label class="field"><span>Airframe hours at end of day</span><input name="baseline_hours" type="number" step="0.1" min="0" bind:value={hours} disabled={data.released} required /></label>
			<label class="field"><span>Landings</span><input name="baseline_landings" type="number" step="1" min="0" bind:value={landings} disabled={data.released} /></label>
			<label class="field source"><span>Source of the figures</span><input name="source" bind:value={source} disabled={data.released} placeholder="CAO final status list dated …; airframe, engine and propeller logbooks" /></label>
		</div>

		{#if rows.length === 0}
			<p class="hint">No tasks yet — <a href="/airworthiness/{data.tail}/programme">add them on the programme page</a> first.</p>
		{:else}
			<div class="table-wrap">
				<table class="table">
					<thead><tr><th>Code</th><th>Task</th><th>Last done on</th><th>At hours</th><th>At landings</th><th>Evidence</th></tr></thead>
					<tbody>
						{#each rows as r (r.id)}
							<tr class:inactive={!r.active}>
								<td class="mono">{r.code}</td>
								<td class="wrap">{r.title}<span class="sub">{r.interval}{r.oneTime ? ' · one-time' : ''}{r.active ? '' : ' · deactivated'}</span></td>
								<td><input name="done_on_{r.id}" type="date" bind:value={r.done_on} disabled={data.released} aria-label="{r.code} last done on" /></td>
								<td><input name="done_hours_{r.id}" type="number" step="0.1" min="0" bind:value={r.done_hours} disabled={data.released} placeholder={r.needsHours ? 'required' : '—'} aria-label="{r.code} at hours" class="short" /></td>
								<td><input name="done_landings_{r.id}" type="number" step="1" min="0" bind:value={r.done_landings} disabled={data.released} placeholder={r.needsLandings ? 'required' : '—'} aria-label="{r.code} at landings" class="short" /></td>
								<td><input name="evidence_{r.id}" bind:value={r.evidence} disabled={data.released} placeholder="logbook page, status list …" aria-label="{r.code} evidence" class="evidence" /></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if data.released && data.order}
			<p class="hint">Frozen.{#if data.order.hash} Release hash <span class="mono">{data.order.hash.slice(0, 16)}…</span> — the full hash is in the activity log.{/if} Hours and landings after the baseline come from the flight log and adjustments; compliance from released work orders.</p>
		{:else}
			<div class="row between wrap">
				<span class="hint">{filled} of {data.total} recurring tasks have a date. Calendar-only tasks need a date; hour-based ones need hours too. After release the rows are frozen and the dashboard starts counting from them.</span>
				<div class="row">
					<button type="submit" class="btn btn-secondary sm" formaction="?/saveDraft">Save draft</button>
					<button type="submit" class="btn btn-teal sm" formaction="?/release"><Icon name="check" size={14} /> Release baseline</button>
				</div>
			</div>
		{/if}
	</form>
</div>

<style>
	.figures {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.source {
		grid-column: span 1;
	}
	@media (min-width: 900px) {
		.figures {
			grid-template-columns: 1fr 1fr 1fr 2fr;
		}
	}
	.table td input {
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		padding: 7px 9px;
		font-size: 13px;
		font-family: var(--sans);
		width: 100%;
		min-width: 130px;
		background: var(--surface);
		color: var(--ink);
	}
	.table td input.short {
		min-width: 96px;
		width: 110px;
	}
	.table td input.evidence {
		min-width: 220px;
	}
	.table td input:disabled {
		background: var(--surface-2);
		color: var(--ink-soft);
		border-color: var(--line);
	}
	tr.inactive td {
		color: var(--ink-faint);
	}
</style>
