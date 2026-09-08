<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();

	const labels: Record<string, string> = {
		'': 'All',
		auth: 'Sign-ins',
		flights: 'Flights',
		bookings: 'Bookings',
		billing: 'Billing',
		expenses: 'Expenses',
		accounts: 'Accounts',
		lists: 'Fleet & lists'
	};
	const q = (over: Record<string, string | number>) => {
		const p = new URLSearchParams();
		const f = { ...data.filters, ...over };
		for (const [k, v] of Object.entries(f)) if (v && !(k === 'page' && Number(v) <= 1)) p.set(k, String(v));
		const s = p.toString();
		return s ? `?${s}` : '?';
	};
</script>

<svelte:head>
	<title>Activity — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Activity</h1>
	</div>

	<div class="chiprow">
		{#each ['', ...data.kinds] as k (k)}
			<a href={q({ kind: k, page: 1 })} class="chip" class:on={data.filters.kind === k}>{labels[k]}</a>
		{/each}
	</div>

	<form method="GET" class="card filters">
		<input type="hidden" name="kind" value={data.filters.kind} />
		<label class="field">
			<span>Person</span>
			<select name="person">
				<option value="">Everyone</option>
				{#each data.people as p (p.id)}
					<option value={p.id} selected={data.filters.person === p.id}>{p.name}</option>
				{/each}
			</select>
		</label>
		<label class="field"><span>From</span><input name="from" type="date" value={data.filters.from} /></label>
		<label class="field"><span>To</span><input name="to" type="date" value={data.filters.to} /></label>
		<div class="field"><span>&nbsp;</span><button type="submit" class="btn btn-secondary sm">Show</button></div>
	</form>

	{#if data.entries.length === 0}
		<div class="card"><p class="muted">Nothing here.</p></div>
	{:else}
		<div class="card tight">
			{#each data.entries as e (e.id)}
				<div class="list-item entry" class:failed={!e.ok}>
					<span class="mono when">{e.when}</span>
					<span class="list-main">
						<span class="list-title">{e.who || '—'}</span>
						<span class="list-sub what">{e.text}</span>
					</span>
					<span class="list-end">
						{#if !e.ok}<span class="status rejected">refused</span>{/if}
						<span class="mono ip" title={e.agent}>{e.ip}</span>
					</span>
				</div>
			{/each}
		</div>
		<div class="row between">
			{#if data.filters.page > 1}<a href={q({ page: data.filters.page - 1 })} class="btn btn-secondary sm">Newer</a>{:else}<span></span>{/if}
			{#if data.hasMore}<a href={q({ page: data.filters.page + 1 })} class="btn btn-secondary sm">Older</a>{/if}
		</div>
	{/if}
</div>

<style>
	.filters {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr auto;
		gap: 10px;
		align-items: end;
	}
	.when {
		font-size: 12px;
		color: var(--ink-soft);
		flex: 0 0 8.5rem;
		white-space: nowrap;
	}
	.what {
		color: var(--ink);
		font-size: 13px;
	}
	.ip {
		font-size: 11.5px;
		color: var(--ink-faint);
	}
	.entry.failed .what {
		color: var(--danger);
	}
	@media (max-width: 899px) {
		.filters {
			grid-template-columns: 1fr 1fr;
		}
		.entry {
			flex-wrap: wrap;
		}
		.when {
			flex-basis: 100%;
		}
	}
</style>
