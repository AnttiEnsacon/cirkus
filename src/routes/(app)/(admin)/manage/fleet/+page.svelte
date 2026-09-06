<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	function ownerNames(aircraftId: string): string {
		const ids = data.ownersByAircraft[aircraftId] ?? [];
		return (
			ids
				.map((id) => data.people.find((p) => p.id === id)?.name)
				.filter(Boolean)
				.join(', ') || 'No owners set'
		);
	}

	function eur(amount: string): string {
		return `€${Number(amount).toFixed(2)}/h`;
	}
</script>

<svelte:head>
	<title>Fleet — Cirkus</title>
</svelte:head>

<h1>Fleet</h1>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

<div class="cards">
	{#each data.aircraft as plane (plane.id)}
		<div class="card">
			<h2>{plane.tail_number}</h2>
			<p class="owners">{ownerNames(plane.id)}</p>

			<form method="POST" action="?/update" class="row">
				<input type="hidden" name="id" value={plane.id} />
				<label>
					Type
					<input name="type" value={plane.type} required />
				</label>
				<label>
					Seats
					<input name="seats" type="number" min="1" value={plane.seats} required />
				</label>
				<label>
					Member rate (€/h)
					<input
						name="member_rate_per_hour"
						type="number"
						step="0.01"
						min="0"
						value={plane.member_rate_per_hour}
						required
					/>
				</label>
				<label>
					Guest rate (€/h)
					<input
						name="guest_rate_per_hour"
						type="number"
						step="0.01"
						min="0"
						value={plane.guest_rate_per_hour}
						required
					/>
				</label>
				<button type="submit">Save</button>
			</form>

			<details>
				<summary>Co-owners</summary>
				<form method="POST" action="?/updateOwners" class="owner-form">
					<input type="hidden" name="aircraft_id" value={plane.id} />
					{#each data.people as person (person.id)}
						<label class="owner-check">
							<input
								type="checkbox"
								name="owner_ids"
								value={person.id}
								checked={(data.ownersByAircraft[plane.id] ?? []).includes(person.id)}
							/>
							{person.name}
						</label>
					{/each}
					<button type="submit">Save co-owners</button>
				</form>
			</details>

			<p class="rates-preview">{eur(plane.member_rate_per_hour)} members · {eur(
					plane.guest_rate_per_hour
				)} guests · {plane.seats} seats</p>
		</div>
	{/each}
</div>

<h2>Add an aircraft</h2>
<form method="POST" action="?/add" class="row">
	<label>
		Tail number
		<input name="tail_number" placeholder="OH-XXX" required />
	</label>
	<label>
		Type
		<input name="type" placeholder="Cirrus SR20" required />
	</label>
	<label>
		Seats
		<input name="seats" type="number" min="1" required />
	</label>
	<label>
		Member rate (€/h)
		<input name="member_rate_per_hour" type="number" step="0.01" min="0" required />
	</label>
	<label>
		Guest rate (€/h)
		<input name="guest_rate_per_hour" type="number" step="0.01" min="0" required />
	</label>
	<button type="submit">Add aircraft</button>
</form>

<style>
	.cards {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 44rem;
	}
	.card {
		border: 1px solid #dddee0;
		border-radius: 8px;
		padding: 0.9rem 1rem;
	}
	.card h2 {
		margin: 0 0 0.15rem;
	}
	.owners {
		margin: 0 0 0.6rem;
		color: #55585c;
		font-size: 0.9rem;
	}
	.rates-preview {
		margin: 0.6rem 0 0;
		font-size: 0.85rem;
		color: #55585c;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		flex-wrap: wrap;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.85rem;
	}
	input {
		padding: 0.4rem;
	}
	button {
		cursor: pointer;
		padding: 0.4rem 0.8rem;
	}
	details {
		margin-top: 0.6rem;
	}
	.owner-form {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-top: 0.5rem;
		max-width: 16rem;
	}
	.owner-check {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
	}
	.error {
		color: #b3261e;
	}
</style>
