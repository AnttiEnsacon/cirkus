<script lang="ts">
	// The task form (airworthiness programme). Every input is bound to
	// state — Svelte 5 re-syncs an unbound value= from its expression on
	// sibling updates and wipes what was typed (HANDOFF §4).
	export interface TaskFormValues {
		code: string;
		title: string;
		source: string;
		source_ref: string;
		interval_hours: string;
		interval_months: string;
		interval_landings: string;
		one_time: boolean;
		anchor_kind: string;
		anchor_date: string;
		anchor_hours: string;
		anchor_landings: string;
		tolerance_hours: string;
		tolerance_days: string;
		tolerance_landings: string;
		reset_rule: string;
		pilot_owner_allowed: boolean;
		notes: string;
		component_id: string;
	}
	let { initial, isNew, components = [] }: { initial: TaskFormValues; isNew: boolean; components?: { id: string; label: string }[] } = $props();

	// svelte-ignore state_referenced_locally
	let code = $state(initial.code);
	// svelte-ignore state_referenced_locally
	let title = $state(initial.title);
	// svelte-ignore state_referenced_locally
	let source = $state(initial.source);
	// svelte-ignore state_referenced_locally
	let sourceRef = $state(initial.source_ref);
	// svelte-ignore state_referenced_locally
	let intervalHours = $state(initial.interval_hours);
	// svelte-ignore state_referenced_locally
	let intervalMonths = $state(initial.interval_months);
	// svelte-ignore state_referenced_locally
	let intervalLandings = $state(initial.interval_landings);
	// svelte-ignore state_referenced_locally
	let oneTime = $state(initial.one_time);
	// svelte-ignore state_referenced_locally
	let anchorKind = $state(initial.anchor_kind);
	// svelte-ignore state_referenced_locally
	let anchorDate = $state(initial.anchor_date);
	// svelte-ignore state_referenced_locally
	let anchorHours = $state(initial.anchor_hours);
	// svelte-ignore state_referenced_locally
	let anchorLandings = $state(initial.anchor_landings);
	// svelte-ignore state_referenced_locally
	let toleranceHours = $state(initial.tolerance_hours);
	// svelte-ignore state_referenced_locally
	let toleranceDays = $state(initial.tolerance_days);
	// svelte-ignore state_referenced_locally
	let toleranceLandings = $state(initial.tolerance_landings);
	// svelte-ignore state_referenced_locally
	let resetRule = $state(initial.reset_rule);
	// svelte-ignore state_referenced_locally
	let pilotOwner = $state(initial.pilot_owner_allowed);
	// svelte-ignore state_referenced_locally
	let notes = $state(initial.notes);
	// svelte-ignore state_referenced_locally
	let componentId = $state(initial.component_id);

	const onComponent = $derived(componentId !== '');
	const noTolerance = $derived(source === 'als' || source === 'ad');
	const fixed = $derived(anchorKind === 'fixed');
</script>

