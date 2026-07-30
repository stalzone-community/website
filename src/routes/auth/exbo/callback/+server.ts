/**
 * Where EXBO sends the visitor back.
 *
 * Exchanges the code for a token, asks who it belongs to, and keeps only the id
 * and display name — the access token itself is not stored. Nothing this site
 * does on a visitor's behalf needs it: builds are ours, and the public API data
 * is fetched with the application's own credentials.
 */
import { error, redirect } from '@sveltejs/kit';
import {
	authConfigured,
	encodeSession,
	newSession,
	SESSION_COOKIE,
	SESSION_TTL,
	STATE_COOKIE
} from '$lib/server/session';
import type { RequestHandler } from './$types.ts';

export const prerender = false;

interface TokenResponse {
	access_token?: string;
}

interface UserResponse {
	id?: number | string;
	uuid?: string;
	username?: string;
	nickname?: string;
	name?: string;
}

export const GET: RequestHandler = async ({ cookies, fetch, url }) => {
	if (!authConfigured()) redirect(303, '/auth/unavailable');

	const returned = url.searchParams.get('state');
	const expected = cookies.get(STATE_COOKIE);
	cookies.delete(STATE_COOKIE, { path: '/' });
	if (!returned || !expected || returned !== expected) {
		error(400, 'Sign-in could not be verified. Please try again.');
	}

	const code = url.searchParams.get('code');
	if (!code) error(400, url.searchParams.get('error') ?? 'EXBO did not return an authorisation code.');

	const token = await fetch('https://exbo.net/oauth/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: process.env.EXBO_CLIENT_ID!,
			client_secret: process.env.EXBO_CLIENT_SECRET!,
			code,
			grant_type: 'authorization_code',
			redirect_uri: `${url.origin}/auth/exbo/callback`
		})
	});
	if (!token.ok) error(502, 'EXBO refused the sign-in. Please try again.');

	const { access_token } = (await token.json()) as TokenResponse;
	if (!access_token) error(502, 'EXBO returned no access token.');

	const who = await fetch('https://exbo.net/oauth/user', {
		headers: { authorization: `Bearer ${access_token}` }
	});
	if (!who.ok) error(502, 'EXBO would not say who signed in.');

	const user = (await who.json()) as UserResponse;
	const id = String(user.id ?? user.uuid ?? '');
	if (!id) error(502, 'EXBO returned an account with no id.');

	cookies.set(
		SESSION_COOKIE,
		encodeSession(newSession(id, user.nickname ?? user.username ?? user.name ?? 'Stalker')),
		{
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: SESSION_TTL
		}
	);

	redirect(303, '/builds');
};
