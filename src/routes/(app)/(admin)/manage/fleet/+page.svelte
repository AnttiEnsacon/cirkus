<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	function ownerNames(aircraftId: string): string {
		const ids = data.ownersByAircraft[aircraftId] ?? [];
		return ids.map((id) => data.people.find((p) => p.id === id)?.name).filter(Boolean).join(', ') || 'No owners set';
	}
</script>

<svelte:head>
	<title>Fleet — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Fleet</h1>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}

	{#each data.aircraft as plane (plane.id)}
		<div class="card stack">
			<div class="row">
				<span class="list-icon teal"><Icon name="plane" /></span>
				<div class="list-main">
					<div class="list-title"><span class="tailnum" style="font-size:16px">{plane.tail_number}</span> · {plane.type}</div>
					<div class="list-sub">{ownerNames(plane.id)}</div>
				</div>
			</div>

			<div class="stats3 rates">
				<div class="stat"><div class="n">€{Number(plane.member_rate_per_hour).toFixed(0)}</div><div class="l">member /h</div></div>
				<div class="stat"><div class="n">€{Number(plane.guest_rate_per_hour).toFixed(0)}</div><div class="l">guest /h</div></div>
				<div class="stat"><div class="n">{plane.seats}</div><div class="l">seats</div></div>
			</div>

			<form method="POST" action="?/update" class="fields">
				<input type="hidden" name="id" value={plane.id} />
				<label class="field"><span>Type</span><input name="type" value={plane.type} required /></label>
				<label class="field"><span>Seats</span><input name="seats" type="number" min="1" value={plane.seats} required /></label>
				<label class="field"><span>Member rate €/h</span><input name="member_rate_per_hour" class="mono" type="number" step="0.01" min="0" value={plane.member_rate_per_hour} required /></label>
				<label class="field"><span>Guest rate €/h</span><input name="guest_rate_per_hour" class="mono" type="number" step="0.01" min="0" value={plane.guest_rate_per_hour} required /></label>
				<label class="field">
					<span>Billing</span>
					<select name="billing_basis">
						<option value="tacho" selected={plane.billing_basis === 'tacho'}>Tacho time</option>
						<option value="airborne" selected={plane.billing_basis === 'airborne'}>Airborne time</option>
					</select>
				</label>
				<label class="field">
					<span>Record Tacho readings</span>
					<span class="check"><input name="records_tacho" type="checkbox" checked={plane.records_tacho} /> {plane.billing_basis === 'tacho' ? 'Required for Tacho billing' : 'Optional on the log form'}</span>
				</label>
				<div class="field"><span>&nbsp;</span><button type="submit" class="btn btn-secondary sm">Save</button></div>
			</form>

			<details>
				<summary class="section-label">Co-owners</summary>
				<form method="POST" action="?/updateOwners" class="stack owners">
					<input type="hidden" name="aircraft_id" value={plane.id} />
					<div class="owner-grid">
						{#each data.people as person (person.id)}
							<label class="field inline">
								<input type="checkbox" name="owner_ids" value={person.id} checked={(data.ownersByAircraft[plane.id] ?? []).includes(person.id)} />
								<span>{person.name}</span>
							</label>
						{/each}
					</div>
					<button type="submit" class="btn btn-secondary sm">Save co-owners</button>
				</form>
			</details>
		</div>
	{/each}

	<form method="POST" action="?/add" class="card stack">
		<p class="section-label">Add an aircraft</p>
		<div class="fields">
			<label class="field"><span>Tail number</span><input name="tail_number" class="mono" placeholder="OH-XXX" required /></label>
			<label class="field"><span>Type</span><input name="type" placeholder="Cirrus SR20" required /></label>
			<label class="field"><span>Seats</span><input name="seats" type="number" min="1" required /></label>
			<label class="field"><span>Member rate €/h</span><input name="member_rate_per_hour" class="mono" type="number" step="0.01" min="0" required /></label>
			<label class="field"><span>Guest rate €/h</span><input name="guest_rate_per_hour" class="mono" type="number" step="0.01" min="0" required /></label>
			<label class="field">
				<span>Billing</span>
				<select name="billing_basis">
					<option value="tacho">Tacho time</option>
					<option value="airborne">Airborne time</option>
				</select>
			</label>
			<label class="field">
				<span>Record Tacho readings</span>
				<span class="check"><input name="records_tacho" type="checkbox" checked /> Ask on the log form</span>
			</label>
		</div>
		<button type="submit" class="btn sm"><Icon name="plus" size={16} /> Add aircraft</button>
	</form>
</div>

<style>
	.fields {
		align-items: end;
	}
	.rates {
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 10px 0;
	}
	summary {
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::before {
		content: '▸ ';
	}
	details[open] summary::before {
		content: '▾ ';
	}
	.owners {
		margin-top: 10px;
	}
	.owner-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 6px 12px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		font-size: 13.5px;
		color: var(--ink-soft);
	}
	.check input {
		width: 18px;
		height: 18px;
	}
	.field.inline > span {
		font-weight: 600;
		font-size: 13.5px;
		color: var(--ink);
	}
	.btn {
		align-self: flex-start;
	}
</style>
