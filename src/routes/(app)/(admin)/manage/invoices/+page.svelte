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
		{#if data.procountor}
			<form method="POST" action="?/sync">
				<button type="submit" class="btn sm"><Icon name="refresh" size={16} /> Sync with Procountor</button>
			</form>
		{/if}
	</div>

	{#if !data.procountor}
		<p class="alert notice">Procountor is not configured — invoices are created as drafts and are not sent to anyone.</p>
	{/if}
	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.created !== undefined}
		<p class="alert notice">
			{form.created === 0 ? 'Nothing to bill.' : `${form.created} invoice${form.created === 1 ? '' : 's'} created`}{#if form.created > 0 && data.procountor}, {form.pushed ?? 0} sent to Procountor.{:else if form.created > 0}.{/if}
		</p>
	{/if}
	{#if form?.synced}
		<p class="alert notice">
			{form.synced.checked === 0
				? 'No open invoices to check.'
				: `${form.synced.checked} open invoice${form.synced.checked === 1 ? '' : 's'} checked, ${form.synced.paid} paid${form.synced.errors ? `, ${form.synced.errors} could not be read` : ''}.`}
		</p>
	{/if}

	<p class="section-label">Ready to invoice</p>
	{#if data.unbilled.length === 0}
		<div class="card"><p class="muted">No unbilled flights.</p></div>
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
					<!-- the flights that would go on this pilot's invoice -->
					{#each data.flights.filter((f) => f.pilot_id === u.pilot_id) as f (f.id)}
						<div class="list-item flight">
							<span class="list-main">
								<span class="mono">{f.date} · <span class="tailnum">{f.tail_number}</span> · {f.route}</span>
								<span class="list-sub">{f.billing} · {f.hours} h</span>
							</span>
							<span class="list-end"><span class="mono">€{f.amount}</span></span>
						</div>
					{/each}
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
						<tr><th>Number</th><th>Pilot</th><th>Period</th><th>Due</th><th class="num">Total €</th><th>Status</th><th>Procountor</th><th></th></tr>
					</thead>
					<tbody>
						{#each data.invoices as inv (inv.id)}
							<tr>
								<td class="mono">
									<a href="/invoices/{inv.id}">{inv.procountor_number ?? inv.number}</a>
									{#if inv.procountor_number}<span class="sub">Cirkus {inv.number}</span>{/if}
								</td>
								<td>{inv.pilot_name}</td>
								<td class="mono">{inv.period}</td>
								<td class="mono">{inv.due}</td>
								<td class="num">{inv.total}</td>
								<td><span class="status {inv.overdue ? 'overdue' : inv.status}">{inv.overdue ? 'overdue' : inv.status}</span></td>
								<td class="faint wrap">
									{#if inv.reference}<span class="mono">ref {inv.reference}</span>{/if}
									{#if inv.paid}<span class="sub">paid {inv.paid}</span>{/if}
									{#if inv.status === 'error' && inv.error}<span class="sub err">{inv.error}</span>{/if}
									{#if inv.status === 'draft' && inv.error}<span class="sub">{inv.error}</span>{/if}
								</td>
								<td class="actions">
									{#if inv.status === 'draft' || inv.status === 'error'}
										<form method="POST" action="?/retry"><input type="hidden" name="id" value={inv.id} /><button type="submit" class="btn btn-teal xs" disabled={!data.procountor}>Send</button></form>
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
	.flight {
		padding-left: 3.25rem;
		color: var(--ink-soft);
		font-size: 13px;
	}
	@media (max-width: 899px) {
		.flight {
			padding-left: 1.5rem;
		}
	}
	.sub {
		display: block;
		font-size: 11.5px;
		color: var(--ink-faint);
		font-family: var(--sans);
	}
	.wrap {
		max-width: 14rem;
	}
	.table td.actions form {
		display: block;
		margin: 0 0 4px auto;
		width: max-content;
	}
	.err {
		color: var(--danger);
	}
	.btn {
		align-self: flex-start;
	}
</style>
