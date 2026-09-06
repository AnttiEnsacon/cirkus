<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Invoices — Cirkus</title>
</svelte:head>

<h1>Invoices</h1>
<p class="open">Open balance: <strong>€{data.open}</strong></p>

{#if data.invoices.length === 0}
	<p>No invoices yet.</p>
{:else}
	<table>
		<thead>
			<tr><th>Number</th><th>Period</th><th>Issued</th><th>Due</th><th>Total (€)</th><th>Status</th></tr>
		</thead>
		<tbody>
			{#each data.invoices as inv (inv.id)}
				<tr>
					<td class="mono"><a href="/invoices/{inv.id}">{inv.number}</a></td>
					<td class="mono">{inv.period}</td>
					<td class="mono">{inv.issued}</td>
					<td class="mono" class:overdue={inv.overdue}>{inv.due}{inv.overdue ? ' (overdue)' : ''}</td>
					<td class="num">{inv.total}</td>
					<td><span class="status {inv.status}">{inv.status}</span></td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.open {
		margin-top: -0.5rem;
		color: #55585c;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		max-width: 44rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.45rem 0.6rem;
		border-bottom: 1px solid #dddee0;
		font-size: 0.9rem;
		white-space: nowrap;
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
	.num {
		text-align: right;
		font-family: ui-monospace, monospace;
	}
	.status {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #55585c;
	}
	.status.paid {
		color: #1863dc;
	}
	.status.cancelled {
		color: #8a8d90;
		text-decoration: line-through;
	}
	.overdue {
		color: #b3261e;
	}
</style>
