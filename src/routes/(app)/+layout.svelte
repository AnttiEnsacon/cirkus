<script lang="ts">
	import type { LayoutProps } from './$types';
	let { data, children }: LayoutProps = $props();
</script>

<div class="shell">
	<header>
		<span class="brand">Cirkus</span>
		<nav>
			<a href="/home">Home</a>
			{#if data.user.role === 'admin'}
				<a href="/manage/approvals">Approvals</a>
				<a href="/manage/fleet">Fleet</a>
				<a href="/manage/accounts">Accounts</a>
			{/if}
		</nav>
		<form method="POST" action="/logout">
			<span class="who">{data.user.name}</span>
			<button type="submit">Log out</button>
		</form>
	</header>
	<section class="content">
		{@render children()}
	</section>
</div>

<style>
	.shell {
		font-family: system-ui, sans-serif;
	}
	header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid #dddee0;
	}
	.brand {
		font-weight: 700;
	}
	nav {
		display: flex;
		gap: 1rem;
		flex: 1;
	}
	nav a {
		color: inherit;
		text-decoration: none;
	}
	header form {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.who {
		color: #55585c;
		font-size: 0.9rem;
	}
	.content {
		padding: 1.5rem;
	}
</style>