<div class="stack">
	<div class="fields three">
		<label class="field"><span>Code</span><input name="code" class="mono" bind:value={code} placeholder="INSP-100H" required maxlength="32" /></label>
		<label class="field span2"><span>Title</span><input name="title" bind:value={title} required /></label>
		<label class="field">
			<span>Source</span>
			<select name="source" bind:value={source}>
				<option value="ica">ICA (manufacturer)</option>
				<option value="mip">MIP (minimum inspection programme)</option>
				<option value="als">ALS (airworthiness limitation)</option>
				<option value="ad">AD</option>
				<option value="sb">SB</option>
				<option value="owner">Owner</option>
			</select>
		</label>
		<label class="field"><span>Source reference</span><input name="source_ref" bind:value={sourceRef} placeholder="AMM 05-20-01" /></label>
		<label class="field">
			<span>Applies to</span>
			<select name="component_id" bind:value={componentId}>
				<option value="">Aircraft</option>
				{#each components as c (c.id)}
					<option value={c.id}>{c.label}</option>
				{/each}
			</select>
		</label>
	</div>

	{#if onComponent}<p class="hint">A component task counts in the component's own hours (TSN) and cycles (CSN); the calendar is the same. Anchors <em>install</em> and <em>manufacture</em> take the dates from the component record.</p>{/if}

	<p class="section-label">Interval — whichever comes first</p>
	<div class="fields three">
		<label class="field"><span>Hours</span><input name="interval_hours" type="number" step="0.1" min="0" bind:value={intervalHours} /></label>
		<label class="field"><span>Months</span><input name="interval_months" type="number" step="1" min="0" bind:value={intervalMonths} /></label>
		<label class="field"><span>Landings</span><input name="interval_landings" type="number" step="1" min="0" bind:value={intervalLandings} /></label>
	</div>
	<label class="field inline check"><input name="one_time" type="checkbox" bind:checked={oneTime} /><span>One-time task — complete after the first release (an AD's one-off action)</span></label>

	<p class="section-label">Anchor</p>
	<div class="fields four">
		<label class="field">
			<span>Counts from</span>
			<select name="anchor_kind" bind:value={anchorKind}>
				<option value="last_compliance">Last compliance</option>
				<option value="fixed">Fixed point (e.g. an AD's effective date)</option>
				<option value="install" disabled={!onComponent}>Component install</option>
				<option value="manufacture" disabled={!onComponent}>Manufacture date</option>
			</select>
		</label>
		<label class="field"><span>Fixed date</span><input name="anchor_date" type="date" bind:value={anchorDate} disabled={!fixed} /></label>
		<label class="field"><span>Fixed hours</span><input name="anchor_hours" type="number" step="0.1" min="0" bind:value={anchorHours} disabled={!fixed} /></label>
		<label class="field"><span>Fixed landings</span><input name="anchor_landings" type="number" step="1" min="0" bind:value={anchorLandings} disabled={!fixed} /></label>
	</div>

	<p class="section-label">Tolerance — ICA, MIP, SB and owner tasks only</p>
	<div class="fields four">
		<label class="field"><span>Hours</span><input name="tolerance_hours" type="number" step="0.1" min="0" bind:value={toleranceHours} disabled={noTolerance} /></label>
		<label class="field"><span>Days</span><input name="tolerance_days" type="number" step="1" min="0" bind:value={toleranceDays} disabled={noTolerance} /></label>
		<label class="field"><span>Landings</span><input name="tolerance_landings" type="number" step="1" min="0" bind:value={toleranceLandings} disabled={noTolerance} /></label>
		<label class="field">
			<span>Next due after using tolerance</span>
			<select name="reset_rule" bind:value={resetRule}>
				<option value="from_original">From the original due point</option>
				<option value="from_actual">From the actual release</option>
			</select>
		</label>
	</div>
	<p class="hint">
		{#if noTolerance}Airworthiness limitations and ADs are saved with zero tolerance.{:else}"From the original due point" stops the interval creeping later each time the tolerance is used; released early, the clock restarts from the actual point either way.{/if}
	</p>

	<label class="field inline check"><input name="pilot_owner_allowed" type="checkbox" bind:checked={pilotOwner} /><span>Pilot-owner may release this task (Part-ML Appendix II)</span></label>
	<label class="field"><span>Notes</span><textarea name="notes" rows="2" bind:value={notes}></textarea></label>

	<div class="row between wrap">
		<div class="row">
			<button type="submit" class="btn sm" formaction="?/save">{isNew ? 'Add task' : 'Save task'}</button>
			<a href="../../programme" class="btn btn-secondary sm">Cancel</a>
		</div>
	</div>
</div>

<style>
	.fields.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.fields.four {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.span2 {
		grid-column: span 2;
	}
	@media (max-width: 899px) {
		.fields.three,
		.fields.four {
			grid-template-columns: 1fr 1fr;
		}
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
