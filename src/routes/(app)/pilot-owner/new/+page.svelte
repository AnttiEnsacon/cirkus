<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	const v = form?.values;
	// svelte-ignore state_referenced_locally
	let checked = $state(new Set(form?.taskIds ?? []));
	// svelte-ignore state_referenced_locally
	let releasedAt = $state(v?.released_at ?? data.today);
	// svelte-ignore state_referenced_locally
	let hours = $state(v?.released_hours ?? (data.chosen.tacho && data.now.lastTacho ? data.now.lastTacho : data.now.hours));
	// svelte-ignore state_referenced_locally
	let landings = $state(v?.released_landings ?? String(data.now.landings));
	// svelte-ignore state_referenced_locally
	let oil = $state(v?.oil_added ?? '');
	// svelte-ignore state_referenced_locally
	let notes = $state(v?.notes ?? '');
	// svelte-ignore state_referenced_locally
	let crsText = $state(v?.crs_text ?? data.crsText);

	function toggle(id: string, on: boolean) {
		const next = new Set(checked);
		if (on) next.add(id);
		else next.delete(id);
		checked = next;
	}
</script>

<svelte:head>
	<title>Pilot-owner release — Cirkus</title>
</svelte:head>

<div class="page narrow">
	<div class="page-head">
		<h1>Pilot-owner release</h1>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}

	{#if data.aircraft.length > 1}
		<nav class="chiprow" aria-label="Aircraft">
			{#each data.aircraft as a (a.tail)}
				<a href="/pilot-owner/new?aircraft={a.tail}" class="chip" class:on={a.on}>{a.tail}</a>
			{/each}
		</nav>
	{/if}

	<form method="POST" class="card stack">
		<input type="hidden" name="aircraft_id" value={data.chosen.id} />
		<div class="field"><span>Aircraft</span><div class="static"><span class="tailnum">{data.chosen.tail}</span> · {data.chosen.type} · {data.now.hours} h · {data.now.landings} ldg today</div></div>

		<p class="section-label">Appendix II tasks done</p>
		{#if data.tasks.length === 0}
			<p class="hint">No task on {data.chosen.tail} is marked pilot-owner in the programme. The technical manager ticks "pilot-owner may release" on the tasks that are Appendix II work.</p>
		{:else}
			<div class="stack tasks">
				{#each data.tasks as t (t.id)}
					<label class="field inline check">
						<input type="checkbox" name="task_ids" value={t.id} checked={checked.has(t.id)} onchange={(e) => toggle(t.id, e.currentTarget.checked)} />
						<span><span class="mono">{t.code}</span> · {t.title}<br /><span class="faint">{t.due || t.statusLabel}</span> <span class="status {t.status}">{t.statusLabel}</span></span>
					</label>
				{/each}
			</div>
			<p class="hint">Only tasks marked pilot-owner in the programme appear here. Anything else is Part-145 work.</p>
		{/if}

		<div class="fields two">
			<label class="field"><span>Date</span><input name="released_at" type="date" bind:value={releasedAt} max={data.today} required /></label>
			<label class="field"><span>{data.chosen.tacho ? 'Tacho reading' : 'Airframe hours'}</span><input name="released_hours" type="number" step="0.1" min="0" bind:value={hours} required /></label>
			<label class="field"><span>Landings</span><input name="released_landings" type="number" step="1" min="0" bind:value={landings} /></label>
			<label class="field"><span>Oil added (l)</span><input name="oil_added" type="number" step="0.1" min="0" bind:value={oil} /></label>
		</div>
		{#if data.chosen.tacho}<p class="hint">The reading on the Tacho now; Cirkus counts {data.now.hours} h from the log.</p>{/if}
		<label class="field"><span>Notes</span><input name="notes" bind:value={notes} placeholder="Oil grade, filter part number, anything found" /></label>
		<label class="field"><span>Release statement</span><textarea name="crs_text" rows="5" bind:value={crsText}></textarea></label>
		<p class="alert notice">Signed as {data.signer.name} · pilot-owner · licence {data.signer.licence} · co-owner of {data.chosen.tail}</p>
		<button type="submit" class="btn btn-teal wide" disabled={data.tasks.length === 0}><Icon name="check" size={16} /> Release to service</button>
		<p class="hint">Creates and releases the work order in one go; it cannot be changed afterwards.</p>
	</form>
</div>

<style>
	.narrow {
		max-width: 560px;
	}
	.wide {
		width: 100%;
		justify-content: center;
	}
	.static {
		font-size: 14px;
		color: var(--ink);
		padding: 4px 0;
	}
	.tasks {
		gap: 8px;
	}
	.check {
		align-items: flex-start;
	}
	.check input {
		width: 18px;
		height: 18px;
		margin-top: 2px;
	}
	.check > span {
		font-size: 13.5px;
		color: var(--ink);
		font-weight: 500;
	}
	.fields.two {
		grid-template-columns: 1fr 1fr;
	}
	.chiprow {
		margin-bottom: 12px;
	}
	.chip {
		text-decoration: none;
	}
</style>
