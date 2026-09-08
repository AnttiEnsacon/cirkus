<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	interface Line {
		category_id: string;
		amount: string;
		description: string;
	}
	interface Props {
		categories: { id: string; code: string; label: string }[];
		/** Field values to start from (create: defaults; edit: the stored receipt). */
		initial: { receipt_date: string; vendor: string; total_amount: string; notes: string; lines: Line[] };
		/** Existing photos (edit only), each removable. */
		images?: { id: string; url: string }[];
		form: { error?: string; values?: Record<string, unknown>; lines?: Line[] } | null | undefined;
		submitLabel: string;
	}
	let { categories, initial, images = [], form, submitLabel }: Props = $props();

	// After a failed submit the re-posted values win over `initial`.
	const v = (key: keyof Props['initial'], fallback = '') => String(form?.values?.[key] ?? initial[key] ?? fallback);

	// The lines are the only client-side state on this page: add / remove a
	// row, and the running check that they add up to the receipt total.
	// svelte-ignore state_referenced_locally
	let lines = $state<Line[]>((form?.lines ?? initial.lines).map((l) => ({ ...l })));
	// Plain inputs are bound too: Svelte re-syncs an unbound value={…}
	// whenever a sibling update runs, which would wipe what was typed.
	// svelte-ignore state_referenced_locally
	let total = $state(v('total_amount'));
	// svelte-ignore state_referenced_locally
	let receiptDate = $state(v('receipt_date'));
	// svelte-ignore state_referenced_locally
	let vendor = $state(v('vendor'));
	// svelte-ignore state_referenced_locally
	let notes = $state(v('notes'));

	const num = (s: string) => {
		const n = Number(String(s).replace(',', '.'));
		return Number.isFinite(n) ? n : 0;
	};
	const linesTotal = $derived(lines.reduce((a, l) => a + num(l.amount), 0));
	const matches = $derived(Math.abs(linesTotal - num(total)) < 0.005 && num(total) > 0);

	function addLine() {
		lines.push({ category_id: categories[0]?.id ?? '', amount: '', description: '' });
	}
	function removeLine(i: number) {
		lines.splice(i, 1);
	}
</script>

{#if form?.error}<p class="alert error">{form.error}</p>{/if}

<form method="POST" enctype="multipart/form-data" class="stack form">
	<div class="card stack">
		<p class="section-label">Receipt photo</p>
		{#if images.length > 0}
			<div class="thumbs">
				{#each images as img (img.id)}
					<label class="thumb">
						<img src={img.url} alt="Receipt" />
						<span class="remove"><input type="checkbox" name="remove_image" value={img.id} /> Remove</span>
					</label>
				{/each}
			</div>
		{/if}
		<label class="field">
			<span>{images.length > 0 ? 'Add another photo' : 'Photo of the receipt'}</span>
			<input name="photos" type="file" accept="image/*" capture="environment" multiple required={images.length === 0} />
		</label>
		<p class="hint">Both sides if the back has details.</p>
	</div>

	<div class="card stack">
		<p class="section-label">Receipt</p>
		<div class="grid2">
			<label class="field">
				<span>Date</span>
				<input name="receipt_date" type="date" bind:value={receiptDate} required />
			</label>
			<label class="field">
				<span>Total €</span>
				<input name="total_amount" class="mono" type="number" step="0.01" min="0.01" inputmode="decimal" bind:value={total} required />
			</label>
		</div>
		<label class="field">
			<span>Vendor</span>
			<input name="vendor" type="text" bind:value={vendor} required />
		</label>
	</div>

	<div class="card stack">
		<p class="section-label">What it was for</p>
		{#each lines as line, i (i)}
			<div class="line">
				<label class="field">
					<span>Category</span>
					<select name="line_category" bind:value={line.category_id} required>
						{#each categories as c (c.id)}
							<option value={c.id}>{c.code} · {c.label}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>Amount €</span>
					<input name="line_amount" class="mono" type="number" step="0.01" min="0.01" inputmode="decimal" bind:value={line.amount} required />
				</label>
				<input type="hidden" name="line_description" value={line.description} />
				<button type="button" class="btn btn-secondary remove-line" onclick={() => removeLine(i)} disabled={lines.length === 1} aria-label="Remove line">
					<Icon name="x" size={16} />
				</button>
			</div>
		{/each}
		<button type="button" class="btn btn-secondary sm add" onclick={addLine}><Icon name="plus" size={15} /> Add line</button>
		<div class="row between sum">
			<span class="faint">Lines total</span>
			<span class="mono" class:ok={matches} class:bad={!matches}>{linesTotal.toFixed(2)} {matches ? '= ' + num(total).toFixed(2) + ' ✓' : '≠ ' + num(total).toFixed(2)}</span>
		</div>
	</div>

	<div class="card stack">
		<label class="field">
			<span>Notes (optional)</span>
			<input name="notes" type="text" bind:value={notes} />
		</label>
	</div>

	<button type="submit" class="btn block"><Icon name="check" size={18} /> {submitLabel}</button>
</form>

<style>
	.form {
		max-width: 44rem;
	}
	.line {
		display: grid;
		grid-template-columns: 1.3fr 1fr 44px;
		gap: 8px;
		align-items: end;
	}
	.remove-line {
		width: 44px;
		height: 44px;
		padding: 0;
		border-radius: var(--radius-sm);
		color: var(--ink-faint);
	}
	.add {
		align-self: flex-start;
	}
	.sum {
		border-top: 1px solid var(--line);
		padding-top: 10px;
	}
	.sum .ok {
		color: var(--teal);
		font-weight: 700;
	}
	.sum .bad {
		color: var(--danger);
		font-weight: 700;
	}
	.thumbs {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
	.thumb {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--ink-soft);
	}
	.thumb img {
		width: 96px;
		height: 96px;
		object-fit: cover;
		border-radius: 10px;
		border: 1px solid var(--line);
	}
	.remove {
		display: flex;
		align-items: center;
		gap: 4px;
	}
</style>
