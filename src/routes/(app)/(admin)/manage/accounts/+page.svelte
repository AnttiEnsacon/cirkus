<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Accounts — Cirkus</title>
</svelte:head>

<h1>Accounts</h1>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}
{#if form?.passwordSetFor}
	<p class="notice">Password updated.</p>
{/if}

<div class="cards">
	{#each data.users as person (person.id)}
		<div class="card">
			<form method="POST" action="?/update" class="row">
				<input type="hidden" name="id" value={person.id} />
				<input name="name" value={person.name} required />
				<input name="email" type="email" value={person.email} required />
				<select name="role">
					<option value="pilot" selected={person.role === 'pilot'}>pilot</option>
					<option value="admin" selected={person.role === 'admin'}>admin</option>
				</select>
				<select name="status">
					<option value="approved" selected={person.status === 'approved'}>approved</option>
					<option value="pending" selected={person.status === 'pending'}>pending</option>
					<option value="rejected" selected={person.status === 'rejected'}>rejected</option>
				</select>
				<button type="submit">Save</button>
			</form>

			<form method="POST" action="?/setPassword" class="row password-row">
				<input type="hidden" name="id" value={person.id} />
				<span class="hint">{person.hasPassword ? 'Password set' : 'No password set'}</span>
				<input name="password" type="password" placeholder="New password" minlength="8" />
				<button type="submit">Set password</button>
			</form>
		</div>
	{/each}
</div>

<style>
	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 44rem;
	}
	.card {
		border: 1px solid #dddee0;
		border-radius: 8px;
		padding: 0.75rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.password-row {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px dashed #dddee0;
	}
	input,
	select {
		padding: 0.4rem;
	}
	.hint {
		font-size: 0.85rem;
		color: #55585c;
		min-width: 8rem;
	}
	button {
		cursor: pointer;
		padding: 0.35rem 0.75rem;
	}
	.error {
		color: #b3261e;
	}
	.notice {
		color: #1863dc;
	}
</style>
