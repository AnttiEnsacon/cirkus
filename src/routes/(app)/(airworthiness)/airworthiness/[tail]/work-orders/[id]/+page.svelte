<script lang="ts">
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	const isOpen = $derived(data.order.status === 'open');

	// Bound inputs (HANDOFF §4): after a failed submit the posted values win.
	// svelte-ignore state_referenced_locally
	const v = form?.values;
	// add item
	// svelte-ignore state_referenced_locally
	let taskId = $state(v?.task_id ?? '');
	// svelte-ignore state_referenced_locally
	let description = $state(v?.description ?? '');
	// svelte-ignore state_referenced_locally
	let reference = $state(v?.reference_data ?? '');
	// svelte-ignore state_referenced_locally
	let defectId = $state(v?.defect_id ?? '');
	// svelte-ignore state_referenced_locally
	let removedId = $state(v?.removed_component_id ?? '');
	// svelte-ignore state_referenced_locally
	let installedId = $state(v?.installed_component_id ?? '');
	// svelte-ignore state_referenced_locally
	let newPn = $state(v?.new_part_number ?? '');
	// svelte-ignore state_referenced_locally
	let newSn = $state(v?.new_serial_number ?? '');
	// svelte-ignore state_referenced_locally
	let newDesc = $state(v?.new_description ?? '');
	// svelte-ignore state_referenced_locally
	let newAta = $state(v?.new_ata ?? '');
	// svelte-ignore state_referenced_locally
	let newMfg = $state(v?.new_manufacture_date ?? '');
	// svelte-ignore state_referenced_locally
	let newTrace = $state(v?.new_traceability ?? '');
	// svelte-ignore state_referenced_locally
	let tsn = $state(v?.installed_tsn ?? '');
	// svelte-ignore state_referenced_locally
	let tso = $state(v?.installed_tso ?? '');
	// svelte-ignore state_referenced_locally
	let csn = $state(v?.installed_csn ?? '');
	// svelte-ignore state_referenced_locally
	let positionLabel = $state(v?.position_label ?? '');
	// svelte-ignore state_referenced_locally
	let parts = $state(v?.parts ?? '');
	// release
	// svelte-ignore state_referenced_locally
	let releasedAt = $state(v?.released_at ?? data.today);
	// svelte-ignore state_referenced_locally
	let releasedHours = $state(v?.released_hours ?? '');
	// svelte-ignore state_referenced_locally
	let releasedLandings = $state(v?.released_landings ?? '');
	// svelte-ignore state_referenced_locally
	let performedByOrg = $state(v?.performed_by_org ?? '');
	// svelte-ignore state_referenced_locally
	let performedByRef = $state(v?.performed_by_ref ?? '');
	// svelte-ignore state_referenced_locally
	let crsName = $state(v?.crs_name ?? '');
	// svelte-ignore state_referenced_locally
	let crsLicence = $state(v?.crs_licence ?? '');
	// svelte-ignore state_referenced_locally
	let crsText = $state(v?.crs_text ?? 'Certificate of release to service: the work identified was carried out in accordance with Part-ML and, in respect of that work, the aircraft is considered ready for release to service. Limitations: none.');
	// cancel
	let cancelReason = $state('');
	let showCancel = $state(false);

	const showNew = $derived(installedId === 'new');
	const showFitting = $derived(installedId !== '');
	const taskLabel = $derived(data.options.tasks.find((t) => t.id === taskId)?.title ?? '');
</script>

