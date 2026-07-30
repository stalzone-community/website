/**
 * Start of "Sign in with EXBO".
 *
 * Authorization-code flow against exbo.net, per
 * https://eapi.stalcraft.net/auth.html. `scope` is sent empty because EXBO
 * currently defines none.
 *
 * Until the API application is approved there is no client id to send, so this
 * explains itself rather than bouncing the visitor to a broken authorize page.
 */
import { redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { authConfigured, STATE_COOKIE } from '$lib/server/session';
import type { RequestHandler } from './$types.ts';

export const prerender = false;

export const GET: RequestHandler = ({ cookies, url }) => {
	if (!authConfigured()) redirect(303, '/auth/unavailable');

	// CSRF: the callback only accepts a state it handed out itself
	const state = randomBytes(16).toString('base64url');
	cookies.set(STATE_COOKIE, state, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 600
	});

	const authorize = new URL('https://exbo.net/oauth/authorize');
	authorize.searchParams.set('client_id', process.env.EXBO_CLIENT_ID!);
	authorize.searchParams.set('redirect_uri', `${url.origin}/auth/exbo/callback`);
	authorize.searchParams.set('response_type', 'code');
	authorize.searchParams.set('scope', '');
	authorize.searchParams.set('state', state);

	redirect(303, authorize.toString());
};
