<script lang="ts">
	// Same icon set as the mock-up.
	const paths: Record<string, string> = {
		home: '<path d="M4 10.5 12 4l8 6.5" /><path d="M6 9.5V19a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1V9.5" />',
		calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.2"/><path d="M4 10h16"/><path d="M8 3.3v3.4"/><path d="M16 3.3v3.4"/>',
		pencil: '<path d="M14.3 5.3 18.7 9.7 8.4 20H4v-4.4z"/><path d="M12.6 7 17 11.4"/>',
		list: '<path d="M9 6.5h11"/><path d="M9 12h11"/><path d="M9 17.5h11"/><circle cx="4.3" cy="6.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="4.3" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="4.3" cy="17.5" r="1.15" fill="currentColor" stroke="none"/>',
		more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
		back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
		chevron: '<path d="M9 5.5 15.5 12 9 18.5"/>',
		plane: '<path d="M11.2 3.2v6.1L3.6 13v2l7.6-2.3v4.6L8.6 19v1.7l3.4-1 3.4 1V19l-2.6-1.7v-4.6l7.6 2.3v-2l-7.6-3.7V3.2c0-.9-.7-1.4-1.4-1.4s-1.4.5-1.4 1.4Z"/>',
		check: '<path d="M4.5 12.5 9 17l10.5-10.5"/>',
		plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
		shield: '<path d="M12 3.5 19 6v5.5c0 4.6-3 7.4-7 9-4-1.6-7-4.4-7-9V6Z"/><path d="M9 12l2.2 2.2L15.5 9.5"/>',
		users: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.3"/><path d="M15.3 14.2c2.1.4 3.6 1.9 4.2 4.8"/>',
		wrench: '<path d="M15.5 4.5a4 4 0 0 0-5.4 4.9L4 15.5V19h3.5l6.1-6.1a4 4 0 0 0 4.9-5.4l-2.7 2.7-2.1-.6-.6-2.1Z"/>',
		receipt: '<path d="M6 3.5h12v17l-2.2-1.4L13.6 20l-2.2-1.4L9.2 20 7 18.6 4.8 20V6.7"/><path d="M9 8h6"/><path d="M9 11.5h6"/><path d="M9 15h4"/>',
		clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3.2 2"/>',
		'arrow-right': '<path d="M4.5 12h15"/><path d="M13.5 6l6 6-6 6"/>',
		'map-pin': '<path d="M12 21s7-6.4 7-11.5A7 7 0 0 0 5 9.5C5 14.6 12 21 12 21Z"/><circle cx="12" cy="9.3" r="2.4"/>',
		logout: '<path d="M9 4.5H6a1.6 1.6 0 0 0-1.6 1.6v11.8A1.6 1.6 0 0 0 6 19.5h3"/><path d="M20 12H10.5"/><path d="M16.5 8l4 4-4 4"/>',
		alert: '<path d="M12 3.5 21 19.5H3Z"/><path d="M12 9.5v4.2"/><circle cx="12" cy="16.6" r=".2" fill="currentColor" stroke="currentColor" stroke-width="1.6"/>',
		x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
		refresh: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M17.5 3.5v4h-4"/>',
		euro: '<path d="M17.5 6.5a6.5 6.5 0 1 0 0 11"/><path d="M4.5 10.5h9"/><path d="M4.5 13.5h9"/>',
		camera: '<path d="M4 8.5a1.8 1.8 0 0 1 1.8-1.8h2.4l1.3-2.2h5l1.3 2.2h2.4A1.8 1.8 0 0 1 20 8.5v9.2a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 17.7Z"/><circle cx="12" cy="13" r="3.3"/>',
		wallet: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h12A1.5 1.5 0 0 1 19 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 17.5Z"/><path d="M15 6V4.6A1.1 1.1 0 0 0 13.7 3.5L5.2 5.3"/><path d="M15.5 12.5h3.5v3h-3.5a1.5 1.5 0 0 1 0-3Z"/>',
		trash: '<path d="M5 7h14"/><path d="M9.5 7V4.8h5V7"/><path d="M7 7l.8 12.2h8.4L17 7"/><path d="M10.2 10.5v6"/><path d="M13.8 10.5v6"/>'
	};
	let { name, size = 19 }: { name: string; size?: number } = $props();
</script>

<svg
	class="icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{@html paths[name] ?? ''}
</svg>
