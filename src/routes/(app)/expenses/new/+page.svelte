<script lang="ts">
	import ExpenseForm from '$lib/components/ExpenseForm.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>New receipt — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>New receipt</h1>
	</div>

	<ExpenseForm categories={data.categories} initial={data.initial} {form} submitLabel="Send receipt" />
</div>
