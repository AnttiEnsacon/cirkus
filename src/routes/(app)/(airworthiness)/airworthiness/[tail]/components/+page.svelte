<script lang="ts">
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	const v = form?.values;
	// svelte-ignore state_referenced_locally
	let pn = $state(v?.part_number ?? '');
	// svelte-ignore state_referenced_locally
	let sn = $state(v?.serial_number ?? '');
	// svelte-ignore state_referenced_locally
	let ata = $state(v?.ata_chapter ?? '');
	// svelte-ignore state_referenced_locally
	let description = $state(v?.description ?? '');
	// svelte-ignore state_referenced_locally
	let mfg = $state(v?.manufacture_date ?? '');
	// svelte-ignore state_referenced_locally
	let trace = $state(v?.traceability_ref ?? '');
	// svelte-ignore state_referenced_locally
	let notes = $state(v?.notes ?? '');
	// svelte-ignore state_referenced_locally
	let fitted = $state(v?.fitted === 'on');
	// svelte-ignore state_referenced_locally
	let installedOn = $state(v?.installed_on ?? '');
	// svelte-ignore state_referenced_locally
	let atHours = $state(v?.installed_at_hours ?? '');
	// svelte-ignore state_referenced_locally
	let atLandings = $state(v?.installed_at_landings ?? '');
	// svelte-ignore state_referenced_locally
	let position = $state(v?.position ?? '');
	// svelte-ignore state_referenced_locally
	let tsn = $state(v?.tsn ?? '');
	// svelte-ignore state_referenced_locally
	let tso = $state(v?.tso ?? '');
	// svelte-ignore state_referenced_locally
	let csn = $state(v?.csn ?? '');
</script>

