<script lang="ts">
	import ExpenseForm from '$lib/components/ExpenseForm.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Edit receipt — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Edit receipt</h1>
	</div>

	{#if data.paid}
		<p class="alert error">This receipt has been paid and can no longer be changed.</p>
	{:else}
		<ExpenseForm categories={data.categories} initial={data.initial} images={data.images} {form} submitLabel="Save changes" />
	{/if}
</div>
