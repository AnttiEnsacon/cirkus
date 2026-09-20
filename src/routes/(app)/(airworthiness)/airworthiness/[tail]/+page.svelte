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
</style>
