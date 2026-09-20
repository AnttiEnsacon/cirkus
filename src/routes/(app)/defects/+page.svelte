<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const LABEL: Record<string, string> = { open: 'Open', deferred: 'Deferred', rectified: 'Rectified', closed: 'Closed' };
	const PILL: Record<string, string> = { open: 'open', deferred: 'due_soon', rectified: 'released', closed: 'complete' };
</script>

<svelte:head>
	<title>Defects — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Defects</h1>
		<a href="/defects/new" class="btn sm"><Icon name="flag" size={16} /> Report a defect</a>
	</div>

	{#if data.saved}<p class="alert notice">Defect #{data.saved} reported. The technical manager assesses it; until then the aircraft shows as needing attention.</p>{/if}

	{#each data.perAircraft as a (a.id)}
		<p class="section-label">Open defects · <span class="tailnum">{a.tail}</span></p>
		{#if a.defects.length === 0}
			<div class="card tight"><div class="list-item"><span class="list-main"><span class="list-sub">No open defects.</span></span></div></div>
		{:else}
			<div class="card tight">
				{#each a.defects as d (d.id)}
					<div class="list-item">
						<span class="list-main">
							<span class="list-title"><span class="mono">#{d.number}</span> {d.title}</span>
							<span class="list-sub">{d.status === 'deferred' ? `deferred${d.limit ? ` to ${d.limit}` : ''}${d.limitSub ? ` ${d.limitSub}` : ''} · ` : ''}{d.airworthiness} · reported {d.reportedOn} by {d.reportedBy}</span>
						</span>
						<span class="list-end">{#if d.airworthinessChip === 'danger'}<span class="chip danger small">grounded</span>{/if}<span class="status {d.pill}">{d.statusLabel}</span></span>
					</div>
				{/each}
			</div>
		{/if}
	{/each}

	{#if data.mine.length > 0}
		<p class="section-label">My reports</p>
		<div class="card tight">
			{#each data.mine as d (d.id)}
				<div class="list-item">
					<span class="list-main">
						<span class="list-title"><span class="mono">#{d.number}</span> {d.title}</span>
						<span class="list-sub"><span class="tailnum">{d.tail}</span> · {d.reportedOn}</span>
					</span>
					<span class="list-end"><span class="status {PILL[d.status]}">{LABEL[d.status]}</span></span>
				</div>
			{/each}
		</div>
	{/if}
	<p class="hint">Rectified and closed defects are on the aircraft's Defects page under Airworthiness.</p>
</div>

<style>
	.chip.small {
		padding: 3px 8px;
		font-size: 11px;
	}
</style>
