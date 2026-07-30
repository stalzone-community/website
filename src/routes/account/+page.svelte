<script lang="ts">
	/**
	 * Account settings — where the cog on the top-bar chip goes.
	 *
	 * Resolved on the client for the same reason the chip is: the page is
	 * prerendered, so the HTML cannot know who asked for it. Signed out, this is
	 * the long form of the connect button rather than a redirect — a page that
	 * bounces you somewhere is worse at explaining itself than one that stays.
	 */
	import { onMount } from 'svelte';
	import { Button } from 'sveltekit-commons';
	import { loadSavedBuilds, savedBuilds } from '$lib/calc/storage.svelte';

	interface Account {
		id: string;
		name: string;
	}

	let account = $state<Account | null>(null);
	let resolved = $state(false);
	let mounted = $state(false);

	onMount(async () => {
		loadSavedBuilds();
		mounted = true;
		try {
			const r = await fetch('/auth/me');
			if (r.ok) account = ((await r.json()) as { user: Account | null }).user;
		} catch {
			// offline — treated as signed out, which is what the page can prove
		} finally {
			resolved = true;
		}
	});

	const localCount = $derived(mounted ? savedBuilds().length : 0);
</script>

<svelte:head>
	<title>Account — Stalzone</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<h1>Account</h1>

{#if !resolved}
	<p class="quiet">Checking…</p>
{:else if account}
	<section>
		<h2>Signed in</h2>
		<p class="who">
			<span class="name">{account.name}</span>
			<span class="quiet">EXBO account</span>
		</p>
		<Button href="/auth/logout" variant="ghost">Sign out</Button>
	</section>
{:else}
	<section>
		<h2>Not signed in</h2>
		<p class="lede">
			Connecting your EXBO account will let you publish builds to the community list and upvote
			other people's. Everything else on this site works without it.
		</p>
		<Button href="/auth/exbo">Connect EXBO account</Button>
	</section>
{/if}

<section>
	<h2>Builds on this device</h2>
	<p class="quiet">
		{#if localCount}
			{localCount} build{localCount === 1 ? '' : 's'} saved in this browser.
			<a href="/builds">Open them</a>. They stay here until you delete them, and will upload to your
			account once publishing is live.
		{:else}
			Nothing saved yet — the <a href="/builds/create">calculator</a> keeps builds in this browser when
			you save them.
		{/if}
	</p>
</section>

<section>
	<h2>What we store</h2>
	<p class="quiet">
		If you sign in: your EXBO account id and display name, in a signed cookie, for thirty days.
		Nothing else — no email, no game data, and no access token kept after sign-in. Builds you save
		locally never leave your browser.
	</p>
</section>

<style>
	h1 {
		margin-bottom: var(--space-5);
	}

	section + section {
		margin-top: var(--space-6);
	}

	h2 {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.who {
		display: grid;
		gap: 2px;
		margin: 0 0 var(--space-3);
	}

	.name {
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.lede {
		max-width: 60ch;
		color: var(--text-dim);
	}

	.quiet {
		max-width: 62ch;
		color: var(--text-faint);
		font-size: var(--text-sm);
	}
</style>
