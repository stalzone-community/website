/**
 * Signed session cookies.
 *
 * No database and no session table: the only thing a session has to carry is
 * which EXBO account you are, and that fits in the cookie. A signature keeps it
 * honest — the payload is readable, but not writable by whoever holds it.
 *
 * HMAC-SHA256 over the JSON payload, base64url, `payload.signature`. Compared
 * with `timingSafeEqual`, because a byte-by-byte comparison of a signature
 * leaks how much of a forgery was right.
 *
 * Reads `process.env` rather than `$env/static/private` so the same module works
 * in the SvelteKit server and in a plain-node script — the convention the rest
 * of `$lib/server` follows.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Thirty days. Long enough that saving a build does not mean signing in again. */
export const SESSION_TTL = 30 * 24 * 60 * 60;

export const SESSION_COOKIE = 'sz_session';

/**
 * The OAuth `state` value, held between the redirect out and the callback back.
 * Here rather than beside the route that sets it: SvelteKit only allows a
 * `+server.ts` to export request handlers and a fixed set of options, so a
 * shared constant has to live outside the route tree.
 */
export const STATE_COOKIE = 'sz_oauth_state';

export interface Session {
	/** EXBO account id */
	id: string;
	/** display name, for the account chip */
	name: string;
	/** epoch seconds */
	exp: number;
}

export function authConfigured(): boolean {
	return Boolean(process.env.EXBO_CLIENT_ID && process.env.EXBO_CLIENT_SECRET && secret());
}

function secret(): string | undefined {
	return process.env.AUTH_SECRET;
}

function b64url(buf: Buffer | string): string {
	return Buffer.from(buf).toString('base64url');
}

function sign(payload: string, key: string): string {
	return createHmac('sha256', key).update(payload).digest('base64url');
}

export function encodeSession(session: Session): string {
	const key = secret();
	if (!key) throw new Error('AUTH_SECRET is not set');
	const payload = b64url(JSON.stringify(session));
	return `${payload}.${sign(payload, key)}`;
}

/** Returns null for anything that is not a currently valid, correctly signed
 *  session — expired, tampered with, or written by a different secret. */
export function decodeSession(token: string | undefined, now = Date.now()): Session | null {
	const key = secret();
	if (!token || !key) return null;

	const dot = token.lastIndexOf('.');
	if (dot <= 0) return null;
	const payload = token.slice(0, dot);
	const provided = Buffer.from(token.slice(dot + 1));
	const expected = Buffer.from(sign(payload, key));
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

	try {
		const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
		if (typeof session.id !== 'string' || typeof session.name !== 'string') return null;
		if (typeof session.exp !== 'number' || session.exp * 1000 < now) return null;
		return session;
	} catch {
		return null;
	}
}

export function newSession(id: string, name: string, now = Date.now()): Session {
	return { id, name, exp: Math.floor(now / 1000) + SESSION_TTL };
}

/** Just enough of a cookie jar for `currentUser` — what SvelteKit hands a
 *  server load or an endpoint, narrowed to the one method used. */
export interface CookieReader {
	get(name: string): string | undefined;
}

export interface User {
	id: string;
	name: string;
}

/**
 * Who is making this request, or null.
 *
 * A helper rather than a `handle` hook filling `locals`: everything that needs
 * a user here is a server route that can ask, and the hook file is shared with
 * work happening in parallel.
 *
 * DEV_FAKE_USER exists because EXBO has not issued credentials yet and the
 * publish/vote paths still have to be exercisable. It is read only when
 * `import.meta.env.DEV` — a production build cannot be talked into a fake
 * session by setting an environment variable.
 */
export function currentUser(cookies: CookieReader): User | null {
	const session = decodeSession(cookies.get(SESSION_COOKIE));
	if (session) return { id: session.id, name: session.name };

	if (import.meta.env.DEV && process.env.DEV_FAKE_USER) {
		return { id: `dev:${process.env.DEV_FAKE_USER}`, name: process.env.DEV_FAKE_USER };
	}
	return null;
}
