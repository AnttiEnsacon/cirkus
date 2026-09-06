<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	const ROW = 32; // px per hour in the grid
	const hours = $derived(Array.from({ length: data.hourEnd - data.hourStart }, (_, i) => data.hourStart + i));
	const pad = (n: number) => String(n).padStart(2, '0');

	// The form's times — set by typing, or by clicking a free slot. Initial
	// values only, on purpose: the selection survives paging between weeks.
	// svelte-ignore state_referenced_locally
	let startsAt = $state(data.defaultStart);
	// svelte-ignore state_referenced_locally
	let endsAt = $state(data.defaultEnd);
	// svelte-ignore state_referenced_locally
	let dayIdx = $state(data.todayIndex >= 0 ? data.todayIndex : 0); // phone: which day is open

	function pick(ymd: string, hour: number) {
		const twoFree = hour + 2 <= data.hourEnd && !isBusy(dayOf(ymd), hour + 1);
		startsAt = `${ymd}T${pad(hour)}:00`;
		endsAt = `${ymd}T${pad(hour + (twoFree ? 2 : 1))}:00`;
	}
	const dayOf = (ymd: string) => data.days.findIndex((d) => d.ymd === ymd);
	function isBusy(day: number, hour: number): boolean {
		const a = hour * 60, b = a + 60;
		return data.blocks.some((k) => k.day === day && k.startMin < b && k.endMin > a);
	}
	/** The booking overlapping this hour, if any. */
	function blockAt(day: number, hour: number) {
		const a = hour * 60, b = a + 60;
		return data.blocks.find((k) => k.day === day && k.startMin < b && k.endMin > a);
	}
	// Where the current selection sits, for highlighting
	const sel = $derived.by(() => {
		const d = dayOf(startsAt.slice(0, 10));
		if (d < 0 || endsAt.slice(0, 10) !== startsAt.slice(0, 10)) return null;
		const s = Number(startsAt.slice(11, 13)) * 60 + Number(startsAt.slice(14, 16));
		const e = Number(endsAt.slice(11, 13)) * 60 + Number(endsAt.slice(14, 16));
		return e > s ? { day: d, startMin: s, endMin: e } : null;
	});
	const selText = $derived.by(() => {
		const d = dayOf(startsAt.slice(0, 10));
		const day = d >= 0 ? `${data.days[d].weekday} ${data.days[d].label}` : startsAt.slice(0, 10);
		const s = startsAt.slice(11, 16), e = endsAt.slice(11, 16);
		const sameDay = endsAt.slice(0, 10) === startsAt.slice(0, 10);
		const hrs = sameDay ? ((Number(e.slice(0, 2)) * 60 + Number(e.slice(3)) - Number(s.slice(0, 2)) * 60 - Number(s.slice(3))) / 60).toFixed(1) : null;
		return { day, range: sameDay ? `${s} – ${e}` : `${s} → ${endsAt.slice(0, 10)} ${e}`, hrs };
	});

	const top = (min: number) => Math.max(0, (min / 60 - data.hourStart) * ROW);
	const height = (a: number, b: number) =>
		Math.max(8, (Math.min(b, data.hourEnd * 60) - Math.max(a, data.hourStart * 60)) / 60 * ROW);
	const weekQ = (ymd: string) => `?week=${ymd}&aircraft=${data.selectedAircraftId}`;
</script>

<svelte:head>
	<title>Book a reservation — Cirkus</title>
</svelte:head>

