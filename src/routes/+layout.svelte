<script lang="ts">
	/* Order matters. The contract names the scale and shape but no colour; the
	   palette supplies the colours and may override anything above it, which
	   only works because it comes second. See sveltekit-commons/tokens.css. */
	import 'sveltekit-commons/tokens.css';
	import '$lib/styles/palette.css';
	import 'sveltekit-commons/base.css';
	import '$lib/styles/site.css';

	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { children } = $props();
</script>

<div class="shell">
	<header>
		<a class="brand" href="/">STALZONE<span>db</span></a>
		<nav>
			<a href="/items">Items</a>
		</nav>
		<div class="tools">
			<ThemeToggle />
		</div>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<p>
			Item data from
			<a href="https://github.com/EXBO-Studio/stalzone-database" rel="noreferrer">
				EXBO-Studio/stalzone-database
			</a>
			(Apache-2.0). STALZONE is a game by EXBO. This is an unofficial fan project.
		</p>
	</footer>
</div>

<style>
	.shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: var(--space-6);
		padding: var(--space-4) var(--space-5);
		border-bottom: var(--border-width) solid var(--border);
		background: var(--surface-sunken);
	}

	.brand {
		font-family: var(--font-mono);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-decoration: none;
	}

	.brand span {
		color: var(--accent);
	}

	nav {
		display: flex;
		gap: var(--space-4);
		font-size: var(--text-sm);
	}

	nav a {
		color: var(--text-dim);
		text-decoration: none;
	}

	nav a:hover {
		color: var(--text);
	}

	/* pushed to the right edge, so nav stays next to the brand */
	.tools {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	main {
		flex: 1;
		width: 100%;
		max-width: 76rem;
		margin: 0 auto;
		padding: var(--space-6) var(--space-5);
	}

	footer {
		border-top: var(--border-width) solid var(--border);
		padding: var(--space-4) var(--space-5);
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	@media (max-width: 40rem) {
		header {
			gap: var(--space-4);
		}
		main {
			padding: var(--space-5) var(--space-4);
		}
	}
</style>
