<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import type { LayoutProps } from './$types';
	let { data, children }: LayoutProps = $props();

	const pilotNav = [
		{ href: '/home', label: 'Home', icon: 'home' },
		{ href: '/book', label: 'Book', icon: 'calendar' },
		{ href: '/log', label: 'Log', icon: 'pencil' },
		{ href: '/logbook', label: 'Logbook', icon: 'list' },
		{ href: '/invoices', label: 'Invoices', icon: 'receipt' },
		{ href: '/expenses', label: 'Expenses', icon: 'wallet' }
	];
	const adminNav = [
		{ href: '/manage/approvals', label: 'Approvals', icon: 'shield' },
		{ href: '/manage/flights', label: 'Flights', icon: 'check' },
		{ href: '/manage/invoices', label: 'Billing', icon: 'euro' },
		{ href: '/manage/expenses', label: 'Expenses', icon: 'wallet' },
		{ href: '/manage/fleet', label: 'Fleet', icon: 'plane' },
		{ href: '/manage/flight-types', label: 'Flight types', icon: 'list' },
		{ href: '/manage/expense-categories', label: 'Expense categories', icon: 'list' },
		{ href: '/manage/accounts', label: 'Accounts', icon: 'users' },
		{ href: '/manage/activity', label: 'Activity', icon: 'clock' }
	];
	const tabs = [...pilotNav.slice(0, 4), { href: '/more', label: 'More', icon: 'more' }];

	const path = $derived(page.url.pathname);
	const isActive = (href: string) => path === href || path.startsWith(href + '/');
	const onAdminPage = $derived(path.startsWith('/manage'));
	const moreActive = $derived(onAdminPage || path.startsWith('/invoices') || path.startsWith('/expenses') || path === '/more');
	const initials = $derived(
		data.user.name
			.split(' ')
			.map((s) => s[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);
</script>

<div class="shell">
	<aside class="sidebar" class:dark={onAdminPage}>
		<a class="brand" href="/home">
			<img src="/cirkus-icon.png" alt="" />
			<img class="wordmark" src="/cirkus-wordmark.png" alt="Cirkus" />
		</a>
		<nav class="nav">
			{#each pilotNav as item (item.href)}
				<a href={item.href} class="nav-item" class:active={isActive(item.href)}>
					<Icon name={item.icon} size={18} />{item.label}
				</a>
			{/each}
			{#if data.user.role === 'admin'}
				<p class="nav-label">Admin</p>
				{#each adminNav as item (item.href)}
					<a href={item.href} class="nav-item" class:active={isActive(item.href)}>
						<Icon name={item.icon} size={18} />{item.label}
					</a>
				{/each}
			{/if}
		</nav>
		<div class="foot">
			<span class="avatar">{initials}</span>
			<a class="who" href="/password" title="Change password">
				<span class="name">{data.user.name}</span>
				<span class="role">{data.user.role}</span>
			</a>
			<form method="POST" action="/logout">
				<button type="submit" class="iconbtn" title="Log out" aria-label="Log out"><Icon name="logout" size={18} /></button>
			</form>
		</div>
	</aside>

	<div class="main">
		<header class="topbar">
			<a class="brand" href="/home"><img src="/cirkus-icon.png" alt="" /><img class="wordmark" src="/cirkus-wordmark.png" alt="Cirkus" /></a>
			<a class="avatar" href="/more" aria-label="More">{initials}</a>
		</header>

		<section class="content">
			{@render children()}
		</section>

		<nav class="tabbar">
			{#each tabs as t (t.href)}
				<a href={t.href} class="tab" class:active={t.href === '/more' ? moreActive : isActive(t.href)}>
					<Icon name={t.icon} size={21} />
					<span>{t.label}</span>
				</a>
			{/each}
		</nav>
	</div>
</div>

<style>
	.shell {
		min-height: 100dvh;
		display: flex;
	}
	.main {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.content {
		flex: 1 1 auto;
		padding: 16px 16px calc(84px + env(safe-area-inset-bottom));
	}

	/* brand */
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		color: inherit;
	}
	.brand img {
		width: 24px;
		height: auto;
		display: block;
	}
	.brand .wordmark {
		width: auto;
		height: 11px;
	}

	/* phone top bar */
	.topbar {
		background: var(--surface);
		border-bottom: 1px solid var(--line);
		padding: 14px 16px 12px;
		display: flex;
		align-items: center;
		gap: 12px;
		position: sticky;
		top: 0;
		z-index: 5;
	}
	.topbar .brand {
		flex: 1 1 auto;
	}
	.topbar .avatar {
		text-decoration: none;
	}

	/* phone bottom tab bar */
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		background: var(--surface);
		border-top: 1px solid var(--line);
		padding: 9px 6px calc(10px + env(safe-area-inset-bottom));
		z-index: 5;
	}
	.tab {
		flex: 1 1 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		color: var(--ink-faint);
		font-size: 10px;
		font-weight: 700;
		text-decoration: none;
	}
	.tab.active {
		color: var(--teal);
	}

	/* laptop sidebar — hidden on phones */
	.sidebar {
		display: none;
	}

	@media (min-width: 900px) {
		.topbar,
		.tabbar {
			display: none;
		}
		.content {
			padding: 28px 40px 40px;
		}
		.sidebar {
			display: flex;
			flex-direction: column;
			width: 232px;
			flex: 0 0 auto;
			background: var(--surface);
			border-right: 1px solid var(--line);
			padding: 22px 14px 16px;
			position: sticky;
			top: 0;
			height: 100dvh;
		}
		.sidebar .brand {
			padding: 2px 8px 26px;
		}
		.nav {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		.nav-label {
			font-family: var(--mono);
			font-size: 10px;
			letter-spacing: 0.09em;
			text-transform: uppercase;
			color: var(--ink-faint);
			font-weight: 700;
			padding: 16px 10px 6px;
		}
		.nav-item {
			display: flex;
			align-items: center;
			gap: 11px;
			padding: 9px 10px;
			border-radius: 9px;
			font-weight: 600;
			font-size: 13.5px;
			color: var(--ink-soft);
			text-decoration: none;
		}
		.nav-item.active {
			background: var(--ink);
			color: #fff;
		}
		.foot {
			margin-top: auto;
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 14px 4px 2px;
			border-top: 1px solid var(--line);
		}
		.who {
			display: flex;
			flex-direction: column;
			min-width: 0;
			flex: 1 1 auto;
			text-decoration: none;
			color: inherit;
		}
		.name {
			font-weight: 700;
			font-size: 12.5px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.role {
			font-size: 11px;
			color: var(--ink-faint);
		}
		.iconbtn {
			width: 34px;
			height: 34px;
			border-radius: 10px;
			border: 1px solid var(--line);
			background: var(--surface);
			display: flex;
			align-items: center;
			justify-content: center;
			color: var(--ink);
			cursor: pointer;
		}

		/* dark variant on admin pages, as in the mock-up */
		.sidebar.dark {
			background: var(--navy);
			border-right-color: var(--navy-2);
			color: #e8ecef;
		}
		.sidebar.dark .brand img {
			filter: invert(1);
		}
		.sidebar.dark .brand .wordmark {
			filter: invert(1);
		}
		.sidebar.dark .nav-label {
			color: #767c86;
		}
		.sidebar.dark .nav-item {
			color: #aeb3ba;
		}
		.sidebar.dark .nav-item.active {
			background: var(--teal);
			color: #fff;
		}
		.sidebar.dark .foot {
			border-top-color: var(--navy-2);
		}
		.sidebar.dark .role {
			color: #8b919b;
		}
		.sidebar.dark .iconbtn {
			background: var(--navy-2);
			border-color: #3a3a3c;
			color: #e8ecef;
		}
	}

	@media print {
		.sidebar,
		.topbar,
		.tabbar {
			display: none !important;
		}
		.content {
			padding: 0;
		}
	}
</style>
