<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	function fmt(d: Date): string {
		return new Intl.DateTimeFormat('en-GB', {
			timeZone: 'Europe/Helsinki',
			weekday: 'short',
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		}).format(d);
	}
</script>

<svelte:head>
	<title>Book a reservation — Cirkus</title>
</svelte:head>

<h1>Book a reservation</h1>
<p class="hint">Times are Helsinki local time.</p>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}
{#if form?.success}
	<p class="notice">Reservation booked.</p>
{/if}

<form method="POST" action="?/create" class="row booking-form">
	<label>
		Aircraft
		<select name="aircraft_id" required>
			{#each data.aircraft as plane (plane.id)}
				<option value={plane.id}>{plane.tail_number} — {plane.type}</option>
			{/each}
		</select>
	</label>
	<label>
		Starts
		<input name="starts_at" type="datetime-local" value={data.defaultStart} required />
	</label>
	<label>
		Ends
		<input name="ends_at" type="datetime-local" value={data.defaultEnd} required />
	</label>
	<label class="notes">
		Notes (optional)
		<input name="notes" type="text" placeholder="e.g. local flight" />
	</label>
	<button type="submit">Book</button>
</form>

<h2>Upcoming reservations</h2>
{#if data.upcoming.length === 0}
	<p>Nothing booked yet.</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Aircraft</th>
				<th>Starts</th>
				<th>Ends</th>
				<th>Pilot</th>
				<th>Notes</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.upcoming as res (res.id)}
				<tr>
					<td>{res.tail_number}</td>
					<td>{fmt(res.starts_at_display)}</td>
					<td>{fmt(res.ends_at_display)}</td>
					<td>{res.pilot_name}</td>
					<td>{res.notes ?? ''}</td>
					<td>
						<form method="POST" action="?/cancel">
							<input type="hidden" name="id" value={res.id} />
							<button type="submit" class="cancel">Cancel</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.hint {
		color: #55585c;
		font-size: 0.85rem;
		margin-top: -0.5rem;
	}
	.booking-form {
		margin-bottom: 1.5rem;
	}
	.row {
		display: flex;
		gap: 0.6rem;
		align-items: flex-end;
		flex-wrap: wrap;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.85rem;
	}
	.notes {
		flex: 1;
		min-width: 12rem;
	}
	input,
	select {
		padding: 0.4rem;
	}
	button {
		cursor: pointer;
		padding: 0.4rem 0.9rem;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		max-width: 48rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid #dddee0;
		font-size: 0.9rem;
	}
	.cancel {
		color: #b3261e;
		padding: 0.25rem 0.6rem;
	}
	.error {
		color: #b3261e;
	}
	.notice {
		color: #1863dc;
	}
</style>
