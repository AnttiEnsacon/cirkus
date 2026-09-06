<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Home — Cirkus</title>
</svelte:head>

<h1>Welcome, {data.user.name.split(' ')[0]}</h1>
<p>
	You're signed in as <strong>{data.user.role}</strong>. Reservations, flight logging and the rest
	of the club's tools land here in the phases ahead.
</p>
