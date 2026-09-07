<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Flights — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Flights</h1>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}

	{#snippet flightTable(list: typeof data.pending, pending: boolean)}
		<div class="card">
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th>Date · UTC</th><th>Pilot</th><th>Flight</th><th class="num">Hrs</th><th>Details</th><th>Status</th><th></th></tr>
					</thead>
					<tbody>
						{#each list as e (e.id)}
							<tr>
								<td class="mono">{e.date}<span class="sub">{e.blockOff} – {e.blockOn}</span></td>
								<td>{e.pic_name}{#if e.second}<span class="sub" style="font-family:var(--sans)">+ {e.second}</span>{/if}</td>
								<td><span class="tailnum">{e.tail_number}</span><span class="sub">{e.route}</span></td>
								<td class="num">{e.hours}<span class="sub">{e.tacho}</span></td>
								<td class="wrap">{e.flight_type}<span class="sub">POB {e.pob} · ldg {e.landings}{e.fuel !== '' ? ` · fuel ${e.fuel} L` : ''}{e.oil !== '' ? ` · oil ${e.oil} L` : ''}</span>{#if e.remarks}<span class="sub" style="font-family:var(--sans)">{e.remarks}</span>{/if}</td>
								<td><span class="status {e.status}">{e.status}</span>{#if e.approved}<span class="sub" style="font-family:var(--sans)">{e.approved}</span>{/if}</td>
								<td class="actions">
									{#if pending}
										<form method="POST" action="?/approve"><input type="hidden" name="id" value={e.id} /><button type="submit" class="btn btn-teal xs">Approve</button></form>
									{:else if e.status === 'approved'}
										<form method="POST" action="?/unapprove"><input type="hidden" name="id" value={e.id} /><button type="submit" class="btn btn-secondary xs">Un-approve</button></form>
									{/if}
									{#if e.status !== 'billed'}
										<form method="POST" action="?/delete"><input type="hidden" name="id" value={e.id} /><button type="submit" class="btn btn-danger xs">Delete</button></form>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/snippet}

	<p class="section-label">Awaiting approval · {data.pending.length}</p>
	{#if data.pending.length === 0}
		<div class="card"><p class="muted">Nothing waiting.</p></div>
	{:else}
		{@render flightTable(data.pending, true)}
	{/if}

	<p class="section-label">Approved &amp; billed</p>
	{#if data.others.length === 0}
		<div class="card"><p class="muted">None yet.</p></div>
	{:else}
		{@render flightTable(data.others, false)}
	{/if}
</div>
