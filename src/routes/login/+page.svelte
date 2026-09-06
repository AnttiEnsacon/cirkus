<script lang="ts">
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Log in — Cirkus</title>
</svelte:head>

<main class="auth">
	<h1>Cirkus</h1>
	<p class="sub">KML Aviation Oy</p>

	<form method="POST">
		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}
		<label>
			Email
			<input name="email" type="email" value={form?.email ?? ''} required />
		</label>
		<label>
			Password
			<input name="password" type="password" required />
		</label>
		<button type="submit">Log in</button>
	</form>
	<p><a href="/register">New here? Register</a></p>
</main>

<style>
	.auth {
		max-width: 22rem;
		margin: 4rem auto;
		font-family: system-ui, sans-serif;
	}
	.sub {
		margin-top: -0.75rem;
		color: #55585c;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.9rem;
	}
	input {
		padding: 0.5rem;
		font-size: 1rem;
	}
	button {
		padding: 0.6rem;
		font-size: 1rem;
		cursor: pointer;
	}
	.error {
		color: #b3261e;
	}
</style>