<svelte:head>
	<title>{data.tail} — {data.order.title} — Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead tail={data.tail} subtitle={data.order.title} active="workorders" back={{ href: `/airworthiness/${data.tail}/work-orders`, label: 'Work orders' }} />

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.saved === 'item'}<p class="alert notice">Item added.</p>{/if}
	{#if form?.saved === 'removed'}<p class="alert notice">Item removed.</p>{/if}
	{#if data.justReleased}<p class="alert notice">Released. The order is frozen and the due list counts from it now.</p>{/if}

	<div class="card row between wrap head-card">
		<div class="row wrap">
			<span class="status {data.order.status}">{data.order.status === 'open' ? 'Open' : data.order.status === 'released' ? 'Released' : 'Cancelled'}</span>
			<span class="muted">{data.order.kindLabel} · opened {data.order.openedAt}{data.order.openedBy ? ` by ${data.order.openedBy}` : ''}{data.order.notes ? ` · ${data.order.notes}` : ''}</span>
		</div>
		{#if isOpen}
			<button type="button" class="btn btn-danger xs" onclick={() => (showCancel = !showCancel)}>Cancel order</button>
		{:else if data.order.status === 'cancelled'}
			<span class="faint">Cancelled {data.order.cancelledAt}{data.order.cancelledBy ? ` by ${data.order.cancelledBy}` : ''} — {data.order.cancelledReason}</span>
		{/if}
	</div>

	{#if isOpen && showCancel}
		<form method="POST" action="?/cancel" class="card sub stack">
			<h2>Cancel this order</h2>
			<div class="fields cancel-fields">
				<label class="field reason"><span>Why</span><input name="reason" bind:value={cancelReason} placeholder="Shop booking moved; opened by mistake; …" required /></label>
			</div>
			<div class="row wrap">
				<button type="submit" class="btn btn-danger sm">Cancel the order</button>
				<span class="hint">The order stays in the list, marked cancelled, and nothing counts from it. Its items are kept for the record.</span>
			</div>
		</form>
	{/if}

	{#if data.order.status === 'released'}
		<div class="card stack">
			<div class="row between wrap">
				<h2>Release to service</h2>
				<span class="faint">frozen · {data.order.releasedAt}{data.order.releasedBy ? ` · entered by ${data.order.releasedBy}` : ''}</span>
			</div>
			<dl class="facts">
				<div><dt>Readings at release</dt><dd class="mono">{data.order.releasedHours} h · {data.order.releasedLandings ?? '—'} ldg</dd></div>
				{#if data.computed}
					<div><dt>Cirkus computed for that day</dt><dd class="mono">{data.computed.hours} h · {data.computed.landings} ldg{#if data.computed.delta !== null} <span class="chip {data.computed.off ? 'amber' : 'teal'}">Δ {data.computed.delta} h</span>{/if}</dd></div>
				{/if}
				<div><dt>Performed by</dt><dd>{data.order.performedByOrg ?? '—'}{#if data.order.performedByRef}<span class="sub">{data.order.performedByRef}</span>{/if}</dd></div>
				<div><dt>CRS signed by</dt><dd>{data.order.crsName}{#if data.order.crsLicence}<span class="sub">{data.order.crsLicence}</span>{/if}</dd></div>
				{#if data.order.crsText}<div class="wide"><dt>CRS text</dt><dd class="crs">{data.order.crsText}</dd></div>{/if}
				{#if data.order.hash}<div class="wide"><dt>Release hash</dt><dd class="mono small">{data.order.hash}</dd></div>{/if}
			</dl>
			{#if data.computed?.off}
				<p class="hint">The readings differ from what Cirkus computes from the flight log by more than 1.0 h. Check the usage page: a missing flight or a Tacho typo is the usual cause; an adjustment there brings the counters in line.</p>
			{/if}
		</div>
	{/if}

	<div class="card stack">
		<div class="row between wrap">
			<h2>Items <span class="faint count">{data.items.length}</span></h2>
			{#if isOpen}<span class="faint">one line per task done, part swapped or defect rectified</span>{/if}
		</div>
		{#if data.items.length === 0}
			<p class="hint">No items yet. {#if isOpen}Add the work below as it is done — every item becomes a compliance record at release.{/if}</p>
		{:else}
			<div class="table-wrap">
				<table class="table">
					<thead><tr><th>#</th><th>Task</th><th>Description</th><th>Component</th><th>Parts</th><th>Defect</th>{#if isOpen}<th></th>{/if}</tr></thead>
					<tbody>
						{#each data.items as i (i.id)}
							<tr>
								<td class="num">{i.n}</td>
								<td class="mono">{i.taskCode ?? '—'}</td>
								<td class="wrap">{i.description}{#if i.reference}<span class="sub">{i.reference}</span>{/if}</td>
								<td class="wrap">
									{#if i.removed}<span class="swap">out {i.removed}</span>{/if}
									{#if i.installed}<span class="swap">in {i.installed}{i.position ? ` as ${i.position}` : ''}</span><span class="sub">{i.installedReadings}</span>{/if}
									{#if !i.removed && !i.installed}—{/if}
								</td>
								<td class="wrap">{#if i.parts.length === 0}—{:else}{#each i.parts as p, k (k)}<span class="part">{p}</span>{/each}{/if}</td>
								<td class="wrap">{i.defect ?? '—'}</td>
								{#if isOpen}
									<td class="actions">
										<form method="POST" action="?/removeItem">
											<input type="hidden" name="item_id" value={i.id} />
											<button type="submit" class="btn btn-secondary xs">Remove</button>
										</form>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		{#if data.installations.length > 0}
			<p class="section-label">Installations this order {data.order.status === 'released' ? 'opened or closed' : 'will open or close'}</p>
			<ul class="plain">
				{#each data.installations as ci (ci.id)}
					<li><a href="/airworthiness/{data.tail}/components/{ci.componentId}">{ci.label}</a> — {ci.what}</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if isOpen}
		<form method="POST" action="?/addItem" class="card stack">
			<h2>Add item</h2>
			<div class="fields four">
				<label class="field">
					<span>Task</span>
					<select name="task_id" bind:value={taskId}>
						<option value="">— none (unscheduled work)</option>
						{#each data.options.tasks as t (t.id)}
							<option value={t.id} disabled={data.isPilotOwner && !t.pilot_owner_allowed}>{t.code} · {t.title}</option>
						{/each}
					</select>
				</label>
				<label class="field span2"><span>Description</span><input name="description" bind:value={description} placeholder={taskLabel || 'What was done'} /></label>
				<label class="field"><span>Reference data</span><input name="reference_data" bind:value={reference} placeholder="AMM 05-20-01, SB …" /></label>
				<label class="field">
					<span>Defect rectified</span>
					<select name="defect_id" bind:value={defectId}>
						<option value="">—</option>
						{#each data.options.defects as d (d.id)}
							<option value={d.id}>#{d.number} {d.title}</option>
						{/each}
					</select>
				</label>
				{#if !data.isPilotOwner}
					<label class="field">
						<span>Component removed</span>
						<select name="removed_component_id" bind:value={removedId}>
							<option value="">—</option>
							{#each data.options.installed as c (c.id)}
								<option value={c.id}>{c.label}</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span>Component installed</span>
						<select name="installed_component_id" bind:value={installedId}>
							<option value="">—</option>
							{#each data.options.spares as c (c.id)}
								<option value={c.id}>spare: {c.label}</option>
							{/each}
							<option value="new">new component…</option>
						</select>
					</label>
					<label class="field"><span>Position</span><input name="position_label" bind:value={positionLabel} placeholder="LH, #2, nose …" disabled={!showFitting} /></label>
				{/if}
			</div>
			{#if showNew}
				<p class="section-label">New component</p>
				<div class="fields four">
					<label class="field"><span>Part number</span><input name="new_part_number" bind:value={newPn} required /></label>
					<label class="field"><span>Serial number</span><input name="new_serial_number" bind:value={newSn} required /></label>
					<label class="field span2"><span>Description</span><input name="new_description" bind:value={newDesc} placeholder="Magneto, Slick 6314" required /></label>
					<label class="field"><span>ATA</span><input name="new_ata" bind:value={newAta} placeholder="74" /></label>
					<label class="field"><span>Manufacture date</span><input name="new_manufacture_date" type="date" bind:value={newMfg} /></label>
					<label class="field span2"><span>Traceability</span><input name="new_traceability" bind:value={newTrace} placeholder="8130-3 / Form 1 no." /></label>
				</div>
			{/if}
			{#if showFitting}
				<div class="fields four">
					<label class="field"><span>TSN at fitting (h)</span><input name="installed_tsn" type="number" step="0.1" min="0" bind:value={tsn} placeholder="0.0" /></label>
					<label class="field"><span>TSO at fitting (h)</span><input name="installed_tso" type="number" step="0.1" min="0" bind:value={tso} placeholder="0.0" /></label>
					<label class="field"><span>CSN at fitting</span><input name="installed_csn" type="number" step="1" min="0" bind:value={csn} placeholder="0" /></label>
					<span class="field"><span>&nbsp;</span><span class="hint">Blank counts as zero. A serialised part is a component; unserialised parts go under parts used.</span></span>
				</div>
			{/if}
			<label class="field"><span>Parts used — one per line: part number · serial · quantity · traceability</span><textarea name="parts" rows="2" bind:value={parts} placeholder="6314 · B5678 · 1 · 8130-3 ref&#10;654301 · — · 1"></textarea></label>
			<div class="row wrap">
				<button type="submit" class="btn btn-secondary sm"><Icon name="plus" size={14} /> Add item</button>
				{#if data.isPilotOwner}<span class="hint">A pilot-owner order takes Appendix II tasks only, and no component swaps.</span>{/if}
			</div>
		</form>

		<form method="POST" action="?/release" class="card stack">
			<div class="row between wrap">
				<h2>Release</h2>
				<span class="faint">what the mechanic wrote on the work report</span>
			</div>
			<div class="fields four">
				<label class="field"><span>Released on</span><input name="released_at" type="date" bind:value={releasedAt} required /></label>
				<label class="field"><span>Hours at release</span><input name="released_hours" type="number" step="0.1" min="0" bind:value={releasedHours} required /></label>
				<label class="field"><span>Landings at release</span><input name="released_landings" type="number" step="1" min="0" bind:value={releasedLandings} /></label>
				<span class="field"><span>&nbsp;</span><span class="alert notice compact"><Icon name="gauge" size={14} /> Cirkus counts {data.now.hours} h · {data.now.landings} ldg today</span></span>
				<label class="field"><span>Performed by</span><input name="performed_by_org" bind:value={performedByOrg} placeholder="Maintenance organisation" /></label>
				<label class="field"><span>Approval / reference</span><input name="performed_by_ref" bind:value={performedByRef} placeholder="FI.145.xxxx · work report no." /></label>
				<label class="field"><span>CRS signed by</span><input name="crs_name" bind:value={crsName} placeholder="Name on the CRS" required /></label>
				<label class="field"><span>Licence / authorisation</span><input name="crs_licence" bind:value={crsLicence} placeholder="Part-66 no. or authorisation" /></label>
				<label class="field span4"><span>CRS text</span><textarea name="crs_text" rows="2" bind:value={crsText}></textarea></label>
			</div>
			<div class="row wrap">
				<button type="submit" class="btn btn-teal sm" disabled={data.items.length === 0}><Icon name="check" size={14} /> Release</button>
				<span class="hint">Freezes the order and its items; opens and closes the component installations (tasks on a removed component follow the one fitted in its place); marks the defects rectified; moves the due list. A difference over 1.0 h from the computed hours is shown as a warning, never a block.</span>
			</div>
		</form>
	{/if}
</div>

<style>
	.head-card {
		padding: 12px 16px;
	}
	.count {
		font-weight: 600;
	}
	td.num {
		color: var(--ink-faint);
	}
	.swap {
		display: block;
		font-size: 13px;
	}
	.part {
		display: block;
		font-size: 13px;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px 20px;
		margin: 0;
	}
	@media (min-width: 900px) {
		.facts {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	.facts > div {
		min-width: 0;
	}
	.facts .wide {
		grid-column: 1 / -1;
	}
	.facts dt {
		font-size: 12px;
		color: var(--ink-faint);
		margin-bottom: 2px;
	}
	.facts dd {
		margin: 0;
		font-size: 14px;
		color: var(--ink);
	}
	.facts dd .sub {
		display: block;
	}
	.facts dd.small {
		font-size: 12px;
		word-break: break-all;
	}
	.facts dd.crs {
		white-space: pre-wrap;
	}
	.fields.four {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.fields.four .span2 {
		grid-column: span 2;
	}
	.fields.four .span4 {
		grid-column: span 4;
	}
	@media (max-width: 899px) {
		.fields.four {
			grid-template-columns: 1fr 1fr;
		}
		.fields.four .span4 {
			grid-column: span 2;
		}
	}
	.cancel-fields {
		grid-template-columns: 1fr;
	}
	.alert.compact {
		padding: 8px 12px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-size: 13px;
	}
	ul.plain {
		margin: 0;
		padding-left: 18px;
		font-size: 13.5px;
	}
	td form {
		display: inline;
	}
</style>
