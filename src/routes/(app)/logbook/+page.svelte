<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>My logbook — Cirkus</title>
</svelte:head>

<h1>My logbook</h1>
<p class="hint">All times UTC. Hours are Hobbs-based.</p>

{#if data.saved}
	<p class="notice">Flight saved.</p>
{/if}
{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

<div class="totals">
	<div><span class="big">{data.totals.total}</span><span class="label">Total hrs</span></div>
	<div><span class="big">{data.totals.pic}</span><span class="label">PIC hrs</span></div>
	<div><span class="big">{data.totals.month}</span><span class="label">This month</span></div>
</div>

<p><a href="/log">Log a flight →</a></p>

{#if data.entries.length === 0}
	<p>No flights logged yet.</p>
{:else}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Date</th>
					<th>Aircraft</th>
					<th>Route</th>
					<th>Off / On</th>
					<th>Hobbs</th>
					<th>Hrs</th>
					<th>Ldg D/N</th>
					<th>Type</th>
					<th>Role</th>
					<th>Crew</th>
					<th>Status</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.entries as e (e.id)}
					<tr>
						<td class="mono">{e.date}</td>
						<td>{e.tail_number}</td>
						<td class="mono">{e.route}</td>
						<td class="mono">{e.blockOff} / {e.blockOn}</td>
						<td class="mono">{e.hobbs}</td>
						<td class="mono">{e.hours}</td>
						<td class="mono">{e.landings}</td>
						<td>{e.flight_type}</td>
						<td><span class="chip" class:pic={e.role === 'PIC'}>{e.role}</span></td>
						<td>{e.role === 'PIC' ? (e.second_name ?? '') : e.pic_name}</td>
						<td><span class="status {e.status}">{e.status}</span></td>
						<td>
							{#if e.canDelete}
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
{/if}

<style>
	.hint {
		color: #55585c;
		font-size: 0.85rem;
		margin-top: -0.5rem;
	}
	.totals {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		max-width: 28rem;
		border: 1px solid #dddee0;
		border-radius: 8px;
		margin: 1rem 0;
	}
	.totals > div {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.7rem 0;
	}
	.totals > div + div {
		border-left: 1px solid #dddee0;
	}
	.big {
		font-family: ui-monospace, monospace;
		font-weight: 700;
		font-size: 1.3rem;
	}
	.label {
		font-size: 0.75rem;
		color: #55585c;
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
		padding: 0.4rem 0.55rem;
		border-bottom: 1px solid #dddee0;
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
	.chip {
		border: 1px solid #c7c9cc;
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		font-size: 0.75rem;
	}
	.chip.pic {
		background: #e3ecfb;
		border-color: #1863dc;
		color: #1863dc;
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
		color: #1a1a1c;
		font-weight: 600;
	}
	button.danger {
		color: #b3261e;
		cursor: pointer;
		padding: 0.2rem 0.5rem;
	}
	.error {
		color: #b3261e;
	}
	.notice {
		color: #1863dc;
	}
</style>