<svelte:head>
	<title>{data.tail} components — Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead tail={data.tail} subtitle="Components" active="components" />

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.saved}<p class="alert notice">Component added.</p>{/if}

	<div class="card stack">
		<div class="row between wrap">
			<h2>Installed</h2>
			<span class="faint">hours follow the aircraft while installed · {data.now.hours} h · {data.now.landings} ldg today</span>
		</div>
		{#if data.installed.length === 0}
			<p class="hint">Nothing recorded as installed on {data.tail}. Add the engine, propeller, parachute and other serialised parts below, ticking <em>already fitted</em> with the readings from the logbooks; later swaps come from work orders.</p>
		{:else}
			<div class="table-wrap">
				<table class="table">
					<thead><tr><th>Position</th><th>Component</th><th>PN / SN</th><th class="num">TSN</th><th class="num">TSO</th><th class="num">CSN</th><th>Age</th><th>Tasks</th><th></th></tr></thead>
					<tbody>
						{#each data.installed as c (c.id)}
							<tr>
								<td>{c.position ?? '—'}</td>
								<td class="wrap"><a href="/airworthiness/{data.tail}/components/{c.id}">{c.description}</a>{#if c.ata}<span class="sub">ATA {c.ata}</span>{/if}</td>
								<td class="mono">{c.pn} / {c.sn}</td>
								<td class="num mono">{c.tsn}</td>
								<td class="num mono">{c.tso}</td>
								<td class="num mono">{c.csn}</td>
								<td>{c.age}</td>
								<td class="wrap">
									{#if c.tasks.length === 0}—{:else}
										{#each c.tasks as t (t.id)}<a href="/airworthiness/{data.tail}/programme/tasks/{t.id}" class="status {t.status}" title={t.statusLabel}>{t.code}</a>{/each}
									{/if}
								</td>
								<td class="actions"><a href="/airworthiness/{data.tail}/components/{c.id}" class="btn btn-secondary xs">Open</a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<div class="cols">
		<div class="card stack">
			<h2>Spares and removed</h2>
			{#if data.others.length === 0}
				<p class="hint">No spares on the shelf and nothing removed yet.</p>
			{:else}
				<div class="table-wrap">
					<table class="table">
						<thead><tr><th>Component</th><th>PN / SN</th><th class="num">TSN</th><th>Where</th></tr></thead>
						<tbody>
							{#each data.others as c (c.id)}
								<tr>
									<td class="wrap"><a href="/airworthiness/{data.tail}/components/{c.id}">{c.description}</a></td>
									<td class="mono">{c.pn} / {c.sn}</td>
									<td class="num mono">{c.tsn}</td>
									<td class="wrap">
										{#if c.elsewhere}installed on <span class="tailnum">{c.elsewhere}</span>
										{:else if c.removed}removed {c.removed.on} at {c.removed.hours} h{#if c.removed.reason}<span class="sub">{c.removed.reason}</span>{/if}
										{:else}<span class="faint">spare · never installed</span>{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<form method="POST" action="?/add" class="card sub stack">
			<h2>Add component</h2>
			<div class="fields three">
				<label class="field"><span>Part number</span><input name="part_number" bind:value={pn} required /></label>
				<label class="field"><span>Serial number</span><input name="serial_number" bind:value={sn} required /></label>
				<label class="field"><span>ATA</span><input name="ata_chapter" bind:value={ata} placeholder="72" /></label>
				<label class="field span2"><span>Description</span><input name="description" bind:value={description} placeholder="Engine, Continental IO-360-ES" required /></label>
				<label class="field"><span>Manufacture date</span><input name="manufacture_date" type="date" bind:value={mfg} /></label>
				<label class="field span2"><span>Traceability</span><input name="traceability_ref" bind:value={trace} placeholder="Form 1 / 8130-3 no., logbook" /></label>
				<label class="field"><span>Notes</span><input name="notes" bind:value={notes} /></label>
			</div>
			<label class="field inline check"><input type="checkbox" name="fitted" bind:checked={fitted} /><span>Already fitted to {data.tail} — record the installation from the logbooks (no work order)</span></label>
			{#if fitted}
				<div class="fields three">
					<label class="field"><span>Fitted on</span><input name="installed_on" type="date" bind:value={installedOn} max={data.today} required /></label>
					<label class="field"><span>Aircraft hours then</span><input name="installed_at_hours" type="number" step="0.1" min="0" bind:value={atHours} required /></label>
					<label class="field"><span>Aircraft landings then</span><input name="installed_at_landings" type="number" step="1" min="0" bind:value={atLandings} placeholder="0" /></label>
					<label class="field"><span>Position</span><input name="position" bind:value={position} placeholder="Engine, Propeller, Magneto LH …" /></label>
					<label class="field"><span>TSN / TSO at fitting (h)</span><span class="row tight"><input name="tsn" type="number" step="0.1" min="0" bind:value={tsn} placeholder="0.0" aria-label="TSN at fitting" /><input name="tso" type="number" step="0.1" min="0" bind:value={tso} placeholder="0.0" aria-label="TSO at fitting" /></span></label>
					<label class="field"><span>CSN at fitting</span><input name="csn" type="number" step="1" min="0" bind:value={csn} placeholder="0" /></label>
				</div>
				<p class="hint">Today's TSN is then the TSN at fitting plus the aircraft hours flown since. For a part that has been on since before the flight log, use the aircraft's hours on the fitting date from the logbook — the counters only need the difference.</p>
			{/if}
			<div class="row wrap">
				<button type="submit" class="btn btn-secondary sm"><Icon name="plus" size={14} /> Add component</button>
				<span class="hint">A component is a serialised part. Unserialised parts are recorded as parts used on a work order item.</span>
			</div>
		</form>
	</div>
</div>

<style>
	th.num {
		text-align: right;
	}
	td.num {
		text-align: right;
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr;
		gap: 16px;
		align-items: start;
	}
	@media (min-width: 1100px) {
		.cols {
			grid-template-columns: 1fr 1fr;
		}
	}
	.fields.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.fields.three .span2 {
		grid-column: span 2;
	}
	.row.tight {
		gap: 6px;
	}
	.row.tight input {
		min-width: 0;
	}
	.check {
		align-items: center;
	}
	.check input {
		width: 18px;
		height: 18px;
	}
	.check > span {
		font-size: 13.5px;
		color: var(--ink);
		font-weight: 500;
	}
	td .status + .status {
		margin-left: 4px;
	}
	a.status {
		text-decoration: none;
	}
</style>
