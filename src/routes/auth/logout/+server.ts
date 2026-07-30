/**
 * Sign out. A GET because it is a plain link in the account chip; it destroys
 * only the visitor's own cookie, so there is nothing here for a forged request
 * to accomplish beyond signing them out.
 */
import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/session';
import type { RequestHandler } from './$types.ts';

export const prerender = false;

export const GET: RequestHandler = ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/');
};
