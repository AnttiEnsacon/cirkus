<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Expenses — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Expenses</h1>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}

	<p class="section-label">{data.waiting.length > 0 ? `To pay back · €${data.waitingTotal}` : 'To pay back'}</p>
	{#if data.waiting.length === 0}
		<div class="card"><p class="muted">Nothing waiting.</p></div>
	{:else}
		<div class="card tight">
			{#each data.waiting as r (r.id)}
				<div class="receipt">
					<a href="/expenses/{r.id}" class="thumb" aria-label="Open receipt">
						{#if r.thumb}<img src={r.thumb} alt="" loading="lazy" />{/if}
					</a>
					<div class="who">
						<a href="/expenses/{r.id}" class="list-title">{r.pilot_name}</a>
						<span class="list-sub">{r.vendor} · {r.date}</span>
						<span class="list-sub">sent {r.sent}</span>
						{#if r.notes}<span class="list-sub">{r.notes}</span>{/if}
					</div>
					<div class="lines">
						{#each r.lines as l, i (i)}
							<div class="row between"><span>{l.code} · {l.label}</span><span class="mono">{l.amount}</span></div>
						{/each}
					</div>
					<div class="end">
						<span class="mono total">€{r.total}</span>
						<form method="POST" action="?/markPaid" class="act">
							<input type="hidden" name="id" value={r.id} />
							<input name="reference" placeholder="reference" class="ref" aria-label="Payment reference" />
							<button type="submit" class="btn btn-teal xs">Mark paid</button>
						</form>
						<form method="POST" action="?/reject" class="act">
							<input type="hidden" name="id" value={r.id} />
							<input name="reason" placeholder="reason" class="ref" aria-label="Reason for rejecting" required />
							<button type="submit" class="btn btn-danger xs">Reject</button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<p class="section-label">Paid &amp; rejected</p>
	{#if data.done.length === 0}
		<div class="card"><p class="muted">None yet.</p></div>
	{:else}
		<div class="card">
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th>Date</th><th>Pilot</th><th>Vendor</th><th>Lines</th><th class="num">Total €</th><th>Status</th><th>Paid</th></tr>
					</thead>
					<tbody>
						{#each data.done as r (r.id)}
							<tr>
								<td class="mono"><a href="/expenses/{r.id}">{r.date}</a></td>
								<td>{r.pilot_name}</td>
								<td>{r.vendor}</td>
								<td class="wrap">{r.linesText}</td>
								<td class="num">{r.total}</td>
								<td><span class="status {r.status}">{r.status}</span></td>
								<td class="faint wrap">{r.status === 'rejected' ? r.rejected_reason : r.paid}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<style>
	.receipt {
		display: grid;
		grid-template-columns: 64px 1fr 1fr auto;
		gap: 16px;
		align-items: center;
		padding: 14px 2px;
	}
	.receipt + .receipt {
		border-top: 1px solid var(--line);
	}
	.thumb {
		width: 64px;
		height: 64px;
		border-radius: 10px;
		background: var(--surface-2);
		overflow: hidden;
		display: block;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.who .list-title {
		color: inherit;
		text-decoration: none;
	}
	.lines {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 13px;
	}
	.end {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
	}
	.total {
		font-weight: 800;
		font-size: 16px;
	}
	.act {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.ref {
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		padding: 5px 8px;
		width: 9rem;
		font-size: 12px;
		font-family: var(--sans);
	}
	@media (max-width: 899px) {
		.receipt {
			grid-template-columns: 56px 1fr;
		}
		.lines {
			grid-column: 2;
		}
		.end {
			grid-column: 1 / -1;
			align-items: stretch;
		}
		.act {
			justify-content: flex-end;
		}
		.total {
			text-align: right;
		}
	}
</style>
