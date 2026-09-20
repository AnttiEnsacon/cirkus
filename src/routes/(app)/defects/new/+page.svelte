<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	const v = form?.values;
	// svelte-ignore state_referenced_locally
	let aircraftId = $state(v?.aircraft_id ?? data.defaultAircraft);
	// svelte-ignore state_referenced_locally
	let title = $state(v?.title ?? '');
	// svelte-ignore state_referenced_locally
	let description = $state(v?.description ?? '');
	// svelte-ignore state_referenced_locally
	let linkFlight = $state(v ? !!v.link_flight : true);

	const flightMatches = $derived(!!data.flight && data.flight.aircraftId === aircraftId);
</script>

<svelte:head>
	<title>Report a defect — Cirkus</title>
</svelte:head>

<div class="page narrow">
	<div class="page-head">
		<h1>Report a defect</h1>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}

	<form method="POST" enctype="multipart/form-data" class="card stack">
		<label class="field">
			<span>Aircraft</span>
			<select name="aircraft_id" bind:value={aircraftId} required>
				{#each data.aircraft as a (a.id)}
					<option value={a.id}>{a.label}</option>
				{/each}
			</select>
		</label>
		<label class="field"><span>What is wrong</span><input name="title" bind:value={title} placeholder="Nose wheel shimmy above 40 kt" maxlength="120" required /></label>
		<label class="field"><span>Details</span><textarea name="description" rows="3" bind:value={description} placeholder="When it happens, what you saw or heard, what you did"></textarea></label>
		<label class="field"><span>Photo</span><input name="photos" type="file" accept="image/*" capture="environment" multiple /></label>
		{#if data.flight}
			<label class="field inline check"><input type="checkbox" name="link_flight" bind:checked={linkFlight} disabled={!flightMatches} /><span>Link to my last flight · {data.flight.label}{flightMatches ? '' : ' (another aircraft)'}</span></label>
		{/if}
		<button type="submit" class="btn wide"><Icon name="flag" size={16} /> Send report</button>
		<p class="hint">The technical manager assesses it. Until then the aircraft shows as needing attention on the dashboard; if it affects airworthiness, as grounded. Anything that makes the aircraft unsafe to fly: tell the other pilots directly as well.</p>
	</form>
</div>

<style>
	.narrow {
		max-width: 560px;
	}
	.wide {
		width: 100%;
		justify-content: center;
	}
	.check {
		align-items: center;
	}
	.check input {
		width: 18px;
		height: 18px;
	}
	.check > span {
		font-size: 13.5px;
		color: var(--ink);
		font-weight: 500;
	}
</style>
