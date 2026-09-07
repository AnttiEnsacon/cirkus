<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Approvals — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Pending approvals</h1>
	</div>

	{#if data.pending.length === 0}
		<div class="card"><p class="muted">No accounts are waiting for approval.</p></div>
	{:else}
		<div class="card tight">
			{#each data.pending as person (person.id)}
				<div class="list-item">
					<span class="list-icon"><Icon name="users" size={17} /></span>
					<span class="list-main">
						<span class="list-title">{person.name}</span>
						<span class="list-sub">{person.email} · requested {new Date(person.created_at).toLocaleDateString('en-GB')}</span>
					</span>
					<span class="list-end">
						<form method="POST" action="?/approve">
							<input type="hidden" name="id" value={person.id} />
							<button type="submit" class="btn btn-teal xs">Approve</button>
						</form>
						<form method="POST" action="?/reject">
							<input type="hidden" name="id" value={person.id} />
							<button type="submit" class="btn btn-danger xs">Reject</button>
						</form>
					</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.list-main {
		display: flex;
		flex-direction: column;
	}
</style>
