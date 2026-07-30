<script lang="ts">
	/**
	 * "You need an account for that."
	 *
	 * Shown when a signed-out visitor upvotes or publishes. A dialog rather than
	 * a redirect, because both actions happen with a build on screen that the
	 * visitor would lose — and because the honest answer right now is not "sign
	 * in" but "sign-in is not live yet", which a redirect to EXBO cannot say.
	 *
	 * Uses <dialog>: focus trapping, Escape, and the backdrop come from the
	 * platform rather than from three hundred lines of our own.
	 */
	import { Button } from 'sveltekit-commons';

	interface Props {
		/** what the visitor was trying to do, for the first line */
		action?: 'vote' | 'publish';
		open: boolean;
		onclose: () => void;
	}

	let { action = 'vote', open, onclose }: Props = $props();

	let dialog = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	const line = $derived(
		action === 'vote'
			? 'Upvoting takes an account — one vote per person is the whole point of it.'
			: 'Publishing takes an account, so the build has an author and can be managed later.'
	);
</script>

<dialog bind:this={dialog} onclose={onclose}>
	<h2>Connect your EXBO account</h2>
	<p>{line}</p>

	<p class="note">
		Sign-in is built but not live yet: this site's EXBO API application is still waiting on
		approval. <a href="/auth/unavailable">What that means</a>.
	</p>

	<p class="note">
		Nothing else needs it. The calculator is open to everyone, and a build is fully described by
		its link — you can share this one right now.
	</p>

	<div class="actions">
		<Button href="/auth/exbo">Connect EXBO account</Button>
		<Button variant="ghost" onclick={onclose}>Not now</Button>
	</div>
</dialog>

<style>
	dialog {
		width: min(30rem, calc(100vw - 2rem));
		padding: var(--space-5);
		border: var(--border-width) solid var(--border-strong);
		border-radius: var(--radius-3);
		background: var(--surface-raised);
		color: var(--text);
	}

	dialog::backdrop {
		background: rgb(0 0 0 / 0.6);
	}

	h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--text-lg);
	}

	p {
		margin: 0 0 var(--space-3);
		max-width: 48ch;
	}

	.note {
		font-size: var(--text-sm);
		color: var(--text-faint);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
</style>
