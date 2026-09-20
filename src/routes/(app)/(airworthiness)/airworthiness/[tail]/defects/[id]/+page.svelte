<script lang="ts">
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	const v = form?.values;
	// svelte-ignore state_referenced_locally
	let affects = $state(v?.affects ?? (data.defect.affects === null ? '' : data.defect.affects ? 'yes' : 'no'));
	// svelte-ignore state_referenced_locally
	let assessment = $state(v?.assessment ?? data.defect.assessment);
	// svelte-ignore state_referenced_locally
	let deferredBy = $state(v?.deferred_by ?? data.defect.deferredBy);
	// svelte-ignore state_referenced_locally
	let basis = $state(v?.deferral_basis ?? data.defect.basis);
	// svelte-ignore state_referenced_locally
	let limitDate = $state(v?.deferral_limit_date ?? data.defect.limitDate);
	// svelte-ignore state_referenced_locally
	let limitHours = $state(v?.deferral_limit_hours ?? data.defect.limitHours);
	// svelte-ignore state_referenced_locally
	let closedReason = $state(v?.closed_reason ?? '');

	const d = $derived(data.defect);
</script>

<svelte:head>
	<title>#{d.number} {d.title} — {data.tail} — Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead tail={data.tail} subtitle="Defect #{d.number}" active="defects" back={{ href: `/airworthiness/${data.tail}/defects`, label: 'Defects' }} />

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.saved === 'assessed'}<p class="alert notice">Assessment saved.</p>{/if}
	{#if form?.saved === 'deferred'}<p class="alert notice">Deferred. The dashboard shows the limit; past it the aircraft reads as grounded.</p>{/if}
	{#if form?.saved === 'closed'}<p class="alert notice">Closed without work.</p>{/if}
	{#if form?.saved === 'reopened'}<p class="alert notice">Reopened.</p>{/if}

	<div class="cols">
		<div class="stack">
			<div class="card stack">
				<div class="row between wrap">
					<h2><span class="mono">#{d.number}</span> {d.title}</h2>
					<span class="status {d.pill}">{d.statusLabel}</span>
				</div>
				<p class="muted">Reported {d.reportedAt} by {d.reportedBy}{d.flight ? ` after ${d.flight}` : ''}.{#if d.description}{' '}<q>{d.description}</q>{/if}</p>
				{#if data.images.length > 0}
					<div class="photos">
						{#each data.images as img (img.id)}
							<a href={img.url} target="_blank" rel="noopener"><img src={img.url} alt="Defect #{d.number} photo" width={img.width} height={img.height} loading="lazy" /></a>
						{/each}
					</div>
				{/if}

				{#if d.affects === true && d.active}
					<p class="alert error">Assessed by {d.assessedBy} {d.assessedOn}: affects airworthiness{d.assessment ? ` — ${d.assessment.replace(/\.\s*$/, '')}` : ''}. The aircraft is grounded until rectified.</p>
				{:else if d.affects === false && d.active}
					<p class="alert notice">Assessed by {d.assessedBy} {d.assessedOn}: does not affect airworthiness{d.assessment ? ` — ${d.assessment.replace(/\.\s*$/, '')}` : ''}.</p>
				{:else if d.affects === null && d.active}
					<p class="alert notice">Awaiting assessment — the aircraft shows as needing attention until it is assessed.</p>
				{/if}
				{#if d.status === 'deferred'}
					<p class="alert {d.pastLimit ? 'error' : 'notice'}">Deferred {d.deferredOn} by {d.deferredBy} — {d.basis}. Limit {d.limitDate || '—'}{d.limitHours ? ` or ${d.limitHours} h` : ''}{d.pastLimit ? ' — past the limit: the aircraft reads as grounded.' : ` (now ${data.now.hours} h).`}</p>
				{/if}
				{#if d.rectified}
					<p class="alert notice">Rectified {d.rectified.on} on <a href="/airworthiness/{data.tail}/work-orders/{d.rectified.id}">{d.rectified.kind} work order · {d.rectified.title}</a>.</p>
				{/if}
				{#if d.status === 'closed'}
					<p class="alert notice">Closed {d.closedOn} by {d.closedBy}: {d.closedReason}</p>
				{/if}

				{#if d.active}
					<form method="POST" action="?/assess" class="stack">
						<p class="section-label">Assessment</p>
						<div class="row wrap radios">
							<label class="field inline"><input type="radio" name="affects" value="yes" bind:group={affects} /><span>Affects airworthiness — grounds the aircraft</span></label>
							<label class="field inline"><input type="radio" name="affects" value="no" bind:group={affects} /><span>Does not affect airworthiness</span></label>
						</div>
						<label class="field"><span>Assessment</span><textarea name="assessment" rows="2" bind:value={assessment} placeholder="What it is, what is suspected, what must happen before flight"></textarea></label>
						<div class="row wrap">
							<button type="submit" class="btn btn-secondary sm">Save assessment</button>
							<button type="submit" class="btn sm" formaction="?/openOrder"><Icon name="wrench" size={14} /> Open a work order for this defect</button>
						</div>
					</form>
				{/if}

				{#if data.orders.length > 0}
					<p class="section-label">Work orders</p>
					<ul class="plain">
						{#each data.orders as o (o.id)}
							<li><a href="/airworthiness/{data.tail}/work-orders/{o.id}">{o.title}</a> — {o.kind} · <span class="status {o.status}">{o.status}</span></li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<div class="stack">
			{#if d.active}
				<form method="POST" action="?/defer" class="card stack">
					<p class="section-label">Defer (ML.A.403)</p>
					<label class="field"><span>Assessed as not hazardous by</span><input name="deferred_by" bind:value={deferredBy} placeholder="certifying staff name and licence, or pilot-owner" /></label>
					<label class="field"><span>Basis</span><input name="deferral_basis" bind:value={basis} placeholder="why it can wait" /></label>
					<div class="fields two">
						<label class="field"><span>Limit date</span><input name="deferral_limit_date" type="date" bind:value={limitDate} min={data.today} /></label>
						<label class="field"><span>Limit hours</span><input name="deferral_limit_hours" type="number" step="0.1" min="0" bind:value={limitHours} placeholder="airframe h" /></label>
					</div>
					<button type="submit" class="btn btn-secondary sm self-start">{d.status === 'deferred' ? 'Update deferral' : 'Defer'}</button>
					<p class="hint">Only a defect assessed as not affecting airworthiness can be deferred. Past the limit the aircraft reads as grounded.</p>
				</form>
				<form method="POST" action="?/close" class="card sub stack">
					<p class="section-label">Close without work</p>
					<label class="field"><span>Reason</span><input name="closed_reason" bind:value={closedReason} placeholder="no fault found, duplicate of #…" /></label>
					<button type="submit" class="btn btn-secondary sm self-start">Close</button>
				</form>
			{:else if d.status === 'closed'}
				<form method="POST" action="?/reopen" class="card sub stack">
					<p class="section-label">Reopen</p>
					<p class="faint">Closed by mistake? Reopening puts it back on the dashboard for assessment.</p>
					<button type="submit" class="btn btn-secondary sm self-start">Reopen</button>
				</form>
			{:else}
				<div class="card sub stack">
					<p class="section-label">Record</p>
					<p class="faint">A rectified defect is part of the work order's frozen record. If the fault comes back, report a new defect.</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.cols {
		display: grid;
		grid-template-columns: 1fr;
		gap: 16px;
		align-items: start;
	}
	@media (min-width: 1000px) {
		.cols {
			grid-template-columns: 2fr 1fr;
		}
	}
	.photos {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
	.photos img {
		width: 220px;
		height: auto;
		max-height: 300px;
		object-fit: cover;
		border-radius: 12px;
		border: 1px solid var(--line);
		display: block;
	}
	.radios {
		gap: 16px;
	}
	.radios .field.inline {
		align-items: center;
		gap: 6px;
	}
	.radios input {
		width: 16px;
		height: 16px;
	}
	.radios span {
		font-size: 13.5px;
		color: var(--ink);
		font-weight: 500;
	}
	.fields.two {
		grid-template-columns: 1fr 1fr;
	}
	.self-start {
		align-self: flex-start;
	}
	ul.plain {
		margin: 0;
		padding-left: 18px;
		font-size: 13.5px;
	}
	q {
		font-style: italic;
	}
</style>
