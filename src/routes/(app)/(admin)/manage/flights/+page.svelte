<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Flights — Cirkus</title>
</svelte:head>

<h1>Flights</h1>
<p class="hint">All times UTC. Approved flights are what invoicing picks up.</p>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

{#snippet flightTable(list: typeof data.pending, pending: boolean)}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Date</th>
					<th>Pilot</th>
					<th>Aircraft</th>
					<th>Route</th>
					<th>Off / On</th>
					<th>Hobbs</th>
					<th>Hrs</th>
					<th>Ldg D/N</th>
					<th>Fuel/Oil</th>
					<th>Type</th>
					<th>Second pilot</th>
					<th>Remarks</th>
					<th>Status</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each list as e (e.id)}
					<tr>
						<td class="mono">{e.date}</td>
						<td>{e.pic_name}</td>
						<td>{e.tail_number}</td>
						<td class="mono">{e.route}</td>
						<td class="mono">{e.blockOff} / {e.blockOn}</td>
						<td class="mono">{e.hobbs}</td>
						<td class="mono">{e.hours}</td>
						<td class="mono">{e.landings}</td>
						<td class="mono">{e.fuel}{e.fuel !== '' || e.oil !== '' ? ' / ' : ''}{e.oil}</td>
						<td>{e.flight_type}</td>
						<td>{e.second}</td>
						<td class="remarks">{e.remarks}</td>
						<td><span class="status {e.status}">{e.status}</span>{#if e.approved}<br /><small>{e.approved}</small>{/if}</td>
						<td class="actions">
							{#if pending}
								<form method="POST" action="?/approve">
									<input type="hidden" name="id" value={e.id} />
									<button type="submit">Approve</button>
								</form>
							{:else if e.status === 'approved'}
								<form method="POST" action="?/unapprove">
									<input type="hidden" name="id" value={e.id} />
									<button type="submit">Un-approve</button>
								</form>
							{/if}
							{#if e.status !== 'billed'}
								<form method="POST" action="?/delete">
									<input type="hidden" name="id" value={e.id} />
									<button type="submit" class="danger">Delete</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

<h2>Awaiting approval ({data.pending.length})</h2>
{#if data.pending.length === 0}
	<p>Nothing waiting.</p>
{:else}
	{@render flightTable(data.pending, true)}
{/if}

<h2>Approved & billed</h2>
{#if data.others.length === 0}
	<p>None yet.</p>
{:else}
	{@render flightTable(data.others, false)}
{/if}

<style>
	.hint {
		color: #55585c;
		font-size: 0.85rem;
		margin-top: -0.5rem;
	}
	h2 {
		margin-top: 1.5rem;
		font-size: 1.1rem;
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid #dddee0;
		font-size: 0.82rem;
		white-space: nowrap;
		vertical-align: top;
	}
	td.remarks {
		white-space: normal;
		max-width: 16rem;
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
	.actions {
		display: flex;
		gap: 0.4rem;
	}
	button {
		cursor: pointer;
		padding: 0.25rem 0.6rem;
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
	.status.approved {
		color: #1863dc;
	}
	.status.billed {
		font-weight: 600;
		color: #1a1a1c;
	}
	small {
		color: #8a8d90;
	}
	.error {
		color: #b3261e;
	}
</style>
