<script lang="ts">
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	const v = form?.values;
	// svelte-ignore state_referenced_locally
	let kind = $state(v?.kind || 'scheduled');
	// svelte-ignore state_referenced_locally
	let title = $state(v?.title ?? '');
	// svelte-ignore state_referenced_locally
	let openedAt = $state(v?.opened_at || data.today);
	// svelte-ignore state_referenced_locally
	let notes = $state(v?.notes ?? '');
</script>

<svelte:head>
	<title>{data.tail} work orders — Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead tail={data.tail} subtitle="Work orders" active="workorders" />

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}

	<div class="card stack">
		<div class="row between wrap">
			<h2>Open</h2>
			<span class="faint">{data.open.length} open · items are added until the release</span>
		</div>
		{#if data.open.length === 0}
			<p class="hint">Nothing open. Open one below, from the tasks that are due.</p>
		{:else}
			<div class="table-wrap">
				<table class="table">
					<thead><tr><th>Kind</th><th>Title</th><th>Opened</th><th>By</th><th class="num">Items</th><th></th></tr></thead>
					<tbody>
						{#each data.open as o (o.id)}
							<tr>
								<td>{o.kind}</td>
								<td class="wrap"><a href="/airworthiness/{data.tail}/work-orders/{o.id}">{o.title}</a></td>
								<td>{o.openedAt}</td>
								<td>{o.openedBy}</td>
								<td class="num">{o.items}</td>
								<td class="actions"><a href="/airworthiness/{data.tail}/work-orders/{o.id}" class="btn btn-secondary xs">Open</a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<div class="card stack">
		<div class="row between wrap">
			<h2>Released</h2>
			<span class="faint">frozen · the due list counts from these</span>
		</div>
		{#if data.released.length === 0}
			<p class="hint">No released work orders yet.</p>
		{:else}
			<div class="table-wrap">
				<table class="table">
					<thead><tr><th>Released</th><th>Kind</th><th>Title</th><th>Readings</th><th>CRS</th><th>Hash</th><th></th></tr></thead>
					<tbody>
						{#each data.released as o (o.id)}
							<tr>
								<td>{o.releasedAt}</td>
								<td>{o.kind}</td>
								<td class="wrap"><a href={o.isBaseline ? `/airworthiness/${data.tail}/baseline` : `/airworthiness/${data.tail}/work-orders/${o.id}`}>{o.title}</a></td>
								<td class="mono">{o.readings}</td>
								<td class="wrap">{o.crs}{#if o.performedBy}<span class="sub">{o.performedBy}</span>{/if}</td>
								<td class="mono">{o.hash}</td>
								<td class="actions"><a href={o.isBaseline ? `/airworthiness/${data.tail}/baseline` : `/airworthiness/${data.tail}/work-orders/${o.id}`} class="btn btn-secondary xs">View</a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		{#if data.cancelled.length > 0}
			<p class="section-label">Cancelled</p>
			<div class="table-wrap">
				<table class="table">
					<tbody>
						{#each data.cancelled as o (o.id)}
							<tr class="cancelled">
								<td>{o.cancelledAt}</td>
								<td>{o.kind}</td>
								<td class="wrap"><a href="/airworthiness/{data.tail}/work-orders/{o.id}">{o.title}</a><span class="sub">{o.cancelledReason}</span></td>
								<td class="actions"><a href="/airworthiness/{data.tail}/work-orders/{o.id}" class="btn btn-secondary xs">View</a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<form method="POST" action="?/open" class="card sub stack">
		<h2>Open a work order</h2>
		<div class="fields open-fields">
			<label class="field">
				<span>Kind</span>
				<select name="kind" bind:value={kind}>
					<option value="scheduled">Scheduled</option>
					<option value="unscheduled">Unscheduled</option>
					<option value="defect">Defect</option>
				</select>
			</label>
			<label class="field title"><span>Title</span><input name="title" bind:value={title} placeholder="What the shop is asked to do" required /></label>
			<label class="field"><span>Opened on</span><input name="opened_at" type="date" bind:value={openedAt} required /></label>
			<label class="field notes"><span>Notes</span><input name="notes" bind:value={notes} placeholder="Shop, booking, anything the release should remember" /></label>
		</div>
		{#if data.suggested.length > 0 || data.others.length > 0}
			<p class="section-label">Start with these tasks</p>
			<div class="task-grid">
				{#each data.suggested as t (t.id)}
					<label class="field inline check"><input type="checkbox" name="task_ids" value={t.id} checked /><span><span class="mono">{t.code}</span> · {t.title} <span class="status {t.status}">{t.statusLabel}</span></span></label>
				{/each}
				{#each data.others as t (t.id)}
					<label class="field inline check"><input type="checkbox" name="task_ids" value={t.id} /><span><span class="mono">{t.code}</span> · {t.title}</span></label>
				{/each}
			</div>
		{/if}
		<div class="row wrap">
			<button type="submit" class="btn sm"><Icon name="plus" size={14} /> Open work order</button>
			<span class="hint">Items can be added, changed and removed until the release. Pilot-owner work is recorded from the pilot-owner page instead.</span>
		</div>
	</form>
</div>

<style>
	th.num {
		text-align: right;
	}
	tr.cancelled td {
		color: var(--ink-faint);
	}
	.open-fields {
		grid-template-columns: 1fr 2fr 1fr;
	}
	.open-fields .notes {
		grid-column: span 3;
	}
	@media (max-width: 899px) {
		.open-fields {
			grid-template-columns: 1fr 1fr;
		}
		.open-fields .title,
		.open-fields .notes {
			grid-column: span 2;
		}
	}
	.task-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 6px 12px;
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
</style>
