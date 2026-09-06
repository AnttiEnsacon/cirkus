<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Billing — Cirkus</title>
</svelte:head>

<h1>Billing</h1>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}
{#if form?.created !== undefined}
	<p class="notice">{form.created === 0 ? 'Nothing to bill.' : `${form.created} invoice${form.created === 1 ? '' : 's'} created.`}</p>
{/if}

<h2>Ready to invoice</h2>
<p class="hint">Approved flights not yet on an invoice, at the current member rate.</p>
{#if data.unbilled.length === 0}
	<p>Nothing waiting — approve flights under <a href="/manage/flights">Flights</a> first.</p>
{:else}
	<table class="compact">
		<thead>
			<tr><th>Pilot</th><th>Flights</th><th>Hours</th><th>Amount (€)</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.unbilled as u (u.pilot_id)}
				<tr>
					<td>{u.pilot_name}</td>
					<td class="num">{u.flights}</td>
					<td class="num">{u.hours}</td>
					<td class="num">{u.amount}</td>
					<td>
						<form method="POST" action="?/create">
							<input type="hidden" name="pilot_id" value={u.pilot_id} />
							<button type="submit">Create invoice</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<form method="POST" action="?/createAll" class="all">
		<button type="submit">Create all {data.unbilled.length} invoices</button>
	</form>
{/if}

<h2>Invoices</h2>
{#if data.invoices.length === 0}
	<p>No invoices yet.</p>
{:else}
	<div class="table-wrap">
		<table>
			<thead>
				<tr><th>Number</th><th>Pilot</th><th>Period</th><th>Issued</th><th>Due</th><th>Total (€)</th><th>Status</th><th>Paid</th><th></th></tr>
			</thead>
			<tbody>
				{#each data.invoices as inv (inv.id)}
					<tr>
						<td class="mono"><a href="/invoices/{inv.id}">{inv.number}</a></td>
						<td>{inv.pilot_name}</td>
						<td class="mono">{inv.period}</td>
						<td class="mono">{inv.issued}</td>
						<td class="mono" class:overdue={inv.overdue}>{inv.due}{inv.overdue ? ' (overdue)' : ''}</td>
						<td class="num">{inv.total}</td>
						<td><span class="status {inv.status}">{inv.status}</span></td>
						<td>{inv.paid}</td>
						<td class="actions">
							{#if inv.status === 'issued'}
								<form method="POST" action="?/markPaid" class="pay">
									<input type="hidden" name="id" value={inv.id} />
									<input name="reference" placeholder="reference (optional)" />
									<button type="submit">Mark paid</button>
								</form>
								<form method="POST" action="?/cancel">
									<input type="hidden" name="id" value={inv.id} />
									<button type="submit" class="danger">Cancel</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	h2 {
		margin-top: 1.5rem;
		font-size: 1.1rem;
	}
	.hint {
		color: #55585c;
		font-size: 0.85rem;
		margin-top: -0.4rem;
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	table.compact {
		max-width: 40rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.55rem;
		border-bottom: 1px solid #dddee0;
		font-size: 0.85rem;
		white-space: nowrap;
		vertical-align: middle;
	}
	.num {
		text-align: right;
		font-family: ui-monospace, monospace;
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
	.all {
		margin-top: 0.6rem;
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.pay {
		display: flex;
		gap: 0.3rem;
	}
	.pay input {
		width: 10rem;
		padding: 0.25rem 0.4rem;
	}
	button {
		cursor: pointer;
		padding: 0.3rem 0.7rem;
	}
	button.danger {
		color: #b3261e;
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
	.error {
		color: #b3261e;
	}
	.notice {
		color: #1863dc;
	}
</style>
