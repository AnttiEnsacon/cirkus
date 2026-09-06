<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Approvals — Cirkus</title>
</svelte:head>

<h1>Pending approvals</h1>

{#if data.pending.length === 0}
	<p>No accounts are waiting for approval.</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>Email</th>
				<th>Requested</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.pending as person (person.id)}
				<tr>
					<td>{person.name}</td>
					<td>{person.email}</td>
					<td>{new Date(person.created_at).toLocaleDateString()}</td>
					<td class="actions">
						<form method="POST" action="?/approve">
							<input type="hidden" name="id" value={person.id} />
							<button type="submit">Approve</button>
						</form>
						<form method="POST" action="?/reject">
							<input type="hidden" name="id" value={person.id} />
							<button type="submit" class="reject">Reject</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	table {
		border-collapse: collapse;
		width: 100%;
		max-width: 40rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid #dddee0;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	button {
		cursor: pointer;
		padding: 0.35rem 0.75rem;
	}
	.reject {
		color: #b3261e;
	}
</style>
