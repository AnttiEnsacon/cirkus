<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Flight types — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Flight types</h1>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}

	<!-- One form per row, kept outside the table (a form can't sit inside a
	     tr). The row's inputs point at it with form="ft-…". -->
	{#each data.types as t (t.id)}
		<form method="POST" action="?/update" id="ft-{t.id}" hidden><input type="hidden" name="id" value={t.id} /></form>
	{/each}

	<div class="card">
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr><th>Abbr.</th><th>Name</th><th>Account</th><th>Tax</th><th class="num">Order</th><th>Used</th><th></th></tr>
				</thead>
				<tbody>
					{#each data.types as t (t.id)}
						<tr class:inactive={!t.is_active}>
							<td><input form="ft-{t.id}" name="code" class="cell mono code" value={t.code} maxlength="6" required /></td>
							<td class="wrap"><input form="ft-{t.id}" name="label" class="cell" value={t.label} required /></td>
							<td><input form="ft-{t.id}" name="account" class="cell mono" value={t.account ?? ''} inputmode="numeric" /></td>
							<td><input form="ft-{t.id}" name="taxable" type="checkbox" checked={t.taxable} aria-label="Taxable" /></td>
							<td class="num"><input form="ft-{t.id}" name="sort_order" type="number" class="cell mono order" value={t.sort_order} /></td>
							<td class="faint">{t.flights === 0 ? '—' : `${t.flights} flight${t.flights === 1 ? '' : 's'}`}{#if !t.is_active}<span class="sub">inactive</span>{/if}</td>
							<td class="actions">
								<button type="submit" form="ft-{t.id}" class="btn btn-secondary xs">Save</button>
								<form method="POST" action="?/toggle"><input type="hidden" name="id" value={t.id} /><button type="submit" class="btn btn-secondary xs">{t.is_active ? 'Deactivate' : 'Activate'}</button></form>
								{#if t.flights === 0}
									<form method="POST" action="?/delete"><input type="hidden" name="id" value={t.id} /><button type="submit" class="btn btn-danger xs">Delete</button></form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<form method="POST" action="?/add" class="card stack">
		<p class="section-label">Add a flight type</p>
		<div class="fields">
			<label class="field"><span>Abbreviation</span><input name="code" class="mono" placeholder="HAR" maxlength="6" required /></label>
			<label class="field"><span>Name</span><input name="label" placeholder="Harjoituslento" required /></label>
			<label class="field"><span>Account</span><input name="account" class="mono" placeholder="3210" inputmode="numeric" /></label>
			<label class="field"><span>Order</span><input name="sort_order" type="number" value="99" /></label>
			<label class="field inline tax"><input name="taxable" type="checkbox" checked /><span>Taxable (VAT)</span></label>
		</div>
		<button type="submit" class="btn sm"><Icon name="plus" size={16} /> Add flight type</button>
	</form>
	<p class="hint">Deactivated types stay on old flights but can't be chosen for new ones. A type with logged flights can't be deleted.</p>
</div>

<style>
	.cell {
		border: 1px solid transparent;
		border-radius: 8px;
		padding: 6px 8px;
		font-family: var(--sans);
		font-size: 13.5px;
		background: transparent;
		color: var(--ink);
		width: 100%;
		min-width: 7rem;
	}
	.cell:hover,
	.cell:focus {
		border-color: var(--line-strong);
		background: var(--surface);
		outline: none;
	}
	.cell.code {
		min-width: 4.5rem;
		text-transform: uppercase;
		font-weight: 700;
	}
	.cell.order {
		min-width: 3.5rem;
		text-align: right;
	}
	.cell.mono {
		font-family: var(--mono);
	}
	tr.inactive td {
		color: var(--ink-faint);
	}
	tr.inactive .cell {
		color: var(--ink-faint);
	}
	.fields {
		align-items: end;
	}
	.field.inline.tax {
		padding-bottom: 12px;
	}
	.field.inline.tax > span {
		font-weight: 600;
		font-size: 13.5px;
		color: var(--ink);
	}
	.btn {
		align-self: flex-start;
	}
</style>
