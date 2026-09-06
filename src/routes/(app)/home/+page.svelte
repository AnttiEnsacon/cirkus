<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const needsAttention = $derived(
		!!data.admin && (data.admin.pendingAccounts > 0 || data.admin.pendingFlights > 0 || Number(data.admin.unbilled) > 0)
	);
</script>

<svelte:head>
	<title>Home — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<div>
			<p class="eyebrow">KML Aviation Oy</p>
			<h1>Hello, {data.firstName}</h1>
		</div>
	</div>

	{#if data.admin && needsAttention}
		<div class="card teal stack">
			<p class="section-label" style="color:var(--teal)">Needs your attention</p>
			{#if data.admin.pendingAccounts > 0}
				<a href="/manage/approvals" class="row attn"><Icon name="shield" /><span>{data.admin.pendingAccounts} account{data.admin.pendingAccounts === 1 ? '' : 's'} waiting for approval</span><Icon name="chevron" /></a>
			{/if}
			{#if data.admin.pendingFlights > 0}
				<a href="/manage/flights" class="row attn"><Icon name="check" /><span>{data.admin.pendingFlights} flight{data.admin.pendingFlights === 1 ? '' : 's'} to approve</span><Icon name="chevron" /></a>
			{/if}
			{#if Number(data.admin.unbilled) > 0}
				<a href="/manage/invoices" class="row attn"><Icon name="euro" /><span>€{data.admin.unbilled} of approved flying not yet invoiced</span><Icon name="chevron" /></a>
			{/if}
		</div>
	{/if}

	<div class="grid-auto">
		<a class="card stat" href="/book">
			<div class="l">Next reservation</div>
			{#if data.nextReservation}
				<div class="n tailnum">{data.nextReservation.tail_number}</div>
				<div class="faint">{data.nextReservation.when}</div>
			{:else}
				<div class="n muted">—</div>
				<div class="faint">Book a slot →</div>
			{/if}
		</a>
		<a class="card stat" href="/logbook">
			<div class="l">Hours this month</div>
			<div class="n">{data.hours.month}</div>
			<div class="faint">{data.hours.total} total</div>
		</a>
		<a class="card stat" href="/invoices">
			<div class="l">Open balance</div>
			<div class="n">€{data.open.amount}</div>
			<div class="faint">{data.open.count === 0 ? 'Nothing due' : `${data.open.count} open invoice${data.open.count === 1 ? '' : 's'}`}</div>
		</a>
		<a class="card stat" href="/log">
			<div class="l">Last flight</div>
			{#if data.lastFlight}
				<div class="n tailnum" style="font-size:19px">{data.lastFlight.route}</div>
				<div class="faint">{data.lastFlight.date} · {data.lastFlight.tail_number} · {data.lastFlight.hours} h · <span class="status {data.lastFlight.status}">{data.lastFlight.status}</span></div>
			{:else}
				<div class="n muted">—</div>
				<div class="faint">Log a flight →</div>
			{/if}
		</a>
	</div>

	<div class="grid-auto quick">
		<a href="/book" class="btn btn-secondary"><Icon name="calendar" size={18} /> Book</a>
		<a href="/log" class="btn btn-secondary"><Icon name="pencil" size={18} /> Log a flight</a>
	</div>

	<p class="section-label">Coming up this week</p>
	<div class="card tight">
		{#if data.upcoming.length === 0}
			<p class="muted" style="padding:10px 2px">Nothing booked in the next 7 days.</p>
		{:else}
			{#each data.upcoming as r (r.id)}
				<div class="list-item">
					<span class="list-icon teal"><Icon name="plane" size={17} /></span>
					<span class="list-main">
						<span class="list-title"><span class="tailnum">{r.tail_number}</span> · {r.name}</span>
						<span class="list-sub">{r.when}</span>
					</span>
				</div>
			{/each}
		{/if}
	</div>
	<p class="hint">Reservation times are Helsinki local time. Logbook times are UTC.</p>
</div>

<style>
	.attn {
		color: var(--ink);
		text-decoration: none;
		font-weight: 600;
		font-size: 13.5px;
	}
	.attn span {
		flex: 1 1 auto;
	}
	.stat .n.muted {
		color: var(--ink-faint);
	}
	.quick .btn {
		width: 100%;
	}
	.list-main {
		display: flex;
		flex-direction: column;
	}
</style>
