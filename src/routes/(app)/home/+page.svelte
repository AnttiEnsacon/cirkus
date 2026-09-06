<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Home — Cirkus</title>
</svelte:head>

<h1>Hello, {data.firstName}</h1>

{#if data.admin && (data.admin.pendingAccounts > 0 || data.admin.pendingFlights > 0 || Number(data.admin.unbilled) > 0)}
	<section class="attention">
		<h2>Needs your attention</h2>
		<ul>
			{#if data.admin.pendingAccounts > 0}
				<li><a href="/manage/approvals">{data.admin.pendingAccounts} account{data.admin.pendingAccounts === 1 ? '' : 's'} waiting for approval</a></li>
			{/if}
			{#if data.admin.pendingFlights > 0}
				<li><a href="/manage/flights">{data.admin.pendingFlights} flight{data.admin.pendingFlights === 1 ? '' : 's'} to approve</a></li>
			{/if}
			{#if Number(data.admin.unbilled) > 0}
				<li><a href="/manage/invoices">€{data.admin.unbilled} of approved flying not yet invoiced</a></li>
			{/if}
		</ul>
	</section>
{/if}

<div class="tiles">
	<a class="tile" href="/book">
		<span class="label">Next reservation</span>
		{#if data.nextReservation}
			<span class="value">{data.nextReservation.tail_number}</span>
			<span class="sub">{data.nextReservation.when}</span>
		{:else}
			<span class="value muted">None</span>
			<span class="sub">Book a slot →</span>
		{/if}
	</a>
	<a class="tile" href="/logbook">
		<span class="label">Hours this month</span>
		<span class="value mono">{data.hours.month}</span>
		<span class="sub">{data.hours.total} total</span>
	</a>
	<a class="tile" href="/invoices">
		<span class="label">Open balance</span>
		<span class="value mono">€{data.open.amount}</span>
		<span class="sub">{data.open.count === 0 ? 'Nothing due' : `${data.open.count} open invoice${data.open.count === 1 ? '' : 's'}`}</span>
	</a>
	<a class="tile" href="/log">
		<span class="label">Last flight</span>
		{#if data.lastFlight}
			<span class="value">{data.lastFlight.route}</span>
			<span class="sub">{data.lastFlight.date} · {data.lastFlight.tail_number} · {data.lastFlight.hours} h · {data.lastFlight.status}</span>
		{:else}
			<span class="value muted">None yet</span>
			<span class="sub">Log a flight →</span>
		{/if}
	</a>
</div>

<section>
	<h2>Coming up this week</h2>
	{#if data.upcoming.length === 0}
		<p class="muted">Nothing booked in the next 7 days.</p>
	{:else}
		<ul class="upcoming">
			{#each data.upcoming as r (r.id)}
				<li><span class="mono">{r.when}</span> · {r.tail_number} · {r.name}</li>
			{/each}
		</ul>
	{/if}
	<p class="hint">Reservation times are Helsinki local time. Logbook times are UTC.</p>
</section>

<style>
	.attention {
		border: 1px solid #1863dc;
		background: #e3ecfb;
		border-radius: 8px;
		padding: 0.6rem 1rem;
		margin-bottom: 1.2rem;
		max-width: 44rem;
	}
	.attention h2 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 0.3rem;
		color: #1863dc;
	}
	.attention ul {
		margin: 0;
		padding-left: 1.1rem;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 0.75rem;
		max-width: 60rem;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		border: 1px solid #dddee0;
		border-radius: 8px;
		padding: 0.8rem 1rem;
		text-decoration: none;
		color: inherit;
	}
	.tile:hover {
		border-color: #1863dc;
	}
	.label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #55585c;
	}
	.value {
		font-size: 1.35rem;
		font-weight: 700;
	}
	.sub {
		font-size: 0.85rem;
		color: #55585c;
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
	.muted {
		color: #8a8d90;
	}
	section {
		margin-top: 1.5rem;
	}
	section h2 {
		font-size: 1rem;
	}
	.upcoming {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.9rem;
	}
	.hint {
		color: #8a8d90;
		font-size: 0.8rem;
	}
</style>
