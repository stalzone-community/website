<script lang="ts">
	/**
	 * Opt-in for emission push notifications.
	 *
	 * The whole component is a click handler around $lib/push.ts, plus the honest
	 * answer for the browsers where this cannot work. That second part is most of
	 * the markup: a permission prompt is one-shot per origin, so the interesting
	 * states are the ones where we must NOT prompt — iOS before the site is
	 * installed, and a browser where the user already said no and the only fix is
	 * in their settings, not ours.
	 */
	import { Button, Toggle } from 'sveltekit-commons';
	import { REGIONS, type RegionId } from '$lib/regions';
	import { currentRegions, pushSupport, subscribe, unsubscribe, type PushSupport } from '$lib/push';

	let { region }: { region?: RegionId } = $props();

	let support = $state<PushSupport | null>(null);
	let permission = $state<NotificationPermission>('default');
	let chosen = $state(new Set<RegionId>());
	let subscribed = $state(false);
	let busy = $state(false);
	let note = $state<string | null>(null);

	/* Mount only. Nothing reactive is read here — `region` is read inside the
	   promise callback, outside the tracking context — so this does not re-run. */
	$effect(() => {
		support = pushSupport();
		if (typeof Notification !== 'undefined') permission = Notification.permission;

		void currentRegions().then((regions) => {
			if (regions?.length) {
				chosen = new Set(regions);
				subscribed = true;
			} else if (region) {
				// arrived from a notification for one region — preselect it
				chosen = new Set([region]);
			}
		});
	});

	function toggleRegion(id: RegionId, on: boolean): void {
		const next = new Set(chosen);
		if (on) next.add(id);
		else next.delete(id);
		chosen = next;
	}

	async function enable(): Promise<void> {
		busy = true;
		note = null;
		const result = await subscribe([...chosen]);
		busy = false;
		permission = typeof Notification !== 'undefined' ? Notification.permission : permission;

		if (result.status === 'subscribed') {
			subscribed = true;
			chosen = new Set(result.regions);
			note = 'Alerts on. You can close the site.';
		} else if (result.status === 'denied') {
			note = null; // the blocked-permission panel says it better
		} else if (result.status === 'error') {
			note = result.message;
		}
	}

	async function disable(): Promise<void> {
		busy = true;
		note = null;
		const result = await unsubscribe();
		busy = false;
		subscribed = false;
		note = result.ok ? 'Alerts off.' : (result.message ?? 'Could not turn alerts off.');
	}
</script>

<section class="alerts">
	<h2>Alert me</h2>

	{#if support === null}
		<!-- first render, before the effect has run: say nothing rather than
		     flashing an "unsupported" that is about to be wrong -->
		<p class="lede">&nbsp;</p>
	{:else if !support.ok && support.reason === 'ios-needs-install'}
		<p class="lede">
			On iPhone and iPad, notifications need the site added to the home screen first: tap
			<b>Share</b>, then <b>Add to Home Screen</b>, and open it from there.
		</p>
	{:else if !support.ok}
		<p class="lede">This browser cannot receive push notifications.</p>
	{:else if permission === 'denied'}
		<p class="lede">
			Notifications are blocked for this site. Your browser will not ask again — it has to be
			re-allowed in the site settings next to the address bar.
		</p>
	{:else}
		<p class="lede">
			A notification when an emission starts, and another when it is safe to go outside. The site
			does not have to be open.
		</p>

		<div class="regions">
			{#each REGIONS as r (r.id)}
				<Toggle
					checked={chosen.has(r.id)}
					label={r.name}
					disabled={busy}
					onchange={(event: Event) =>
						toggleRegion(r.id, (event.currentTarget as HTMLInputElement).checked)}
				/>
			{/each}
		</div>

		<div class="actions">
			<Button onclick={enable} disabled={busy || chosen.size === 0}>
				{subscribed ? 'Update alerts' : 'Turn on alerts'}
			</Button>
			{#if subscribed}
				<Button variant="ghost" onclick={disable} disabled={busy}>Turn off</Button>
			{/if}
		</div>

		{#if note}<p class="note" role="status">{note}</p>{/if}
	{/if}
</section>

<style>
	.alerts {
		padding: var(--space-4);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-3);
		background: var(--surface);
	}

	h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-base);
	}

	.lede {
		margin: 0;
		max-width: 52ch;
		color: var(--text-dim);
		font-size: var(--text-sm);
	}

	.regions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0 var(--space-4);
		margin: var(--space-3) 0;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.note {
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
		color: var(--text-dim);
	}
</style>
