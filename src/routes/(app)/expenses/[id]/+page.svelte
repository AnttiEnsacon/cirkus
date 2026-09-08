<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const r = $derived(data.receipt);
</script>

<svelte:head>
	<title>{r.vendor} — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<div class="row">
			<a href={r.mine ? '/expenses' : '/manage/expenses'} class="btn btn-secondary xs" aria-label="Back"><Icon name="back" size={15} /></a>
			<h1>{r.vendor}</h1>
		</div>
		<span class="status {r.status}">{r.status}</span>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if r.rejected_reason}<p class="alert error">Rejected: {r.rejected_reason}</p>{/if}
	{#if r.paid}<p class="alert notice">Paid back {r.paid}</p>{/if}

	<div class="cols c21">
		<div class="stack">
			{#each data.images as img (img.id)}
				<a href={img.url} target="_blank" rel="noopener" class="photo"><img src={img.url} alt="Receipt from {r.vendor}" /></a>
			{/each}
		</div>
		<div class="stack">
			<div class="card stack details">
				{#if !r.mine}<div class="row between"><span class="faint">Pilot</span><span>{r.pilot_name}</span></div>{/if}
				<div class="row between"><span class="faint">Receipt date</span><span class="mono">{r.date}</span></div>
				<div class="row between"><span class="faint">Sent</span><span class="mono">{r.sent}</span></div>
				<hr class="hr" />
				{#each data.lines as l (l.id)}
					<div class="row between"><span>{l.code} · {l.label}{l.description ? ` — ${l.description}` : ''}</span><span class="mono">{l.amount}</span></div>
				{/each}
				<div class="row between total"><span>Total</span><span class="mono">€{r.total}</span></div>
				{#if r.notes}<p class="faint">{r.notes}</p>{/if}
			</div>
			{#if r.canEdit}
				<div class="row actions">
					<a href="/expenses/{r.id}/edit" class="btn btn-secondary sm"><Icon name="pencil" size={15} /> Edit</a>
					<form method="POST" action="?/delete"><button type="submit" class="btn btn-danger sm"><Icon name="trash" size={15} /> Delete</button></form>
				</div>
				<p class="hint">Editable until an admin pays it back.</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.photo {
		display: block;
		background: var(--surface-2);
		border-radius: 12px;
		overflow: hidden;
	}
	.photo img {
		display: block;
		width: 100%;
		height: auto;
	}
	.total {
		border-top: 2px solid var(--ink);
		padding-top: 8px;
		font-weight: 800;
	}
	.actions > * {
		flex: 1 1 0;
	}
	.actions form {
		display: flex;
	}
	.actions .btn {
		width: 100%;
	}
</style>
