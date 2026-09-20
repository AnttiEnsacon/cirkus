<script lang="ts">
	// Page head for the /airworthiness/[tail] pages: back link, tail number,
	// and the section chips (Dashboard · Programme · Usage · Baseline).
	import Icon from '$lib/components/Icon.svelte';
	let {
		tail,
		subtitle,
		active,
		back = { href: '/airworthiness', label: 'Airworthiness' }
	}: { tail: string; subtitle: string; active: 'dashboard' | 'programme' | 'workorders' | 'components' | 'defects' | 'usage' | 'baseline'; back?: { href: string; label: string } } = $props();
	const tabs = [
		{ key: 'dashboard', path: '', label: 'Dashboard' },
		{ key: 'programme', path: '/programme', label: 'Programme' },
		{ key: 'workorders', path: '/work-orders', label: 'Work orders' },
		{ key: 'components', path: '/components', label: 'Components' },
		{ key: 'defects', path: '/defects', label: 'Defects' },
		{ key: 'usage', path: '/usage', label: 'Usage' },
		{ key: 'baseline', path: '/baseline', label: 'Baseline' }
	];
</script>

<div class="page-head">
	<div>
		<a class="back" href={back.href}><Icon name="back" size={14} /> {back.label}</a>
		<h1><span class="tailnum">{tail}</span> <span class="sub">· {subtitle}</span></h1>
	</div>
	<nav class="chiprow" aria-label="{tail} sections">
		{#each tabs as t (t.key)}
			<a href="/airworthiness/{tail}{t.path}" class="chip" class:on={t.key === active}>{t.label}</a>
		{/each}
	</nav>
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12.5px;
		color: var(--ink-faint);
		text-decoration: none;
	}
	.sub {
		font-weight: 600;
		font-size: 15px;
		color: var(--ink-soft);
	}
	.chip {
		text-decoration: none;
	}
</style>
