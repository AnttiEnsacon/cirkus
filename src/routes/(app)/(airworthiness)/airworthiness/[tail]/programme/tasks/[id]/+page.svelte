<script lang="ts">
	import { page } from '$app/state';
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';
	import type { PageProps } from './$types';
	import type { TaskFormValues } from '$lib/components/TaskForm.svelte';
	let { data, form }: PageProps = $props();
	const saved = $derived(page.url.searchParams.get('saved') === '1');
	// After a failed submit the posted values win over the stored ones.
	const initial = $derived.by((): TaskFormValues => {
		const r = form?.values;
		if (!r) return data.initial;
		const g = (k: keyof TaskFormValues) => (r[k as keyof typeof r] ?? '') as string;
		return {
			...data.initial,
			code: g('code'), title: g('title'), source: g('source') || 'ica', source_ref: g('source_ref'),
			interval_hours: g('interval_hours'), interval_months: g('interval_months'), interval_landings: g('interval_landings'),
			one_time: g('one_time') === 'yes', anchor_kind: g('anchor_kind') || 'last_compliance',
			anchor_date: g('anchor_date'), anchor_hours: g('anchor_hours'), anchor_landings: g('anchor_landings'),
			tolerance_hours: g('tolerance_hours'), tolerance_days: g('tolerance_days'), tolerance_landings: g('tolerance_landings'),
			reset_rule: g('reset_rule') || 'from_original', pilot_owner_allowed: g('pilot_owner_allowed') === 'yes', notes: g('notes'),
			component_id: g('component_id')
		};
	});
</script>

<svelte:head>
	<title>{data.isNew ? 'New task' : data.task?.code} — {data.tail} — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead
		tail={data.tail}
		subtitle={data.isNew ? 'New task' : `${data.task?.code} · ${data.task?.title}`}
		active="programme"
		back={{ href: `/airworthiness/${data.tail}/programme`, label: 'Programme' }}
	/>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if saved}<p class="alert notice">Task saved.</p>{/if}
	{#if data.task && !data.task.active}<p class="alert error">This task is deactivated: it keeps its history but is not in the due list.</p>{/if}

	<div class="cols c21">
		<form method="POST" action="?/save" class="card">
			{#key data.task?.id ?? 'new'}
				<TaskForm {initial} isNew={data.isNew} components={data.components} />
			{/key}
		</form>

		<div class="stack">
			{#if data.computed}
				<div class="card stack">
					<h2>Computed now</h2>
					<dl class="kv">
						<dt>Last done</dt><dd>{data.computed.lastDone}</dd>
						<dt>Records</dt><dd>{data.computed.compliances} {data.computed.compliances === 1 ? 'compliance' : 'compliances'}</dd>
						<dt>Due at</dt><dd>{data.computed.dueAt}</dd>
						<dt>Controlling</dt><dd>{data.computed.controlling}</dd>
						<dt>Remaining</dt><dd>{data.computed.remaining}</dd>
						<dt>Projected</dt><dd>{data.computed.projected}</dd>
						<dt>Status</dt><dd><span class="status {data.computed.status}">{data.computed.statusLabel}</span>{#if data.computed.missing}<span class="faint"> · missing {data.computed.missing}</span>{/if}</dd>
					</dl>
					<p class="hint">Recomputed on every save from the values on the left and today's counters.</p>
				</div>
				{#if data.component}
					<div class="card sub stack">
						<p class="section-label">Component</p>
						<p class="faint"><a href="/airworthiness/{data.tail}/components/{data.component.id}">{data.component.label}</a>{data.component.installed ? '' : ' — not installed on this aircraft'}. Intervals count in its TSN and CSN.</p>
					</div>
				{/if}
				<div class="card sub stack">
					<p class="section-label">History</p>
					{#if data.history.length === 0}
						<p class="faint">No compliance recorded yet — the baseline or a released work order with this task puts one here.</p>
					{:else}
						<ul class="history">
							{#each data.history as h (h.id)}
								<li><span class="mono">{h.on}</span> · {h.hours}{h.landings !== '—' ? ` · ${h.landings}` : ''} — <a href={h.isBaseline ? `/airworthiness/${data.tail}/baseline` : `/airworthiness/${data.tail}/work-orders/${h.id}`}>{h.title}</a>{#if h.crs}<span class="faint"> · CRS {h.crs}</span>{/if}</li>
							{/each}
						</ul>
					{/if}
				</div>
				{#if data.task}
					<form method="POST" action={data.task.active ? '?/deactivate' : '?/reactivate'} class="card sub stack">
						<p class="section-label">{data.task.active ? 'Deactivate' : 'Reactivate'}</p>
						<p class="faint">{data.task.active ? 'Drops the task out of the due list. Its history stays; it can be reactivated.' : 'Puts the task back into the due list.'}</p>
						<button type="submit" class="btn sm {data.task.active ? 'btn-danger' : 'btn-secondary'}">{data.task.active ? 'Deactivate task' : 'Reactivate task'}</button>
					</form>
				{/if}
			{:else}
				<div class="card sub stack">
					<p class="section-label">Computed now</p>
					<p class="faint">Save the task to see its due state. It will read as "undefined" until the baseline says when it was last done.</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.kv {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 14px;
		font-size: 13.5px;
		margin: 0;
	}
	.kv dt {
		color: var(--ink-faint);
		font-weight: 600;
	}
	.kv dd {
		margin: 0;
		font-family: var(--mono);
	}
	.btn {
		align-self: flex-start;
	}
	.history {
		margin: 0;
		padding-left: 18px;
		font-size: 13px;
		display: grid;
		gap: 4px;
	}
</style>
