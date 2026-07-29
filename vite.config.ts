import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// Server libs read process.env directly so the same modules work in plain-node
	// CLI scripts (scripts/*.ts); vite only exposes .env to the $env modules, so
	// mirror it into process.env for `vite dev`/`preview`. Same pattern as UAR.
	Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

	return {
		server: { port: 6791 },
		preview: { port: 6791 },

		ssr: {
			// sveltekit-commons ships .svelte source rather than compiled output,
			// so Vite has to process it instead of leaving it to node's resolver.
			// It doubles as the guard on the package's server subpath: SvelteKit's
			// $lib/server import protection does not reach into node_modules, but
			// a bundled dependency at least makes a leak into the client bundle a
			// build error rather than something that ships.
			noExternal: ['sveltekit-commons']
		},
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries.
					// Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				// adapter-node from day one: phase 1 (item database, map, bestiary)
				// prerenders fine, but the auction tracker needs a server and a
				// mid-project adapter swap is not worth saving.
				adapter: adapter()
			})
		]
	};
});
