<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Expenses — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Expenses</h1>
		<a href="/expenses/new" class="btn sm"><Icon name="camera" size={16} /> New receipt</a>
	</div>

	{#if data.saved}<p class="alert notice">Receipt saved.</p>{/if}
	{#if data.deleted}<p class="alert notice">Receipt deleted.</p>{/if}

	<div class="card stats3">
		<div class="stat"><div class="n">{data.totals.waiting}</div><div class="l">Waiting €</div></div>
		<div class="stat"><div class="n">{data.totals.paidThisYear}</div><div class="l">Paid this year €</div></div>
		<div class="stat"><div class="n">{data.totals.count}</div><div class="l">Receipts</div></div>
	</div>

	<p class="section-label">Receipts</p>
	{#if data.receipts.length === 0}
		<div class="card"><p class="muted">No receipts yet.</p></div>
	{:else}
		<!-- phone: list -->
		<div class="card tight only-phone">
			{#each data.receipts as r (r.id)}
				<a href="/expenses/{r.id}" class="list-item link">
					<span class="list-icon" class:teal={r.status === 'submitted'}><Icon name="receipt" size={17} /></span>
					<span class="list-main">
						<span class="list-title">{r.vendor} · €{r.total}</span>
						<span class="list-sub">{r.date} · {r.lines}</span>
						{#if r.rejected_reason}<span class="list-sub reason">{r.rejected_reason}</span>{/if}
					</span>
					<span class="list-end"><span class="status {r.status}">{r.status}</span><Icon name="chevron" size={16} /></span>
				</a>
			{/each}
		</div>
		<!-- laptop: table -->
		<div class="card only-desk">
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th>Date</th><th>Vendor</th><th>Lines</th><th class="num">Total €</th><th>Status</th><th>Paid</th><th></th></tr>
					</thead>
					<tbody>
						{#each data.receipts as r (r.id)}
							<tr>
								<td class="mono"><a href="/expenses/{r.id}">{r.date}</a></td>
								<td>{r.vendor}</td>
								<td class="wrap">{r.lines}{#if r.rejected_reason}<span class="sub reason">{r.rejected_reason}</span>{/if}</td>
								<td class="num">{r.total}</td>
								<td><span class="status {r.status}">{r.status}</span></td>
								<td class="faint">{r.paid}</td>
								<td class="actions">
									{#if r.canEdit}<a href="/expenses/{r.id}/edit" class="btn btn-secondary xs">Edit</a>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<style>
	.list-main {
		display: flex;
		flex-direction: column;
	}
	.reason {
		color: var(--danger);
		font-family: var(--sans);
	}
	a.list-item {
		color: inherit;
		text-decoration: none;
	}
	.only-desk {
		display: none;
	}
	@media (min-width: 900px) {
		.only-phone {
			display: none;
		}
		.only-desk {
			display: block;
		}
	}
</style>
