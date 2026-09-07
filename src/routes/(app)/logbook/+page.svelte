<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>My logbook — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>My logbook</h1>
		<a href="/log" class="btn sm"><Icon name="pencil" size={16} /> Log a flight</a>
	</div>

	{#if data.saved}<p class="alert notice">Flight saved.</p>{/if}
	{#if form?.error}<p class="alert error">{form.error}</p>{/if}

	<div class="card stats3">
		<div class="stat"><div class="n">{data.totals.total}</div><div class="l">Total hrs</div></div>
		<div class="stat"><div class="n">{data.totals.pic}</div><div class="l">PIC hrs</div></div>
		<div class="stat"><div class="n">{data.totals.month}</div><div class="l">This month</div></div>
	</div>

	{#if data.entries.length === 0}
		<div class="card"><p class="muted">No flights logged yet.</p></div>
	{:else}
		<!-- phone: list -->
		<div class="card tight only-phone">
			{#each data.entries as e (e.id)}
				<div class="list-item">
					<span class="list-icon" class:teal={e.role === 'PIC'}><Icon name="plane" size={17} /></span>
					<span class="list-main">
						<span class="list-title"><span class="tailnum">{e.tail_number}</span> · <span class="tailnum">{e.route}</span></span>
						<span class="list-sub">{e.date} · {e.hours} h · Tacho {e.tacho} · {e.flight_type}</span>
					</span>
					<span class="list-end">
						<span class="chip" class:teal={e.role === 'PIC'} class:amber={e.role !== 'PIC'}>{e.role}</span>
					</span>
				</div>
			{/each}
		</div>
		<!-- laptop: table -->
		<div class="card only-desk">
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th>Date · UTC</th><th>Flight</th><th class="num">Hrs</th><th>Details</th><th>Role</th><th>Crew</th><th>Status</th><th></th></tr>
					</thead>
					<tbody>
						{#each data.entries as e (e.id)}
							<tr>
								<td class="mono">{e.date}<span class="sub">{e.blockOff} – {e.blockOn}</span></td>
								<td><span class="tailnum">{e.tail_number}</span><span class="sub">{e.route}</span></td>
								<td class="num">{e.hours}<span class="sub">{e.tacho}</span></td>
								<td>{e.flight_type}<span class="sub">ldg {e.landings} · POB {e.pob}</span></td>
								<td><span class="chip" class:teal={e.role === 'PIC'} class:amber={e.role !== 'PIC'}>{e.role}</span></td>
								<td>{e.role === 'PIC' ? (e.second_name ?? '') : e.pic_name}</td>
								<td><span class="status {e.status}">{e.status}</span></td>
								<td class="actions">
									{#if e.canDelete}
										<form method="POST" action="?/delete">
											<input type="hidden" name="id" value={e.id} />
											<button type="submit" class="btn btn-danger xs">Delete</button>
										</form>
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
