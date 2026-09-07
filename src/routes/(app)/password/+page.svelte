<script lang="ts">
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<svelte:head>
	<title>Change password — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Change password</h1>
	</div>

	{#if form?.success}
		<p class="alert notice">Password changed.</p>
	{:else}
		<form method="POST" class="card stack narrow">
			{#if form?.error}<p class="alert error">{form.error}</p>{/if}
			<label class="field"><span>Current password</span><input name="current" type="password" required autocomplete="current-password" /></label>
			<label class="field"><span>New password</span><input name="next" type="password" minlength="8" required autocomplete="new-password" /></label>
			<label class="field"><span>New password again</span><input name="confirm" type="password" minlength="8" required autocomplete="new-password" /></label>
			<button type="submit" class="btn">Change password</button>
		</form>
	{/if}
</div>

<style>
	.narrow {
		max-width: 24rem;
	}
	.btn {
		align-self: flex-start;
	}
</style>
