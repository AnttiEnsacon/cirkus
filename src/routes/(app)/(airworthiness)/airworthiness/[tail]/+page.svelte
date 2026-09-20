<script lang="ts">
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.tail} — Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead tail={data.tail} subtitle={data.subtitle} active="dashboard" />

	<div class="card state">
		<div class="state-chip">
			<span class="chip {data.state.chip} big">
				{#if data.state.key === 'airworthy'}<Icon name="check" size={15} />{:else}<Icon name="alert" size={15} />{/if}
				{data.state.label}
			</span>
			<span class="faint">Status is advisory. The pre-flight check is still the pilot's.</span>
		</div>
		<div class="reasons">
			{#if data.state.reasons.length > 0}
				<p class="section-label">{data.state.key === 'grounded' ? 'Why' : 'Needs attention'}</p>
				<ul>
					{#each data.state.reasons as r (r)}<li>{r}</li>{/each}
				</ul>
			{:else}
				<p class="muted">Every task is inside its interval, the baseline is released and the programme is current.</p>
			{/if}
		</div>
	</div>

	<div class="card stats4">
		<div class="stat"><div class="n">{data.counters.hours} h</div><div class="l">airframe hours · {data.counters.source}</div></div>
		<div class="stat"><div class="n">{data.counters.landings}</div><div class="l">landings</div></div>
		<div class="stat"><div class="n">{data.counters.perDay} h/day</div><div class="l">≈ {data.counters.perYear} h/yr · trailing {data.counters.windowDays} d</div></div>
		<div class="stat">
			<div class="n">{data.counters.baselineAt}</div>
			<div class="l">baseline {data.counters.baselineReleased ? 'released' : 'not released'} · {data.counters.baselineHours} h</div>
		</div>
	</div>

	<div class="cols two">
		<div class="card stack">
			<div class="row between wrap">
				<h2>Open defects</h2>
				<a href="/airworthiness/{data.tail}/defects" class="faint">all defects</a>
			</div>
			{#if data.defects.length === 0}
				<p class="hint">None open. Pilots report from the phone; each lands here for assessment.</p>
			{:else}
				<div class="table-wrap">
					<table class="table">
						<tbody>
							{#each data.defects as d (d.id)}
								<tr>
									<td class="mono">#{d.number}</td>
									<td class="wrap"><a href="/airworthiness/{data.tail}/defects/{d.id}">{d.title}</a><span class="sub">{d.reportedOn} · {d.reportedBy}{d.status === 'deferred' && d.limit ? ` · deferred to ${d.limit}${d.limitSub ? ` ${d.limitSub}` : ''}` : ''}</span></td>
									<td>{#if d.airworthinessChip}<span class="chip {d.airworthinessChip} small">{d.airworthiness}</span>{:else}<span class="status {d.pill}">{d.statusLabel}</span>{/if}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
		<div class="card stack">
			<div class="row between wrap">
				<h2>Open work orders</h2>
				<a href="/airworthiness/{data.tail}/work-orders" class="faint">all work orders</a>
			</div>
			{#if data.orders.length === 0}
				<p class="hint">None open. <a href="/airworthiness/{data.tail}/work-orders">Open one</a> from the tasks that are due.</p>
			{:else}
				<div class="table-wrap">
					<table class="table">
						<tbody>
							{#each data.orders as o (o.id)}
								<tr>
									<td>{o.kind}</td>
									<td class="wrap"><a href="/airworthiness/{data.tail}/work-orders/{o.id}">{o.title}</a><span class="sub">opened {o.openedAt}{o.openedBy ? ` by ${o.openedBy}` : ''} · {o.items} {o.items === 1 ? 'item' : 'items'}</span></td>
									<td><span class="status open">Open</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>

	<div class="card stack">
		<div class="row between wrap">
			<h2>Due list</h2>
			<span class="faint">{data.activeCount} active {data.activeCount === 1 ? 'task' : 'tasks'} · sorted by what comes first</span>
		</div>
		{#if data.rows.length === 0}
			<p class="hint">No tasks yet. <a href="/airworthiness/{data.tail}/programme">Add them on the programme page</a> or import a CSV.</p>
		{:else}
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th>Code</th><th>Task</th><th>Interval</th><th>Tolerance</th><th>Last done</th><th>Due at</th><th class="num">Remaining</th><th>Projected</th><th>Status</th></tr>
					</thead>
					<tbody>
						{#each data.rows as r (r.id)}
							<tr>
								<td class="mono"><a href="/airworthiness/{data.tail}/programme/tasks/{r.id}">{r.code}</a></td>
								<td class="wrap">{r.title}<span class="sub">{r.source}{r.sourceRef ? ` · ${r.sourceRef}` : ''}{r.pilotOwner ? ' · pilot-owner' : ''}</span></td>
								<td>{r.interval}</td>
								<td class="muted">{r.tolerance}</td>
								<td>{r.lastDone}</td>
								<td class="mono">{r.dueAt}</td>
								<td class="num">{r.remaining}</td>
								<td>{r.projected}</td>
								<td><span class="status {r.status}">{r.statusLabel}</span>{#if r.missing}<span class="sub">missing {r.missing}</span>{/if}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		<p class="hint">Next due is computed from the last release and today's counters — nothing in this table is typed in. "Remaining" is the controlling limit (hours, calendar or landings, whichever comes first); the projection uses the trailing-year utilisation. Tolerances apply to ICA and MIP tasks only; ALS items and ADs have none.</p>
	</div>
</div>

<style>
	.state {
		display: flex;
		gap: 18px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.state-chip {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 0 0 220px;
	}
	.chip.big {
		align-self: flex-start;
		font-size: 13px;
		padding: 7px 12px;
	}
	.reasons {
		flex: 1 1 300px;
	}
	.reasons ul {
		margin: 6px 0 0;
		padding-left: 18px;
		font-size: 13.5px;
		color: var(--ink-soft);
	}
	.reasons li + li {
		margin-top: 4px;
	}
	.stats4 {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		text-align: center;
		padding: 14px 0;
	}
	.stats4 > div + div {
		border-left: 1px solid var(--line);
	}
	@media (max-width: 899px) {
		.stats4 {
			grid-template-columns: 1fr 1fr;
			row-gap: 12px;
		}
		.stats4 > div:nth-child(3) {
			border-left: none;
		}
	}
	th.num {
		text-align: right;
	}
	.cols.two {
		display: grid;
		grid-template-columns: 1fr;
		gap: 16px;
		align-items: start;
	}
	@media (min-width: 1000px) {
		.cols.two {
			grid-template-columns: 1fr 1fr;
		}
	}
	.chip.small {
		padding: 3px 8px;
		font-size: 11px;
	}
</style>
