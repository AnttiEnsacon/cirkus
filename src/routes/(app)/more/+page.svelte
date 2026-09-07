<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>More — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="card row">
		<span class="avatar">{data.user.name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}</span>
		<div class="list-main">
			<div class="list-title">{data.user.name}</div>
			<div class="list-sub">{data.user.email} · {data.user.role}</div>
		</div>
	</div>

	<p class="section-label">Billing</p>
	<div class="card tight">
		<a href="/invoices" class="list-item link">
			<span class="list-icon teal"><Icon name="receipt" /></span>
			<span class="list-main"><span class="list-title">Invoices</span></span>
			<Icon name="chevron" />
		</a>
	</div>

	{#if data.user.role === 'admin'}
		<p class="section-label">Admin</p>
		<div class="card tight">
			<a href="/manage/approvals" class="list-item link">
				<span class="list-icon"><Icon name="shield" /></span>
				<span class="list-main"><span class="list-title">Approvals</span></span>
				<Icon name="chevron" />
			</a>
			<a href="/manage/flights" class="list-item link">
				<span class="list-icon"><Icon name="check" /></span>
				<span class="list-main"><span class="list-title">Flights</span></span>
				<Icon name="chevron" />
			</a>
			<a href="/manage/invoices" class="list-item link">
				<span class="list-icon"><Icon name="euro" /></span>
				<span class="list-main"><span class="list-title">Billing</span></span>
				<Icon name="chevron" />
			</a>
			<a href="/manage/fleet" class="list-item link">
				<span class="list-icon"><Icon name="plane" /></span>
				<span class="list-main"><span class="list-title">Fleet</span></span>
				<Icon name="chevron" />
			</a>
			<a href="/manage/flight-types" class="list-item link">
				<span class="list-icon"><Icon name="list" /></span>
				<span class="list-main"><span class="list-title">Flight types</span></span>
				<Icon name="chevron" />
			</a>
			<a href="/manage/accounts" class="list-item link">
				<span class="list-icon"><Icon name="users" /></span>
				<span class="list-main"><span class="list-title">Accounts</span></span>
				<Icon name="chevron" />
			</a>
		</div>
	{/if}

	<form method="POST" action="/logout">
		<button type="submit" class="btn btn-secondary block"><Icon name="logout" size={18} /> Log out</button>
	</form>
</div>

<style>
	.link {
		text-decoration: none;
		color: inherit;
	}
	.list-main {
		display: flex;
		flex-direction: column;
	}
</style>
