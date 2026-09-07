<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Billing — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Billing</h1>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.created !== undefined}
		<p class="alert notice">{form.created === 0 ? 'Nothing to bill.' : `${form.created} invoice${form.created === 1 ? '' : 's'} created.`}</p>
	{/if}

	<p class="section-label">Ready to invoice</p>
	{#if data.unbilled.length === 0}
		<div class="card"><p class="muted">Nothing waiting — approve flights under <a href="/manage/flights">Flights</a> first.</p></div>
	{:else}
		<div class="card stack">
			<div class="tight-list">
				{#each data.unbilled as u (u.pilot_id)}
					<div class="list-item">
						<span class="list-icon"><Icon name="users" size={17} /></span>
						<span class="list-main">
							<span class="list-title">{u.pilot_name}</span>
							<span class="list-sub">{u.flights} flight{u.flights === 1 ? '' : 's'} · {u.hours} h</span>
						</span>
						<span class="list-end">
							<span class="mono amount">€{u.amount}</span>
							<form method="POST" action="?/create">
								<input type="hidden" name="pilot_id" value={u.pilot_id} />
								<button type="submit" class="btn btn-teal xs">Create invoice</button>
							</form>
						</span>
					</div>
				{/each}
			</div>
			<form method="POST" action="?/createAll">
				<button type="submit" class="btn sm"><Icon name="receipt" size={16} /> Create all {data.unbilled.length} invoices</button>
			</form>
		</div>
	{/if}

	<p class="section-label">Invoices</p>
	{#if data.invoices.length === 0}
		<div class="card"><p class="muted">No invoices yet.</p></div>
	{:else}
		<div class="card">
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th>Number</th><th>Pilot</th><th>Period</th><th>Issued</th><th>Due</th><th class="num">Total €</th><th>Status</th><th>Paid</th><th></th></tr>
					</thead>
					<tbody>
						{#each data.invoices as inv (inv.id)}
							<tr>
								<td class="mono"><a href="/invoices/{inv.id}">{inv.number}</a></td>
								<td>{inv.pilot_name}</td>
								<td class="mono">{inv.period}</td>
								<td class="mono">{inv.issued}</td>
								<td class="mono">{inv.due}</td>
								<td class="num">{inv.total}</td>
								<td><span class="status {inv.overdue ? 'overdue' : inv.status}">{inv.overdue ? 'overdue' : inv.status}</span></td>
								<td class="faint">{inv.paid}</td>
								<td class="actions">
									{#if inv.status === 'issued'}
										<form method="POST" action="?/markPaid" class="pay">
											<input type="hidden" name="id" value={inv.id} />
											<input name="reference" placeholder="reference" class="ref" />
											<button type="submit" class="btn btn-teal xs">Mark paid</button>
										</form>
										<form method="POST" action="?/cancel"><input type="hidden" name="id" value={inv.id} /><button type="submit" class="btn btn-danger xs">Cancel</button></form>
									{/if}
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
	.amount {
		font-weight: 700;
	}
	.ref {
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		padding: 5px 8px;
		width: 9rem;
		font-size: 12px;
		font-family: var(--sans);
	}
	.btn {
		align-self: flex-start;
	}
</style>
