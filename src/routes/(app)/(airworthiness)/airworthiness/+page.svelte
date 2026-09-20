<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Airworthiness</h1>
		<span class="faint">As of {data.today} · counters from the flight log</span>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}

	{#each data.fleet as plane (plane.id)}
		{#if plane.tracked && plane.state && plane.counters}
			<div class="card stack">
				<div class="row between wrap">
					<div class="row">
						<span class="list-icon teal"><Icon name="plane" /></span>
						<div class="list-main">
							<div class="list-title"><span class="tailnum" style="font-size:16px">{plane.tail}</span> · {plane.type}</div>
							<div class="list-sub">{plane.summary}</div>
						</div>
					</div>
					<div class="chiprow">
						<span class="chip {plane.state.chip}">{plane.state.label}</span>
						{#if plane.state.key !== 'airworthy'}
							<span class="chip">{plane.state.reasons.length} {plane.state.reasons.length === 1 ? 'reason' : 'reasons'}</span>
						{/if}
					</div>
				</div>

				<div class="stats3 stats">
					<div class="stat"><div class="n">{plane.counters.hours}</div><div class="l">airframe hours ({plane.counters.source})</div></div>
					<div class="stat"><div class="n">{plane.counters.landings}</div><div class="l">landings</div></div>
					<div class="stat"><div class="n">{plane.counters.perDay}</div><div class="l">h/day · trailing year</div></div>
				</div>

				{#if plane.next.length > 0}
					<p class="section-label">Next due</p>
					<div class="next">
						{#each plane.next as row (row.id)}
							<div class="list-item">
								<div class="list-main">
									<div class="list-title"><span class="mono">{row.code}</span> · {row.title}</div>
									<div class="list-sub">{row.interval} · last {row.lastDone}</div>
								</div>
								<div class="list-end">
									<span class="num rem">{row.remaining}</span>
									<span class="faint proj">{row.projected}</span>
									<span class="status {row.status}">{row.statusLabel}</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="hint">No tasks yet — add them on the programme page or import a CSV.</p>
				{/if}

				<div class="row wrap">
					<a href="/airworthiness/{plane.tail}" class="btn btn-secondary sm">Open {plane.tail} <Icon name="chevron" size={14} /></a>
					<a href="/airworthiness/{plane.tail}/programme" class="btn btn-secondary sm">Programme</a>
				</div>
			</div>
		{:else}
			<form method="POST" action="?/setup" class="card row between wrap">
				<input type="hidden" name="aircraft_id" value={plane.id} />
				<div class="row">
					<span class="list-icon"><Icon name="plane" /></span>
					<div class="list-main">
						<div class="list-title"><span class="tailnum" style="font-size:16px">{plane.tail}</span> · {plane.type}</div>
						<div class="list-sub">Not tracked — no programme, no baseline</div>
					</div>
				</div>
				<button type="submit" class="btn sm"><Icon name="plus" size={14} /> Set up tracking</button>
			</form>
		{/if}
	{/each}
</div>

<style>
	.stats {
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 10px 0;
	}
	.next {
		display: flex;
		flex-direction: column;
	}
	.rem {
		min-width: 64px;
	}
	.proj {
		min-width: 92px;
		text-align: right;
	}
	@media (max-width: 899px) {
		.proj {
			display: none;
		}
	}
</style>
