<script lang="ts">
	import CraftTree from '$lib/components/CraftTree.svelte';

	let { data } = $props();
	const t = $derived(data.tree);

	/* Deliberately not a component: if the graph is wrong this tells us whether
	   the numbers arriving are wrong or only what is drawn from them. */
	const sample = $derived(
		t.nodes.slice(0, 6).map((n) => `${n.kind[0]} x=${n.x} y=${n.y} w=${n.w}`).join('   ')
	);
	const columns = $derived([...new Set(t.nodes.map((n) => n.x))].sort((a, b) => a - b));
</script>

<svelte:head><title>lab · craft tree</title></svelte:head>

<h1>Craft tree — bare bench</h1>

<p class="facts">
	plane <b>{t.width}×{t.height}</b> · nodes <b>{t.nodes.length}</b> · wires <b>{t.conns.length}</b>
	· columns <b>{columns.length}</b>
</p>
<p class="facts">first six: {sample}</p>
<p class="facts">column x: {columns.join(', ')}</p>

<h2>1 — plain box, 70vh, no page CSS at all</h2>
<!-- A boundary, so a throw inside the component lands on the page instead of
     in a console nobody is looking at. Sections 2 and 3 prove the geometry and
     the transform are fine, so anything that surfaces here is the script. -->
<svelte:boundary>
	{#snippet failed(error)}
		<pre class="boom">CraftTree threw:
{(error as Error)?.stack ?? String(error)}</pre>
	{/snippet}
<div class="box">
	<CraftTree
		nodes={t.nodes}
		conns={t.conns}
		width={t.width}
		height={t.height}
		items={t.items}
		recipes={t.recipes}
		root={t.root}
	/>
</div>
</svelte:boundary>

<h2>2 — the same graph with no canvas: raw plane, scrolled</h2>
<!-- If this one lays out correctly and (1) does not, the fault is the
     transform or the viewport, not the geometry or the card styles. -->
<div class="raw">
	<div class="plane" style="width:{t.width}px; height:{t.height}px">
		{#each t.nodes as n (n.id)}
			<span
				class="dot"
				class:join={n.kind === 'recipe'}
				style="left:{n.x}px; top:{n.y}px; width:{n.w}px; height:{n.h}px"
			>{n.kind === 'item' ? (data.tree.items[n.ref]?.name?.en ?? n.ref) : '·'}</span>
		{/each}
	</div>
</div>

<h2>3 — the same plane, static transform, zero JavaScript</h2>
<!-- Section 1 is the canvas: CSS transform driven by my pan/zoom code.
     Section 2 is no transform at all, and it works.
     This is the transform WITHOUT the code — if it lays out correctly then the
     CSS and the card positioning are innocent and the bug is in the script. -->
<div class="still">
	<div class="plane scaled" style="width:{t.width}px; height:{t.height}px">
		{#each t.nodes as n (n.id)}
			<span
				class="dot"
				class:join={n.kind === 'recipe'}
				style="left:{n.x}px; top:{n.y}px; width:{n.w}px; height:{n.h}px"
			>{n.kind === 'item' ? (data.tree.items[n.ref]?.name?.en ?? n.ref) : '·'}</span>
		{/each}
	</div>
</div>

<style>
	.still {
		height: 40vh;
		overflow: hidden;
		border: 2px solid var(--warn);
	}

	/* the same shape the canvas applies, hard-coded */
	.scaled {
		transform-origin: 0 0;
		transform: translate(20px, 20px) scale(0.28);
	}

	h1 { font-size: var(--text-xl); margin: 0 0 var(--space-2); }
	h2 { font-size: var(--text-base); margin: var(--space-5) 0 var(--space-2); }

	.facts {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-dim);
		margin: 0 0 var(--space-1);
		overflow-wrap: anywhere;
	}

	/* an ordinary box with an ordinary height — nothing the entity page does */
	.box {
		height: 70vh;
		border: 2px solid var(--accent);
	}

	.boom {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		padding: var(--space-3);
		border: 2px solid var(--danger);
		color: var(--danger);
		font-size: var(--text-xs);
	}

	.raw {
		height: 40vh;
		overflow: auto;
		border: 2px dashed var(--border-strong);
	}

	.plane { position: relative; }

	.dot {
		position: absolute;
		box-sizing: border-box;
		display: block;
		overflow: hidden;
		font-size: 10px;
		line-height: 1.1;
		border: 1px solid var(--accent);
		background: var(--surface);
	}

	.dot.join {
		border-style: dashed;
		border-color: var(--text-faint);
	}
</style>
