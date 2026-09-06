<script lang="ts">
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Register — Cirkus</title>
</svelte:head>

<main class="auth">
	<h1>Create your Cirkus account</h1>

	{#if form?.success}
		<p class="notice">
			Thanks — your account was created. An admin needs to approve it before you can log in;
			you'll be able to sign in once that happens.
		</p>
	{:else}
		<form method="POST">
			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}
			<label>
				Name
				<input name="name" type="text" value={form?.name ?? ''} required />
			</label>
			<label>
				Email
				<input name="email" type="email" value={form?.email ?? ''} required />
			</label>
			<label>
				Password
				<input name="password" type="password" minlength="8" required />
			</label>
			<button type="submit">Register</button>
		</form>
		<p><a href="/login">Already have an account? Log in</a></p>
	{/if}
</main>

<style>
	.auth {
		max-width: 22rem;
		margin: 4rem auto;
		font-family: system-ui, sans-serif;
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
	.notice {
		color: #1863dc;
	}
</style>
