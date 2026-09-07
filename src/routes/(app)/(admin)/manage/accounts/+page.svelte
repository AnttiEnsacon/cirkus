<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Accounts — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Accounts</h1>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.passwordSetFor}<p class="alert notice">Password updated.</p>{/if}
	{#if form?.added}<p class="alert notice">{form.added} added — they can log in with the temporary password now.</p>{/if}

	<form method="POST" action="?/add" class="card stack">
		<p class="section-label">Add a member</p>
		<div class="fields">
			<label class="field"><span>Name</span><input name="name" required autocomplete="off" /></label>
			<label class="field"><span>Email</span><input name="email" type="email" required autocomplete="off" /></label>
			<label class="field">
				<span>Role</span>
				<select name="role"><option value="pilot">pilot</option><option value="admin">admin</option></select>
			</label>
			<label class="field"><span>Temporary password</span><input name="password" type="password" minlength="8" required autocomplete="new-password" /></label>
		</div>
		<button type="submit" class="btn sm"><Icon name="plus" size={16} /> Add member</button>
		<p class="hint">Added members are approved straight away — tell them the temporary password and ask them to change it. Someone who registers themselves instead shows up under Approvals.</p>
	</form>

	<p class="section-label">Members</p>
	<div class="stack">
		{#each data.users as person (person.id)}
			<div class="card stack">
				<div class="row between wrap">
					<div>
						<div class="list-title">{person.name}</div>
						<div class="list-sub">{person.email}</div>
					</div>
					<div class="chiprow">
						<span class="chip" class:on={person.role === 'admin'}>{person.role}</span>
						<span class="status {person.status}">{person.status}</span>
					</div>
				</div>

				<form method="POST" action="?/update" class="fields">
					<input type="hidden" name="id" value={person.id} />
					<label class="field"><span>Name</span><input name="name" value={person.name} required /></label>
					<label class="field"><span>Email</span><input name="email" type="email" value={person.email} required /></label>
					<label class="field">
						<span>Role</span>
						<select name="role">
							<option value="pilot" selected={person.role === 'pilot'}>pilot</option>
							<option value="admin" selected={person.role === 'admin'}>admin</option>
						</select>
					</label>
					<label class="field">
						<span>Status</span>
						<select name="status">
							<option value="approved" selected={person.status === 'approved'}>approved</option>
							<option value="pending" selected={person.status === 'pending'}>pending</option>
							<option value="rejected" selected={person.status === 'rejected'}>rejected</option>
						</select>
					</label>
					<div class="field"><span>&nbsp;</span><button type="submit" class="btn btn-secondary sm">Save</button></div>
				</form>

				<hr class="hr" />

				<form method="POST" action="?/setPassword" class="fields pw">
					<input type="hidden" name="id" value={person.id} />
					<label class="field">
						<span>{person.hasPassword ? 'Set a new password' : 'No password set yet'}</span>
						<input name="password" type="password" placeholder="At least 8 characters" minlength="8" autocomplete="new-password" />
					</label>
					<div class="field"><span>&nbsp;</span><button type="submit" class="btn sm">Set password</button></div>
				</form>
			</div>
		{/each}
	</div>
</div>

<style>
	.fields {
		align-items: end;
	}
	.pw {
		grid-template-columns: minmax(180px, 2fr) minmax(120px, 1fr);
	}
	.btn {
		align-self: flex-start;
	}
</style>
