<script lang="ts">
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Log in — Cirkus</title>
</svelte:head>

<main class="auth">
	<div class="lockup">
		<img src="/cirkus-logo.png" alt="Cirkus" />
		<p class="eyebrow">KML Aviation Oy</p>
	</div>

	<form method="POST" class="card stack">
		{#if form?.error}
			<p class="alert error">{form.error}</p>
		{/if}
		<label class="field">
			<span>Email</span>
			<input name="email" type="email" value={form?.email ?? ''} required autocomplete="email" />
		</label>
		<label class="field">
			<span>Password</span>
			<input name="password" type="password" required autocomplete="current-password" />
		</label>
		<button type="submit" class="btn block">Log in</button>
	</form>
	<p class="faint center"><a href="/register">New here? Register</a></p>
</main>

<style>
	.auth {
		max-width: 24rem;
		margin: 0 auto;
		padding: 48px 20px 40px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.lockup {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 12px 0 6px;
	}
	.lockup img {
		width: 168px;
		height: auto;
	}
	.lockup .eyebrow {
		margin: 0;
	}
	.center {
		text-align: center;
	}
</style>
