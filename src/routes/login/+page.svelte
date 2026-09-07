<script lang="ts">
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Log in — Cirkus</title>
</svelte:head>

<div class="split">
	<div class="photo" role="img" aria-label="OH-KML, Cirrus SR20, on the apron"></div>
	<div class="side">
		<main class="auth">
			<div class="lockup">
				<img src="/cirkus-logo.png" alt="Cirkus" />
				<p class="eyebrow">KML Aviation Oy</p>
			</div>

			<form method="POST" class="card stack">
				{#if form?.error}
					<p class="alert error">{form.error}</p>
				{/if}
				<label class="field">
					<span>Email</span>
					<input name="email" type="email" value={form?.email ?? ''} required autocomplete="email" />
				</label>
				<label class="field">
					<span>Password</span>
					<input name="password" type="password" required autocomplete="current-password" />
				</label>
				<button type="submit" class="btn block">Log in</button>
			</form>
			<p class="faint center"><a href="/register">New here? Register</a></p>
		</main>
	</div>
</div>

<style>
	.split {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--paper);
	}
	/* Phone: the photo is the top third, the form slides up over its lower edge. */
	.photo {
		flex: 0 0 38dvh;
		background: url('/oh-kml.jpg') center 60% / cover no-repeat;
		position: relative;
	}
	.photo::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0) 55%, var(--paper) 100%);
	}
	.side {
		display: flex;
		justify-content: center;
	}
	.auth {
		width: 100%;
		max-width: 24rem;
		margin: -56px auto 0;
		padding: 0 20px 40px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		position: relative;
	}
	.lockup {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 12px 0 6px;
	}
	.lockup img {
		width: 168px;
		height: auto;
	}
	.lockup .eyebrow {
		margin: 0;
	}
	.center {
		text-align: center;
	}

	/* Laptop: photo left, form right. */
	@media (min-width: 900px) {
		.split {
			flex-direction: row;
		}
		.photo {
			flex: 1 1 58%;
			min-height: 100dvh;
			background-position: center;
		}
		.photo::after {
			background: linear-gradient(90deg, rgba(0, 0, 0, 0) 70%, var(--paper) 100%);
		}
		.side {
			flex: 0 0 42%;
			align-items: center;
		}
		.auth {
			margin: 0 auto;
			padding: 40px 32px;
		}
	}
</style>
