<script lang="ts">
	import { FeedbackForm } from 'sveltekit-commons/app';

	let { form } = $props();
</script>

<svelte:head>
	<title>Feedback — Stalzone</title>
	<meta
		name="description"
		content="Spotted a wrong stat, a missing item, or have an idea for Stalzone? Send it straight to the maintainer."
	/>
</svelte:head>

<section class="hero">
	<h1>Feedback</h1>
	<p class="lede">
		Spotted a wrong stat, a missing item, or have an idea for the site? Leave a note below — it goes
		straight to the maintainer. Item data is generated from the game's own database, so a stat that
		looks wrong is worth reporting: it usually means the site is reading the wrong field.
	</p>
</section>

<FeedbackForm
	{form}
	messagePlaceholder="What's wrong, missing, or worth adding?"
	namePlaceholder="In-game name, clan…"
/>

<style>
	.hero {
		margin-bottom: var(--space-6);
	}

	.lede {
		margin-top: var(--space-3);
		max-width: 60ch;
		color: var(--text-dim);
	}
</style>
