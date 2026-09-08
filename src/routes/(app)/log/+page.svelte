<script lang="ts">
	import FlightForm from '$lib/components/FlightForm.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Log a flight — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Log a flight</h1>
	</div>

	<FlightForm
		aircraft={data.aircraft}
		flightTypes={data.flightTypes}
		people={data.people}
		reservations={data.reservations}
		initial={data.initial}
		{form}
		submitLabel="Save flight log"
	/>
</div>
