<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} — Cirkus</title>
</svelte:head>

<main class="err">
	<div class="card stack">
		<p class="eyebrow">{page.status}</p>
		<h1>{page.status === 404 ? 'Page not found' : page.status === 403 ? 'Not allowed' : 'Something went wrong'}</h1>
		{#if page.error?.message}<p class="muted">{page.error.message}</p>{/if}
		<a href="/home" class="btn btn-secondary">Back to Home</a>
	</div>
</main>

<style>
	.err {
		max-width: 24rem;
		margin: 15vh auto 0;
		padding: 0 20px;
	}
	.btn {
		align-self: flex-start;
	}
</style>
