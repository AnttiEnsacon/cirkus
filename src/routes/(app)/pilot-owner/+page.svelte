<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Pilot-owner maintenance — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Pilot-owner maintenance</h1>
		{#if data.eligible.length > 0}<a href="/pilot-owner/new" class="btn sm"><Icon name="wrench" size={16} /> New release</a>{/if}
	</div>

	{#if data.released}<p class="alert notice">Released to service. The record is frozen and the due list counts from it.</p>{/if}

	{#if data.eligible.length === 0}
		<div class="card stack">
			<p class="muted">
				{#if !data.ownsAny}Pilot-owner releases are for co-owners: your account is not listed as an owner of any aircraft. An admin adds owners under Fleet.
				{:else if !data.licence}You are a co-owner, but there is no licence number on your account. An admin adds it under Accounts; the release is signed with it.
				{:else}Your aircraft are not tracked in Airworthiness yet.{/if}
			</p>
		</div>
	{/if}

	<p class="section-label">My releases</p>
	{#if data.releases.length === 0}
		<div class="card"><p class="muted">No pilot-owner releases yet.</p></div>
	{:else}
		<div class="card tight">
			{#each data.releases as r (r.id)}
				<div class="list-item">
					<span class="list-main">
						<span class="list-title"><span class="tailnum">{r.tail}</span> · {r.title}</span>
						<span class="list-sub">{r.on} · {r.readings}{r.notes ? ` · ${r.notes}` : ''} · <span class="mono">{r.hash}</span></span>
					</span>
					<span class="list-end"><span class="status released">Released</span></span>
				</div>
			{/each}
		</div>
	{/if}
	<p class="hint">Part-ML Appendix II: the tasks the programme marks as pilot-owner work — oil, greasing, bulbs, and the like. Everything else goes through the maintenance organisation.</p>
</div>
