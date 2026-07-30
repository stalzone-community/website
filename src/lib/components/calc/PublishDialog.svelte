<script lang="ts">
	/**
	 * Publishing a build, or changing what it says once published.
	 *
	 * Visibility lives here rather than as a separate toggle because it is part
	 * of the same document: "make private" is a publish with one field changed,
	 * and giving it its own control implies an ordering ("publish, then hide")
	 * that does not exist.
	 *
	 * The tags mirror how this community already sorts builds — one required
	 * answer to what it is for, any number of where you use it.
	 */
	import { Button } from 'sveltekit-commons';
	import {
		BUILD_TAGS,
		ERROR_MESSAGES,
		MAX_NAME,
		TAG_LABELS,
		validateDraft,
		type PublishedBuild,
		type Visibility
	} from '$lib/calc/publish';

	interface Props {
		open: boolean;
		/** the build being published, as an encoded query string */
		query: string;
		name: string;
		tags?: string[];
		visibility?: Visibility;
		/** set when editing something already published */
		slug?: string;
		onclose: () => void;
		onpublished: (build: PublishedBuild) => void;
		/** raised when the server says the caller is not signed in */
		onunauthorised: () => void;
	}

	let {
		open,
		query,
		name: initialName,
		tags: initialTags = [],
		visibility: initialVisibility = 'public',
		slug,
		onclose,
		onpublished,
		onunauthorised
	}: Props = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let name = $state('');
	let tags = $state<string[]>([]);
	let visibility = $state<Visibility>('public');
	let busy = $state(false);
	let failure = $state<string | null>(null);

	/* Reset from the props each time it opens, not on every prop change — the
	   fields are the visitor's while the dialog is up. */
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			name = initialName;
			tags = [...initialTags];
			visibility = initialVisibility;
			failure = null;
			dialog.showModal();
		}
		if (!open && dialog.open) dialog.close();
	});

	const errors = $derived(validateDraft({ name, query, tags, visibility }));

	function toggleType(tag: string) {
		// exactly one: picking another replaces it
		tags = [tag, ...tags.filter((t) => !(BUILD_TAGS.type as readonly string[]).includes(t))];
	}

	function togglePlace(tag: string) {
		tags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
	}

	async function submit() {
		if (errors.length || busy) return;
		busy = true;
		failure = null;
		try {
			const r = await fetch('/api/builds', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ slug, name, query, tags, visibility })
			});

			if (r.status === 401) {
				onclose();
				onunauthorised();
				return;
			}
			if (!r.ok) {
				const body = (await r.json().catch(() => ({}))) as { error?: string };
				failure =
					body.error === 'storage-unavailable'
						? 'Build storage is not configured on this server yet.'
						: 'That could not be published. Try again in a moment.';
				return;
			}

			const { build } = (await r.json()) as { build: PublishedBuild };
			onpublished(build);
			onclose();
		} catch {
			failure = 'No connection to the server.';
		} finally {
			busy = false;
		}
	}
</script>

<dialog bind:this={dialog} onclose={onclose}>
	<h2>{slug ? 'Update build' : 'Publish build'}</h2>

	<label class="field">
		<span>Name</span>
		<input type="text" bind:value={name} maxlength={MAX_NAME} placeholder="Rad-proof runner" />
	</label>

	<fieldset>
		<legend>What is it for?</legend>
		<div class="tags">
			{#each BUILD_TAGS.type as tag (tag)}
				<button
					type="button"
					class="tag"
					class:on={tags.includes(tag)}
					onclick={() => toggleType(tag)}
				>
					{TAG_LABELS[tag]}
				</button>
			{/each}
		</div>
	</fieldset>

	<fieldset>
		<legend>Where? <span class="optional">optional</span></legend>
		<div class="tags">
			{#each BUILD_TAGS.place as tag (tag)}
				<button
					type="button"
					class="tag"
					class:on={tags.includes(tag)}
					onclick={() => togglePlace(tag)}
				>
					{TAG_LABELS[tag]}
				</button>
			{/each}
		</div>
	</fieldset>

	<fieldset>
		<legend>Who can see it?</legend>
		<label class="radio">
			<input type="radio" value="public" bind:group={visibility} />
			<span>
				<b>Public</b> — listed for everyone, and can be upvoted.
			</span>
		</label>
		<label class="radio">
			<input type="radio" value="private" bind:group={visibility} />
			<span>
				<b>Private</b> — kept on your account, visible only to you.
			</span>
		</label>
	</fieldset>

	{#if errors.length}
		<ul class="errors">
			{#each errors as e (e)}
				<li>{ERROR_MESSAGES[e]}</li>
			{/each}
		</ul>
	{/if}

	{#if failure}
		<p class="failure">{failure}</p>
	{/if}

	<div class="actions">
		<Button onclick={submit} disabled={errors.length > 0 || busy}>
			{busy ? 'Saving…' : slug ? 'Save changes' : 'Publish'}
		</Button>
		<Button variant="ghost" onclick={onclose}>Cancel</Button>
	</div>
</dialog>

<style>
	dialog {
		width: min(32rem, calc(100vw - 2rem));
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
		margin: 0 0 var(--space-4);
		font-size: var(--text-lg);
	}

	.field {
		display: grid;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
	}

	.field span,
	legend {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.field input {
		width: 100%;
	}

	fieldset {
		margin: 0 0 var(--space-4);
		padding: 0;
		border: none;
	}

	.optional {
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-faint);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.tag {
		padding: var(--space-1) var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: 99px;
		background: var(--surface);
		color: var(--text-dim);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.tag.on {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.radio {
		display: flex;
		align-items: start;
		gap: var(--space-2);
		margin-top: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-dim);
	}

	.errors {
		margin: 0 0 var(--space-3);
		padding-left: var(--space-4);
		font-size: var(--text-sm);
		color: var(--warn);
	}

	.failure {
		margin: 0 0 var(--space-3);
		font-size: var(--text-sm);
		color: var(--danger);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
