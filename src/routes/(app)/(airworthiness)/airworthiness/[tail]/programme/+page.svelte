<script lang="ts">
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	// Svelte 5: every edited input is bound to state (see HANDOFF §4). The
	// page remounts on navigation, so seeding from data once is intended.
	// After a failed submit the posted values win over the stored ones.
	// svelte-ignore state_referenced_locally
	const p = data.profile;
	// svelte-ignore state_referenced_locally
	const v = (k: keyof typeof p) => (form?.values?.[k] ?? p[k]) as string;
	let msn = $state(v('msn'));
	let yearBuilt = $state(v('year_built'));
	let mtow = $state(v('mtow_kg'));
	let hoursSource = $state(v('hours_source'));
	let baselineAt = $state(v('baseline_at'));
	let baselineHours = $state(v('baseline_hours'));
	let baselineLandings = $state(v('baseline_landings'));
	let ampBasis = $state(v('amp_basis'));
	let ampReference = $state(v('amp_reference'));
	let declaredAt = $state(v('amp_declared_at'));
	let reviewedAt = $state(v('amp_reviewed_at'));
	let warnHours = $state(v('warn_hours'));
	let warnDays = $state(v('warn_days'));
	let warnLandings = $state(v('warn_landings'));
</script>

<svelte:head>
	<title>{data.tail} programme — Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead tail={data.tail} subtitle={data.subtitle} active="programme" />

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.saved === 'profile'}<p class="alert notice">Profile saved.</p>{/if}
	{#if form?.imported}
		<p class="alert notice">
			Imported: {form.imported.added} added, {form.imported.updated} updated.
			{#each form.imported.notes as n (n)}<br />{n}{/each}
		</p>
	{/if}

	<form method="POST" action="?/saveProfile" class="card stack">
		<div class="row between wrap">
			<h2>Profile</h2>
			{#if p.amp_declared_at}<span class="status released">Declared {p.amp_declared_at}{p.amp_declared_by ? ` · ${p.amp_declared_by}` : ''}</span>{:else}<span class="status open">Not declared</span>{/if}
		</div>
		<div class="fields four">
			<label class="field">
				<span>Hours source</span>
				<select name="hours_source" bind:value={hoursSource}>
					<option value="tacho" disabled={!data.recordsTacho}>Tacho{data.recordsTacho ? '' : ' (not recorded on this aircraft)'}</option>
					<option value="block">Block time</option>
					<option value="airborne">Airborne time</option>
				</select>
			</label>
			<label class="field"><span>Baseline date</span><input name="baseline_at" type="date" bind:value={baselineAt} disabled={data.baselineLocked} required /></label>
			<label class="field"><span>Baseline hours</span><input name="baseline_hours" type="number" step="0.1" min="0" bind:value={baselineHours} disabled={data.baselineLocked} required /></label>
			<label class="field"><span>Baseline landings</span><input name="baseline_landings" type="number" step="1" min="0" bind:value={baselineLandings} disabled={data.baselineLocked} /></label>
			<label class="field"><span>MSN</span><input name="msn" bind:value={msn} placeholder="from the CofA" /></label>
			<label class="field"><span>Year built</span><input name="year_built" type="number" min="1900" max="2100" bind:value={yearBuilt} /></label>
			<label class="field"><span>MTOW kg</span><input name="mtow_kg" type="number" min="1" bind:value={mtow} /></label>
			<label class="field">
				<span>Programme basis</span>
				<select name="amp_basis" bind:value={ampBasis}>
					<option value="ica">Manufacturer's ICA</option>
					<option value="mip">Minimum inspection programme (MIP)</option>
				</select>
			</label>
			<label class="field span2"><span>Programme reference</span><input name="amp_reference" bind:value={ampReference} placeholder="Cirrus AMM 12137-001 rev …, ch. 4 & 5; Continental M-0; Hartzell 202A" /></label>
			<label class="field"><span>Declared on</span><input name="amp_declared_at" type="date" bind:value={declaredAt} /></label>
			<label class="field"><span>Last annual review</span><input name="amp_reviewed_at" type="date" bind:value={reviewedAt} /></label>
			<label class="field"><span>Warn at · hours</span><input name="warn_hours" type="number" step="0.1" min="0" bind:value={warnHours} /></label>
			<label class="field"><span>Warn at · days</span><input name="warn_days" type="number" step="1" min="0" bind:value={warnDays} /></label>
			<label class="field"><span>Warn at · landings</span><input name="warn_landings" type="number" step="1" min="0" bind:value={warnLandings} /></label>
		</div>
		<div class="row wrap">
			<button type="submit" class="btn btn-secondary sm">Save profile</button>
			<span class="hint">
				{#if data.baselineLocked}The baseline is released; its date and figures are frozen. Hours and landings not in the flight log go in as adjustments under Usage.{:else}The baseline figures are the airframe totals at the end of the baseline day, from the logbooks or the CAO's status list. They freeze when the baseline is released.{/if}
			</span>
		</div>
	</form>

	<div class="card stack">
		<div class="row between wrap">
			<h2>Tasks <span class="faint count">{data.activeCount} active{data.inactiveCount ? ` · ${data.inactiveCount} deactivated` : ''}</span></h2>
			<a href="/airworthiness/{data.tail}/programme/tasks/new" class="btn sm"><Icon name="plus" size={14} /> Add task</a>
		</div>
		{#if data.tasks.length === 0}
			<p class="hint">No tasks yet. Add them one by one, or import the programme from a CSV below.</p>
		{:else}
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th>Code</th><th>Task</th><th>Source</th><th>Interval</th><th>Tolerance</th><th>Anchor</th><th>Pilot-owner</th><th></th></tr>
					</thead>
					<tbody>
						{#each data.tasks as t (t.id)}
							<tr class:inactive={!t.active}>
								<td class="mono">{t.code}</td>
								<td class="wrap">{t.title}{#if !t.active}<span class="sub">deactivated</span>{/if}</td>
								<td>{t.source}{t.sourceRef ? ` · ${t.sourceRef}` : ''}</td>
								<td>{t.interval}</td>
								<td class="muted">{t.tolerance}</td>
								<td class="muted">{t.anchor}</td>
								<td>{#if t.pilotOwner}<span class="chip teal small">yes</span>{:else}<span class="faint">—</span>{/if}</td>
								<td class="actions"><a href="/airworthiness/{data.tail}/programme/tasks/{t.id}" class="btn btn-secondary xs">Edit</a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		<p class="hint">Deactivated tasks keep their history and drop out of the due list. ALS items and ADs are saved with zero tolerance whatever the form says.</p>
	</div>

	<form method="POST" action="?/import" enctype="multipart/form-data" class="card sub stack">
		<h2>Import tasks from CSV</h2>
		<div class="row wrap import">
			<label class="field grow"><span>File</span><input name="file" type="file" accept=".csv,text/csv" required /></label>
			<button type="submit" class="btn sm"><Icon name="upload" size={14} /> Import</button>
			<a href="/airworthiness/{data.tail}/programme/template" class="btn btn-secondary sm"><Icon name="download" size={14} /> Download template</a>
		</div>
		<p class="hint">Columns = the task fields, header row required, UTF-8. All-or-nothing: a row with an error stops the import and the message names the row. Existing codes are updated, new codes added; nothing is deleted.</p>
	</form>
</div>

<style>
	.fields.four {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.span2 {
		grid-column: span 2;
	}
	@media (max-width: 899px) {
		.fields.four {
			grid-template-columns: 1fr 1fr;
		}
	}
	.count {
		font-weight: 600;
	}
	.chip.small {
		padding: 3px 8px;
		font-size: 11px;
	}
	tr.inactive td {
		color: var(--ink-faint);
	}
	.import {
		align-items: flex-end;
	}
	.grow {
		flex: 1 1 320px;
	}
</style>
