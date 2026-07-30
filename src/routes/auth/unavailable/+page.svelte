<script lang="ts">
	/**
	 * Where the connect button lands while the API application is pending.
	 *
	 * A dead button with no explanation reads as a broken site. This says what
	 * is actually true — the flow is built, the credentials are not issued yet —
	 * and points at what still works without an account.
	 */
</script>

<svelte:head>
	<title>EXBO sign-in — Stalzone</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<h1>EXBO sign-in isn't live yet</h1>

<p class="lede">
	Connecting your EXBO account is built and waiting on one thing: this site's API application still
	has to be approved by EXBO. Until it is, there are no credentials to sign you in with.
</p>

<h2>What works without it</h2>
<ul>
	<li>
		The <a href="/builds/create">build calculator</a> — every slot, every number, no account needed.
	</li>
	<li>
		<strong>Sharing.</strong> A build lives in its own link. Copy the URL and it opens exactly as you
		left it, for anyone.
	</li>
	<li>
		<strong>Saving.</strong> Builds you save are kept in this browser and listed on
		<a href="/builds">your builds</a>.
	</li>
</ul>

<h2>What needs the account</h2>
<p>
	Publishing a build to a public, community-wide list, and upvoting other people's — both need a
	name attached and one vote per person, which is what signing in provides. Builds saved here now
	will upload as they are when it lands.
</p>

<p class="back"><a href="/builds">← Back to builds</a></p>

<style>
	.lede {
		max-width: 60ch;
		color: var(--text-dim);
	}

	h2 {
		margin-top: var(--space-5);
		font-size: var(--text-base);
	}

	ul {
		max-width: 60ch;
		color: var(--text-dim);
	}

	p {
		max-width: 60ch;
	}

	.back {
		margin-top: var(--space-5);
		font-size: var(--text-sm);
	}
</style>
