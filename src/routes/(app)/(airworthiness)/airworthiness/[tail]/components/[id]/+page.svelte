<script lang="ts">
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	const v = form?.values;
	// svelte-ignore state_referenced_locally
	let description = $state(v?.description ?? data.component.description);
	// svelte-ignore state_referenced_locally
	let ata = $state(v?.ata_chapter ?? data.component.ata);
	// svelte-ignore state_referenced_locally
	let mfg = $state(v?.manufacture_date ?? data.component.manufactureDate);
	// svelte-ignore state_referenced_locally
	let trace = $state(v?.traceability_ref ?? data.component.traceability);
	// svelte-ignore state_referenced_locally
	let notes = $state(v?.notes ?? data.component.notes);

	const STATE: Record<string, { label: string; pill: string }> = {
		installed: { label: 'Installed', pill: 'released' },
		elsewhere: { label: 'Installed elsewhere', pill: 'open' },
		removed: { label: 'Removed', pill: 'cancelled' },
		spare: { label: 'Spare', pill: 'undefined' }
	};
</script>

<svelte:head>
	<title>{data.component.description} — {data.tail} — Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead tail={data.tail} subtitle={data.component.description} active="components" back={{ href: `/airworthiness/${data.tail}/components`, label: 'Components' }} />

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.saved}<p class="alert notice">Saved.</p>{/if}

	<div class="cols">
		<div class="stack">
			<div class="card stack">
				<div class="row between wrap">
					<h2><span class="mono">{data.component.pn} / {data.component.sn}</span></h2>
					<span class="status {STATE[data.state].pill}">{STATE[data.state].label}{data.state === 'elsewhere' ? ` · ${data.where}` : ''}</span>
				</div>
				<dl class="kv">
					<dt>Position</dt><dd>{data.position ?? '—'}</dd>
					<dt>Manufactured</dt><dd>{data.component.manufactureDate || '—'}{data.component.manufactureDate ? ` · ${data.component.age}` : ''}</dd>
					<dt>Today</dt><dd class="mono">{#if data.counters}TSN {data.counters.tsn} h · TSO {data.counters.tso} h · CSN {data.counters.csn}{:else}—{/if}</dd>
				</dl>
			</div>

			<div class="card stack">
				<h2>Installation history</h2>
				{#if data.installations.length === 0}
					<p class="hint">Never installed. A work order item that installs it opens the record at release; a part already fitted before the log began is recorded from the components page.</p>
				{:else}
					<div class="table-wrap">
						<table class="table">
							<thead><tr><th>Aircraft</th><th>Installed</th><th>Removed</th><th>At fitting</th></tr></thead>
							<tbody>
								{#each data.installations as i (i.id)}
									<tr>
										<td><span class="tailnum">{i.tail}</span>{#if i.position}<span class="sub">{i.position}</span>{/if}</td>
										<td class="wrap">{i.installed}{#if i.installedOrder}<span class="sub"><a href="/airworthiness/{data.tail}/work-orders/{i.installedOrder.id}">WO {i.installedOrder.title}</a></span>{:else}<span class="sub">setup record</span>{/if}</td>
										<td class="wrap">{#if i.removed}{i.removed}{#if i.removedReason}<span class="sub">{i.removedReason}</span>{/if}{#if i.removedOrder}<span class="sub"><a href="/airworthiness/{data.tail}/work-orders/{i.removedOrder.id}">WO {i.removedOrder.title}</a></span>{/if}{:else}<span class="faint">—</span>{/if}</td>
										<td class="mono">{i.atFitting}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<div class="card stack">
				<div class="row between wrap">
					<h2>Tasks on this component</h2>
					<a href="/airworthiness/{data.tail}/programme" class="faint">set on the programme page</a>
				</div>
				{#if data.tasks.length === 0}
					<p class="hint">None. On a task, choose this component under <em>applies to</em>; its intervals then count in the component's own hours and cycles.</p>
				{:else}
					<div class="table-wrap">
						<table class="table">
							<thead><tr><th>Code</th><th>Task</th><th>Interval</th><th>Last done</th><th>Due at</th><th>Remaining</th><th>Status</th></tr></thead>
							<tbody>
								{#each data.tasks as t (t.id)}
									<tr class:inactive={!t.active}>
										<td class="mono"><a href="/airworthiness/{data.tail}/programme/tasks/{t.id}">{t.code}</a></td>
										<td class="wrap">{t.title}<span class="sub">{t.source}{t.sourceRef ? ` ${t.sourceRef}` : ''} · anchored at {t.anchor}{t.active ? '' : ' · deactivated'}</span></td>
										<td>{t.interval}</td>
										<td class="mono">{t.lastDone}</td>
										<td class="mono">{t.dueAt}</td>
										<td class="mono">{t.remaining}</td>
										<td><span class="status {t.status}">{t.statusLabel}</span>{#if t.missing}<span class="sub">{t.missing}</span>{/if}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<div class="card stack">
				<h2>Work orders</h2>
				{#if data.orders.length === 0}
					<p class="hint">No work order has removed or installed this component.</p>
				{:else}
					<div class="table-wrap">
						<table class="table">
							<thead><tr><th>When</th><th>Work order</th><th>What</th><th>Status</th></tr></thead>
							<tbody>
								{#each data.orders as o (o.id + o.what)}
									<tr>
										<td>{o.when}</td>
										<td class="wrap"><a href="/airworthiness/{data.tail}/work-orders/{o.id}">{o.title}</a><span class="sub">{o.kind} · {o.description}</span></td>
										<td>{o.what}</td>
										<td><span class="status {o.status}">{o.status}</span></td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>

		<form method="POST" action="?/update" class="card sub stack">
			<h2>Identity</h2>
			<p class="hint">Part and serial number are fixed — they are what the installations and work orders refer to. The rest can be corrected here.</p>
			<div class="fields one">
				<label class="field"><span>Description</span><input name="description" bind:value={description} required /></label>
				<label class="field"><span>ATA chapter</span><input name="ata_chapter" bind:value={ata} /></label>
				<label class="field"><span>Manufacture date</span><input name="manufacture_date" type="date" bind:value={mfg} /></label>
				<label class="field"><span>Traceability</span><input name="traceability_ref" bind:value={trace} placeholder="Form 1 / 8130-3 no., logbook" /></label>
				<label class="field"><span>Notes</span><textarea name="notes" rows="3" bind:value={notes}></textarea></label>
			</div>
			<div class="row"><button type="submit" class="btn btn-secondary sm"><Icon name="check" size={14} /> Save</button></div>
		</form>
	</div>
</div>

<style>
	.cols {
		display: grid;
		grid-template-columns: 1fr;
		gap: 16px;
		align-items: start;
	}
	@media (min-width: 1100px) {
		.cols {
			grid-template-columns: 2fr 1fr;
		}
	}
	.kv {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 14px;
		margin: 0;
		font-size: 14px;
	}
	.kv dt {
		color: var(--ink-faint);
	}
	.kv dd {
		margin: 0;
		color: var(--ink);
	}
	.fields.one {
		grid-template-columns: 1fr;
	}
	tr.inactive td {
		color: var(--ink-faint);
	}
	.sub a {
		color: inherit;
	}
</style>
