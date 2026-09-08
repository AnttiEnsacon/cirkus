<script lang="ts">
	import FlightForm from '$lib/components/FlightForm.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Edit flight — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Edit flight</h1>
	</div>

	{#if data.billed}
		<p class="alert error">This flight has been invoiced and can no longer be changed.</p>
	{:else}
		<FlightForm
			aircraft={data.aircraft}
			flightTypes={data.flightTypes}
			people={data.people}
			reservations={data.reservations}
			initial={data.initial}
			pilotName={data.pilotName}
			{form}
			submitLabel="Save changes"
		/>
	{/if}
</div>
