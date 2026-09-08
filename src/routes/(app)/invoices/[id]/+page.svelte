<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const inv = $derived(data.invoice);
</script>

<svelte:head>
	<title>Invoice {inv.number} — Cirkus</title>
</svelte:head>

<div class="page invoice">
	<p class="no-print"><a href="/invoices" class="back"><Icon name="back" size={16} /> All invoices</a></p>

	<article class="card stack">
		<header class="head">
			<div>
				<p class="eyebrow">KML Aviation Oy</p>
				<h1>Invoice <span class="mono">{inv.number}</span></h1>
				<span class="status {inv.status}">{inv.status}</span>
			</div>
			<dl class="meta">
				<dt>Billed to</dt><dd>{inv.pilot_name}<br /><span class="faint">{inv.pilot_email}</span></dd>
				<dt>Period</dt><dd class="mono">{inv.period}</dd>
				<dt>Issued</dt><dd class="mono">{inv.issued}</dd>
				<dt>Due</dt><dd class="mono">{inv.due}</dd>
				{#if inv.paid}<dt>Paid</dt><dd class="mono">{inv.paid}{inv.paid_reference ? ` · ${inv.paid_reference}` : ''}</dd>{/if}
				{#if inv.cancelled}<dt>Cancelled</dt><dd class="mono">{inv.cancelled}</dd>{/if}
			</dl>
		</header>

		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr><th>Date</th><th>Aircraft</th><th>Route</th><th>Basis</th><th class="num">Hours</th><th class="num">Rate €/h</th><th class="num">Amount €</th></tr>
				</thead>
				<tbody>
					{#each data.lines as l (l.id)}
						<tr>
							<td class="mono">{l.date}</td>
							<td class="tailnum">{l.aircraft}</td>
							<td class="mono">{l.route}</td>
							<td class="mono">{l.billing}</td>
							<td class="num">{l.hours}</td>
							<td class="num">{l.rate}</td>
							<td class="num">{l.amount}</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr><td colspan="6" class="total-label">Total</td><td class="num total">{inv.total} {inv.currency}</td></tr>
				</tfoot>
			</table>
		</div>

		{#if inv.notes}<p class="muted">{inv.notes}</p>{/if}

		<div class="no-print">
			<button type="button" class="btn btn-secondary sm" onclick={() => window.print()}>Print / save as PDF</button>
		</div>
	</article>
</div>

<style>
	.invoice {
		max-width: 52rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		text-decoration: none;
		font-weight: 600;
		font-size: 13px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		gap: 24px;
		flex-wrap: wrap;
	}
	.head h1 {
		margin: 2px 0 8px;
	}
	.meta {
		display: grid;
		grid-template-columns: auto auto;
		gap: 4px 14px;
		margin: 0;
		font-size: 13px;
		align-content: start;
	}
	dt {
		color: var(--ink-faint);
	}
	dd {
		margin: 0;
	}
	.total-label {
		text-align: right;
	}
	.total {
		font-size: 15px;
	}
	@media print {
		.card {
			border: none;
			padding: 0;
		}
	}
</style>
