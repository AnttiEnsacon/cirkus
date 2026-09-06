<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/cirkus-icon.png" type="image/png" />
	<link rel="apple-touch-icon" href="/cirkus-icon.png" />
</svelte:head>

{@render children()}
