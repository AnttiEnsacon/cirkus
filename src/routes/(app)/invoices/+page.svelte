<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Invoices — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Invoices</h1>
	</div>

	<div class="card stat">
		<div class="l">Open balance</div>
		<div class="n">€{data.open}</div>
	</div>

	{#if data.invoices.length === 0}
		<div class="card"><p class="muted">No invoices yet.</p></div>
	{:else}
		<div class="card tight">
			{#each data.invoices as inv (inv.id)}
				<a href="/invoices/{inv.id}" class="list-item link">
					<span class="list-icon" class:teal={inv.status === 'sent'}><Icon name="receipt" size={17} /></span>
					<span class="list-main">
						<span class="list-title"><span class="mono">{inv.number}</span> · €{inv.total}</span>
						<span class="list-sub">{inv.period} · due {inv.due}{inv.overdue ? ' · overdue' : ''}{inv.reference ? ` · ref ${inv.reference}` : ''}</span>
					</span>
					<span class="list-end">
						<span class="status {inv.overdue ? 'overdue' : inv.status}">{inv.overdue ? 'overdue' : inv.status}</span>
						<Icon name="chevron" />
					</span>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.link {
		text-decoration: none;
		color: inherit;
	}
	.list-main {
		display: flex;
		flex-direction: column;
	}
</style>
