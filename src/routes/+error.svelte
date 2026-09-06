<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} — Cirkus</title>
</svelte:head>

<main class="err">
	<p class="code">{page.status}</p>
	<h1>{page.status === 404 ? 'Page not found' : page.status === 403 ? 'Not allowed' : 'Something went wrong'}</h1>
	<p>{page.error?.message ?? ''}</p>
	<p><a href="/home">Back to Home</a></p>
</main>

<style>
	.err {
		max-width: 28rem;
		margin: 4rem auto;
		font-family: system-ui, sans-serif;
		text-align: center;
	}
	.code {
		font-family: ui-monospace, monospace;
		color: #8a8d90;
		margin: 0;
	}
	h1 {
		margin: 0.2rem 0 0.6rem;
	}
</style>
