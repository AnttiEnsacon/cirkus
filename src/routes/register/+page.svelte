<script lang="ts">
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Register — Cirkus</title>
</svelte:head>

<main class="auth">
	<div class="lockup">
		<img src="/cirkus-logo.png" alt="Cirkus" />
		<p class="eyebrow">KML Aviation Oy</p>
	</div>

	{#if form?.success}
		<div class="card stack">
			<h1>Thanks — you're registered</h1>
			<p class="muted">An admin needs to approve your account before you can log in. You'll be able to sign in once that's done.</p>
			<a href="/login" class="btn btn-secondary block">Back to log in</a>
		</div>
	{:else}
		<form method="POST" class="card stack">
			<h1>Create your account</h1>
			{#if form?.error}
				<p class="alert error">{form.error}</p>
			{/if}
			<label class="field">
				<span>Name</span>
				<input name="name" type="text" value={form?.name ?? ''} required autocomplete="name" />
			</label>
			<label class="field">
				<span>Email</span>
				<input name="email" type="email" value={form?.email ?? ''} required autocomplete="email" />
			</label>
			<label class="field">
				<span>Password</span>
				<input name="password" type="password" minlength="8" required autocomplete="new-password" />
			</label>
			<button type="submit" class="btn block">Register</button>
		</form>
		<p class="faint center"><a href="/login">Already have an account? Log in</a></p>
	{/if}
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
	h1 {
		font-size: 18px;
	}
	.center {
		text-align: center;
	}
</style>
