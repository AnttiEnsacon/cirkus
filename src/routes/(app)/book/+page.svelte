<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	const days = $derived.by(() => {
		const map = new Map<string, typeof data.upcoming>();
		for (const r of data.upcoming) (map.get(r.day) ?? map.set(r.day, []).get(r.day)!).push(r);
		return [...map.entries()];
	});
	const isAdmin = $derived(data.isAdmin);
</script>

<svelte:head>
	<title>Book a reservation — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<div>
			<p class="eyebrow">Reservations · Helsinki time</p>
			<h1>Book a reservation</h1>
		</div>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.success}<p class="alert notice">Reservation booked.</p>{/if}

	<div class="cols c2">
		<form method="POST" action="?/create" class="card stack">
			<p class="section-label">New reservation</p>
			<label class="field">
				<span>Aircraft</span>
				<select name="aircraft_id" required>
					{#each data.aircraft as plane (plane.id)}
						<option value={plane.id}>{plane.tail_number} — {plane.type} · {plane.seats} seats</option>
					{/each}
				</select>
			</label>
			<div class="grid2">
				<label class="field">
					<span>Starts</span>
					<input name="starts_at" type="datetime-local" value={data.defaultStart} required />
				</label>
				<label class="field">
					<span>Ends</span>
					<input name="ends_at" type="datetime-local" value={data.defaultEnd} required />
				</label>
			</div>
			<label class="field">
				<span>Notes (optional)</span>
				<input name="notes" type="text" placeholder="e.g. local flight, EFHK–EFTU" />
			</label>
			<button type="submit" class="btn block"><Icon name="calendar" size={18} /> Book</button>
		</form>

		<div class="stack">
			<p class="section-label">Upcoming</p>
			{#if days.length === 0}
				<div class="card"><p class="muted">Nothing booked yet.</p></div>
			{:else}
				{#each days as [day, list] (day)}
					<div class="card tight">
						<p class="day">{day}</p>
						{#each list as res (res.id)}
							<div class="list-item">
								<span class="list-icon" class:teal={res.mine}><Icon name="plane" size={17} /></span>
								<span class="list-main">
									<span class="list-title"><span class="mono">{res.time}</span> · <span class="tailnum">{res.tail_number}</span></span>
									<span class="list-sub">{res.pilot_name}{res.mine ? ' (you)' : ''}{res.notes ? ` · ${res.notes}` : ''}</span>
								</span>
								<span class="list-end">
									{#if res.mine || isAdmin}
										<form method="POST" action="?/cancel">
											<input type="hidden" name="id" value={res.id} />
											<button type="submit" class="btn btn-danger xs">Cancel</button>
										</form>
									{/if}
								</span>
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.day {
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-faint);
		font-weight: 700;
		padding: 10px 2px 0;
	}
	.list-main {
		display: flex;
		flex-direction: column;
	}
</style>
