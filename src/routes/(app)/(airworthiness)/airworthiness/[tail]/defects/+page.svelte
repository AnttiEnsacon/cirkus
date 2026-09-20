<script lang="ts">
	import AirworthinessHead from '$lib/components/AirworthinessHead.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.tail} defects — Airworthiness — Cirkus</title>
</svelte:head>

<div class="page">
	<AirworthinessHead tail={data.tail} subtitle="Defects" active="defects" />

	<div class="card stack">
		<div class="row between wrap">
			<h2>Defects</h2>
			<span class="faint">{data.counts.open} open · {data.counts.deferred} deferred{data.counts.unassessed ? ` · ${data.counts.unassessed} awaiting assessment` : ''} · reported by pilots from the phone</span>
		</div>
		{#if data.defects.length === 0}
			<p class="hint">No defects reported on {data.tail}. Pilots report one from <a href="/defects/new">Report a defect</a>; it lands here for assessment.</p>
		{:else}
			<div class="table-wrap">
				<table class="table">
					<thead><tr><th>#</th><th>Reported</th><th>By</th><th>Title</th><th>Status</th><th>Airworthiness</th><th>Limit</th><th></th></tr></thead>
					<tbody>
						{#each data.defects as d (d.id)}
							<tr class:done={d.status === 'closed' || d.status === 'rectified'}>
								<td class="mono">#{d.number}</td>
								<td>{d.reportedOn}</td>
								<td>{d.reportedBy}</td>
								<td class="wrap"><a href="/airworthiness/{data.tail}/defects/{d.id}">{d.title}</a>{#if d.hasPhoto}<span class="sub">photo</span>{/if}</td>
								<td><span class="status {d.pill}">{d.statusLabel}</span></td>
								<td>{#if d.airworthinessChip}<span class="chip {d.airworthinessChip} small">{d.airworthiness}</span>{:else}<span class="faint">{d.airworthiness}</span>{/if}</td>
								<td class="wrap">
									{#if d.limit}
										{#if d.rectifiedOrderId}<a href="/airworthiness/{data.tail}/work-orders/{d.rectifiedOrderId}">{d.limit}</a>{:else}{d.limit}{/if}
										{#if d.limitSub}<span class="sub">{d.limitSub}</span>{/if}
									{:else}—{/if}
								</td>
								<td class="actions"><a href="/airworthiness/{data.tail}/defects/{d.id}" class="btn btn-secondary xs">Open</a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<style>
	tr.done td {
		color: var(--ink-faint);
	}
	.chip.small {
		padding: 3px 8px;
		font-size: 11px;
	}
</style>
