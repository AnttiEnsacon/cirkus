<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const inv = $derived(data.invoice);
</script>

<svelte:head>
	<title>Invoice {inv.number} — Cirkus</title>
</svelte:head>

<article class="invoice">
	<header>
		<div>
			<p class="issuer">KML Aviation Oy</p>
			<h1>Invoice {inv.number}</h1>
			<span class="status {inv.status}">{inv.status}</span>
		</div>
		<dl class="meta">
			<dt>Billed to</dt><dd>{inv.pilot_name}<br /><span class="muted">{inv.pilot_email}</span></dd>
			<dt>Period</dt><dd class="mono">{inv.period}</dd>
			<dt>Issued</dt><dd class="mono">{inv.issued}</dd>
			<dt>Due</dt><dd class="mono">{inv.due}</dd>
			{#if inv.paid}
				<dt>Paid</dt><dd class="mono">{inv.paid}{inv.paid_reference ? ` · ${inv.paid_reference}` : ''}</dd>
			{/if}
			{#if inv.cancelled}
				<dt>Cancelled</dt><dd class="mono">{inv.cancelled}</dd>
			{/if}
		</dl>
	</header>

	<table>
		<thead>
			<tr><th>Date</th><th>Aircraft</th><th>Route</th><th>Hobbs</th><th class="num">Hours</th><th class="num">Rate (€/h)</th><th class="num">Amount (€)</th></tr>
		</thead>
		<tbody>
			{#each data.lines as l (l.id)}
				<tr>
					<td class="mono">{l.date}</td>
					<td>{l.aircraft}</td>
					<td class="mono">{l.route}</td>
					<td class="mono">{l.hobbs}</td>
					<td class="num">{l.hours}</td>
					<td class="num">{l.rate}</td>
					<td class="num">{l.amount}</td>
				</tr>
			{/each}
		</tbody>
		<tfoot>
			<tr><td colspan="6" class="label">Total</td><td class="num total">{inv.total} {inv.currency}</td></tr>
		</tfoot>
	</table>

	{#if inv.notes}
		<p class="notes">{inv.notes}</p>
	{/if}

	<p class="actions no-print">
		<a href="/invoices">← All invoices</a>
		<button type="button" onclick={() => window.print()}>Print / save as PDF</button>
	</p>
</article>

<style>
	.invoice {
		max-width: 52rem;
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 2rem;
		flex-wrap: wrap;
		margin-bottom: 1.5rem;
	}
	.issuer {
		margin: 0;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #55585c;
	}
	h1 {
		margin: 0.2rem 0 0.4rem;
	}
	.meta {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0.25rem 1rem;
		margin: 0;
		font-size: 0.9rem;
		align-content: start;
	}
	dt {
		color: #55585c;
	}
	dd {
		margin: 0;
	}
	.muted {
		color: #8a8d90;
		font-size: 0.85rem;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: 0.45rem 0.6rem;
		border-bottom: 1px solid #dddee0;
		font-size: 0.9rem;
	}
	th.num,
	td.num {
		text-align: right;
		font-family: ui-monospace, monospace;
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
	tfoot td {
		border-bottom: none;
		border-top: 2px solid #1a1a1c;
		font-weight: 700;
	}
	.label {
		text-align: right;
	}
	.total {
		font-size: 1.05rem;
	}
	.status {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border: 1px solid #c7c9cc;
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
		color: #55585c;
	}
	.status.paid {
		color: #1863dc;
		border-color: #1863dc;
	}
	.status.cancelled {
		text-decoration: line-through;
	}
	.notes {
		color: #55585c;
		font-size: 0.9rem;
	}
	.actions {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-top: 1.5rem;
	}
	button {
		cursor: pointer;
		padding: 0.35rem 0.8rem;
	}
	@media print {
		.no-print {
			display: none;
		}
	}
</style>