<div class="page">
	<div class="page-head">
		<div>
			<p class="eyebrow">Reservations · Helsinki time</p>
			<h1>Book a reservation</h1>
		</div>
		<span class="faint">Overlaps are checked automatically</span>
	</div>

	{#if form?.error}<p class="alert error">{form.error}</p>{/if}
	{#if form?.success}<p class="alert notice">Reservation booked.</p>{/if}

	<div class="chiprow">
		{#each data.aircraft as plane (plane.id)}
			<a href="?aircraft={plane.id}&week={data.monday}" class="chip" class:on={plane.id === data.selectedAircraftId}>
				<span class="tailnum">{plane.tail_number}</span> · {plane.type}
			</a>
		{/each}
	</div>

	<div class="cols c21">
		<!-- ============ calendar ============ -->
		<div class="stack">
			<div class="row between">
				<a href={weekQ(data.prevWeek)} class="btn btn-secondary xs" aria-label="Previous week"><Icon name="back" size={16} /></a>
				<p class="section-label">Week of {data.days[0].label} – {data.days[6].label}</p>
				<a href={weekQ(data.nextWeek)} class="btn btn-secondary xs" aria-label="Next week"><Icon name="chevron" size={16} /></a>
			</div>

			<!-- laptop: 7-day grid -->
			<div class="cal only-desk" style="--row:{ROW}px">
				<div class="cal-corner"></div>
				{#each data.days as d (d.ymd)}
					<div class="cal-head" class:today={d.isToday}><div class="d">{d.weekday}</div><div class="m">{d.label}</div></div>
				{/each}
				<div class="cal-times">
					{#each hours as h (h)}<div class="cal-time">{pad(h)}:00</div>{/each}
				</div>
				{#each data.days as d, di (d.ymd)}
					<div class="cal-col" class:past={d.isPast}>
						{#each hours as h (h)}
							<button
								type="button"
								class="cal-cell"
								class:busy={isBusy(di, h)}
								disabled={isBusy(di, h) || d.isPast}
								onclick={() => pick(d.ymd, h)}
								aria-label="{d.weekday} {pad(h)}:00"
							></button>
						{/each}
						{#each data.blocks.filter((k) => k.day === di) as k (k.id + di)}
							<div class="cal-block" class:mine={k.mine} style="top:{top(k.startMin)}px;height:{height(k.startMin, k.endMin)}px" title="{k.pilot}{k.notes ? ` · ${k.notes}` : ''}">
								<span>{pad(Math.floor(k.startMin / 60))}:{pad(k.startMin % 60)}–{pad(Math.floor(k.endMin / 60))}:{pad(k.endMin % 60)}</span>
								<span class="who">{k.mine ? 'You' : k.pilot.split(' ')[0]}</span>
							</div>
						{/each}
						{#if sel && sel.day === di}
							<div class="cal-block selected" style="top:{top(sel.startMin)}px;height:{height(sel.startMin, sel.endMin)}px">
								<span>{startsAt.slice(11, 16)}–{endsAt.slice(11, 16)}</span><span class="who">New</span>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- phone: day strip + one day's slots -->
			<div class="only-phone stack">
				<div class="daystrip">
					{#each data.days as d, i (d.ymd)}
						<button type="button" class="daybtn" class:on={i === dayIdx} class:today={d.isToday} onclick={() => (dayIdx = i)}>
							<span class="wd">{d.weekday}</span><span class="dn">{d.label.split(' ')[0]}</span>
						</button>
					{/each}
				</div>
				<div class="card tight">
					{#each hours as h (h)}
						{@const k = blockAt(dayIdx, h)}
						{@const isSel = sel && sel.day === dayIdx && sel.startMin <= h * 60 && sel.endMin > h * 60}
						{#if k && (k.startMin >= h * 60 || h === data.hourStart)}
							<div class="slot booked" class:mine={k.mine}>
								<span class="mono">{pad(Math.floor(k.startMin / 60))}:{pad(k.startMin % 60)} – {pad(Math.floor(k.endMin / 60))}:{pad(k.endMin % 60)}</span>
								<span>{k.mine ? 'You' : k.pilot}{k.notes ? ` · ${k.notes}` : ''}</span>
							</div>
						{:else if k}
							<!-- continuation of a booking already shown -->
						{:else}
							<button type="button" class="slot" class:selected={isSel} disabled={data.days[dayIdx].isPast} onclick={() => pick(data.days[dayIdx].ymd, h)}>
								<span class="mono">{pad(h)}:00</span>
								<span class="faint">{isSel ? 'Selected' : 'Free'}</span>
							</button>
						{/if}
					{/each}
				</div>
				<div class="legend faint">
					<span><i class="sw sel"></i> Selected</span><span><i class="sw mine"></i> Yours</span><span><i class="sw booked"></i> Booked</span>
				</div>
			</div>
		</div>

		<!-- ============ form ============ -->
		<form method="POST" action="?/create" class="stack">
			<input type="hidden" name="aircraft_id" value={data.selectedAircraftId} />
			<div class="card teal stack sel-card">
				<div class="row between">
					<div>
						<div class="sel-range">{selText.range}</div>
						<div class="faint" style="color:var(--teal)">{selText.day}{selText.hrs ? ` · ${selText.hrs} h` : ''}</div>
					</div>
					<Icon name="check" size={20} />
				</div>
			</div>
			<div class="card stack">
				<p class="section-label">Adjust</p>
				<label class="field"><span>Starts</span><input name="starts_at" type="datetime-local" bind:value={startsAt} required /></label>
				<label class="field"><span>Ends</span><input name="ends_at" type="datetime-local" bind:value={endsAt} required /></label>
				<label class="field"><span>Notes (optional)</span><input name="notes" type="text" placeholder="e.g. local flight, EFHK–EFTU" /></label>
				<button type="submit" class="btn block"><Icon name="calendar" size={18} /> Confirm booking</button>
			</div>

			{#if data.thisWeek.length > 0}
				<p class="section-label">This week</p>
				<div class="card tight">
					{#each data.thisWeek as r (r.id)}
						<div class="list-item">
							<span class="list-icon" class:teal={r.mine}><Icon name="plane" size={17} /></span>
							<span class="list-main">
								<span class="list-title mono">{r.when}</span>
								<span class="list-sub">{r.pilot}{r.mine ? ' (you)' : ''}{r.notes ? ` · ${r.notes}` : ''}</span>
							</span>
							{#if (r.mine || data.isAdmin) && !r.past}
								<button type="submit" formaction="?/cancel" name="id" value={r.id} class="btn btn-danger xs">Cancel</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</form>
	</div>
</div>

<style>
	.chiprow a {
		text-decoration: none;
	}
	/* ---- week grid ---- */
	.cal {
		display: grid;
		grid-template-columns: 52px repeat(7, 1fr);
		grid-template-rows: auto 1fr;
		border: 1px solid var(--line);
		border-radius: 14px;
		overflow: hidden;
		background: var(--surface);
	}
	.cal-corner,
	.cal-head {
		background: var(--surface-2);
		border-bottom: 1px solid var(--line);
	}
	.cal-head {
		padding: 9px 4px;
		text-align: center;
		border-left: 1px solid var(--line);
	}
	.cal-head .d {
		font-weight: 800;
		font-size: 12.5px;
	}
	.cal-head .m {
		font-size: 10.5px;
		color: var(--ink-faint);
		font-family: var(--mono);
	}
	.cal-head.today .d {
		color: var(--teal);
	}
	.cal-times {
		display: flex;
		flex-direction: column;
	}
	.cal-time {
		height: var(--row);
		padding: 2px 6px 0 0;
		font-family: var(--mono);
		font-size: 10.5px;
		color: var(--ink-faint);
		text-align: right;
		border-top: 1px solid var(--line);
	}
	.cal-col {
		position: relative;
		border-left: 1px solid var(--line);
		display: flex;
		flex-direction: column;
	}
	.cal-cell {
		height: var(--row);
		border: none;
		border-top: 1px solid var(--line);
		background: transparent;
		cursor: pointer;
		padding: 0;
	}
	.cal-cell:hover:not(:disabled) {
		background: var(--teal-soft);
	}
	.cal-cell.busy {
		background: var(--surface-2);
		cursor: default;
	}
	.cal-col.past .cal-cell {
		background: repeating-linear-gradient(135deg, transparent 0 6px, var(--surface-2) 6px 7px);
		cursor: default;
	}
	.cal-block {
		position: absolute;
		left: 3px;
		right: 3px;
		border-radius: 6px;
		background: var(--line-strong);
		color: var(--ink);
		font-size: 10px;
		font-weight: 800;
		line-height: 1.15;
		padding: 3px 5px;
		overflow: hidden;
		pointer-events: none;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.cal-block .who {
		font-weight: 600;
		opacity: 0.85;
	}
	.cal-block.mine {
		background: var(--navy);
		color: #fff;
	}
	.cal-block.selected {
		background: var(--teal);
		color: #fff;
		outline: 2px solid var(--surface);
	}

	/* ---- phone ---- */
	.daystrip {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}
	.daybtn {
		border: 1px solid var(--line);
		background: var(--surface);
		border-radius: 10px;
		padding: 7px 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		cursor: pointer;
		font-family: var(--sans);
	}
	.daybtn .wd {
		font-size: 10px;
		font-weight: 700;
		color: var(--ink-faint);
		text-transform: uppercase;
	}
	.daybtn .dn {
		font-size: 14px;
		font-weight: 800;
	}
	.daybtn.today .dn {
		color: var(--teal);
	}
	.daybtn.on {
		background: var(--navy);
		border-color: var(--navy);
	}
	.daybtn.on .wd,
	.daybtn.on .dn {
		color: #fff;
	}
	.slot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		gap: 10px;
		padding: 10px 4px;
		border: none;
		border-top: 1px solid var(--line);
		background: transparent;
		font-family: var(--sans);
		font-size: 13.5px;
		text-align: left;
		cursor: pointer;
		color: var(--ink);
	}
	.slot:first-child {
		border-top: none;
	}
	.slot:disabled {
		color: var(--ink-faint);
		cursor: default;
	}
	.slot.selected {
		background: var(--teal-soft);
		color: var(--teal);
		font-weight: 700;
		border-radius: 8px;
	}
	.slot.selected .faint {
		color: var(--teal);
	}
	.slot.booked {
		background: var(--surface-2);
		border-radius: 8px;
		cursor: default;
		font-weight: 600;
		color: var(--ink-soft);
	}
	.slot.booked.mine {
		background: var(--navy);
		color: #fff;
	}
	.legend {
		display: flex;
		gap: 14px;
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.sw {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: var(--line-strong);
	}
	.sw.sel {
		background: var(--teal);
	}
	.sw.mine {
		background: var(--navy);
	}

	/* ---- selection card ---- */
	.sel-range {
		font-weight: 800;
		font-size: 18px;
		color: var(--teal);
		font-family: var(--mono);
	}
	.sel-card :global(.icon) {
		color: var(--teal);
	}
	.list-main {
		display: flex;
		flex-direction: column;
	}

	.only-desk {
		display: none;
	}
	@media (min-width: 900px) {
		.only-phone {
			display: none;
		}
		.only-desk {
			display: grid;
		}
	}
</style>
