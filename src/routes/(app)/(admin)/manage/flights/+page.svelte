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

	{#if data.entries.length === 0}
		<div class="card"><p class="muted">No flights logged yet.</p></div>
	{:else}
		<div class="card">
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th>Date · UTC</th><th>Pilot</th><th>Flight</th><th class="num">Billed hrs</th><th>Details</th><th>Status</th><th></th></tr>
					</thead>
					<tbody>
						{#each data.entries as e (e.id)}
							<tr>
								<td class="mono">{e.date}<span class="sub">{e.blockOff} – {e.blockOn}</span></td>
								<td>{e.pic_name}{#if e.second}<span class="sub" style="font-family:var(--sans)">+ {e.second}</span>{/if}</td>
								<td><span class="tailnum">{e.tail_number}</span><span class="sub">{e.route}</span></td>
								<td class="num">{e.hours}<span class="sub">{e.billing}</span><span class="sub">block {e.blockHours}</span></td>
								<td class="wrap">{e.flight_type}<span class="sub">POB {e.pob} · ldg {e.landings}{e.fuel !== '' ? ` · fuel ${e.fuel} L` : ''}{e.oil !== '' ? ` · oil ${e.oil} L` : ''}</span>{#if e.remarks}<span class="sub" style="font-family:var(--sans)">{e.remarks}</span>{/if}</td>
								<td><span class="status {e.status}">{e.status}</span></td>
								<td class="actions">
									{#if e.canEdit}
										<a href="/log/{e.id}" class="btn btn-secondary xs">Edit</a>
										<form method="POST" action="?/delete"><input type="hidden" name="id" value={e.id} /><button type="submit" class="btn btn-danger xs">Delete</button></form>
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
