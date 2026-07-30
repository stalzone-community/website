<script lang="ts">
	/**
	 * The EXBO account pill in the top bar — the same shape, height and mono
	 * type as UAR's Battle.net button, in EXBO's own blue rather than
	 * Battle.net's.
	 *
	 * THE MARK is EXBO's own, in EXBO's own colours, so the pill around it is
	 * neutral rather than coloured — the same reasoning as Google's sign-in
	 * button. A blue pill would put their dark blue on a near-identical
	 * background and half the mark would disappear.
	 *
	 * The file is `static/brand/exbo.png`; the wordmark is the fallback if it
	 * ever fails to load.
	 *
	 * Signed-in state is resolved on the client. Every page here is prerendered,
	 * so the server that rendered the HTML had no request to read a cookie from
	 * — the button asks `/auth/me` once it is in the browser and swaps itself
	 * for the account chip.
	 */
	import { onMount } from 'svelte';

	interface Account {
		name: string;
	}

	let account = $state<Account | null>(null);
	let resolved = $state(false);
	/** flipped the first time the optional logo file fails to load */
	let noMark = $state(false);

	onMount(async () => {
		try {
			const r = await fetch('/auth/me');
			if (r.ok) {
				const body = (await r.json()) as { user: Account | null };
				account = body.user;
			}
		} catch {
			// offline, or the endpoint is not deployed yet — stay signed out
		} finally {
			resolved = true;
		}
	});
</script>

{#snippet glyph()}
	{#if noMark}
		<span class="wordmark" aria-hidden="true">EXBO</span>
	{:else}
		<img
			class="mark"
			src="/brand/exbo.png"
			alt=""
			width="32"
			height="32"
			onerror={() => (noMark = true)}
		/>
	{/if}
{/snippet}

{#if account}
	<!-- the same two-part chip as UAR's: the account itself, and a cog end-cap
	     for everything you can do to it. Signing out lives behind the cog rather
	     than on the bar — it is the one action you never want next to a link you
	     click often. -->
	<div class="chip">
		<a class="who" href="/account" title={account.name}>
			{@render glyph()}
			<span class="name">{account.name}</span>
		</a>
		<a class="cog" href="/account" title="Account settings" aria-label="Account settings">
			<svg
				viewBox="0 0 24 24"
				width="13"
				height="13"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="3" />
				<path
					d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
				/>
			</svg>
		</a>
	</div>
{:else}
	<a
		class="account-btn"
		class:pending={!resolved}
		href="/auth/exbo"
		title="Connect your EXBO account"
	>
		{@render glyph()}
		<span class="label">Connect</span>
	</a>
{/if}

<style>
	.account-btn {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 30px;
		padding: 0 14px;
		border: 1px solid var(--border-strong);
		border-radius: 99px;
		background: var(--surface-raised);
		color: var(--text);
		font: 500 12px/1 var(--font-mono);
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
		transition: filter 120ms ease;
	}

	.account-btn:hover {
		border-color: var(--exbo);
		background: var(--surface);
	}

	/* square, so the flex row centres it against the label with no coaxing */
	.mark {
		width: 16px;
		height: 16px;
		flex: none;
	}

	/* the fallback: heavier and tighter than the label beside it, so the two
	   read as "EXBO" and "Connect" rather than as one phrase */
	.wordmark {
		flex: none;
		font: 700 11px/1 var(--font-mono);
		letter-spacing: 0.04em;
	}

	/* the flash between first paint and knowing who you are is a worse tell
	   than simply being slightly quiet for one round trip */
	.account-btn.pending {
		opacity: 0.75;
	}

	.chip {
		display: flex;
		align-items: center;
		height: 30px;
		border: 1px solid var(--border-strong);
		border-radius: 99px;
		background: var(--surface-raised);
		color: var(--text);
		overflow: hidden;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 0 10px 0 12px;
		height: 100%;
		color: inherit;
		text-decoration: none;
		font: 500 12px/1 var(--font-mono);
	}

	.who:hover {
		background: var(--surface);
	}

	.name {
		max-width: 12ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cog {
		display: grid;
		place-items: center;
		width: 30px;
		height: 100%;
		border-left: 1px solid var(--border);
		color: var(--text-dim);
		text-decoration: none;
	}

	.cog:hover {
		background: var(--surface);
		color: var(--text);
	}

	@media (max-width: 700px) {
		.label,
		.name {
			display: none;
		}

		.account-btn {
			padding: 0 10px;
		}

		.who {
			padding: 0 8px 0 10px;
		}
	}
</style>
