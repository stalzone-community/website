<script lang="ts">
	/**
	 * The upvote arrow.
	 *
	 * Optimistic: the count moves on click and rolls back if the server
	 * disagrees, because a vote that waits for a round trip feels broken on a
	 * list where the whole interaction is one tap.
	 *
	 * A signed-out visitor is not stopped from clicking. They get the 401, and
	 * the page turns that into the connect prompt — which is a better answer
	 * than a disabled button that explains nothing.
	 */
	interface Props {
		slug: string;
		votes: number;
		voted: boolean;
		onunauthorised: () => void;
		/** so the parent can keep its own copy in step */
		onchange?: (state: { votes: number; voted: boolean }) => void;
	}

	let { slug, votes, voted, onunauthorised, onchange }: Props = $props();

	/* The truth is the server's answer to the last click, and the props until
	   then — keyed by slug, because a list re-uses this component for a
	   different build when it re-sorts, and an unkeyed override would follow the
	   count onto a row it never belonged to. */
	let pending = $state<{ slug: string; votes: number; voted: boolean } | null>(null);
	let busy = $state(false);

	const shown = $derived(
		pending && pending.slug === slug ? pending : { votes, voted }
	);
	const count = $derived(shown.votes);
	const mine = $derived(shown.voted);

	async function vote() {
		if (busy) return;
		busy = true;

		const before = pending;
		// optimistic: the arrow fills before the round trip, and rolls back to
		// whatever it showed if the server disagrees
		pending = { slug, votes: count + (mine ? -1 : 1), voted: !mine };

		try {
			const r = await fetch(`/api/builds/${slug}/vote`, { method: 'POST' });
			if (r.status === 401) {
				pending = before;
				onunauthorised();
				return;
			}
			if (!r.ok) {
				pending = before;
				return;
			}
			const result = (await r.json()) as { votes: number; voted: boolean };
			pending = { slug, ...result };
			onchange?.(result);
		} catch {
			pending = before;
		} finally {
			busy = false;
		}
	}
</script>

<button
	type="button"
	class="vote"
	class:on={mine}
	onclick={vote}
	aria-pressed={mine}
	aria-label={mine ? 'Remove your upvote' : 'Upvote this build'}
	title={mine ? 'Remove your upvote' : 'Upvote this build'}
>
	<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
		<path
			d="M12 4l7 8h-4v8h-6v-8H5z"
			fill={mine ? 'currentColor' : 'none'}
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linejoin="round"
		/>
	</svg>
	<span class="count">{count}</span>
</button>

<style>
	.vote {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		color: var(--text-dim);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}

	.vote:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.vote.on {
		border-color: var(--accent);
		color: var(--accent);
	}

	.count {
		min-width: 1.5ch;
		text-align: right;
	}
</style>
