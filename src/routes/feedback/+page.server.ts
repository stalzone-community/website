import { fail } from '@sveltejs/kit';
import { readFeedbackForm, validateFeedback } from 'sveltekit-commons/feedback';
import { rateLimiter } from 'sveltekit-commons/rate-limit';
import { dbConfigured, insertFeedback } from '$lib/server/db';
import type { Actions } from './$types';

/**
 * The one route on this site that is not prerendered. The root layout sets
 * `prerender = true` for the whole catalogue; a form action needs a server.
 */
export const prerender = false;

/**
 * Per-IP flood guard. In memory, which is fine on one always-on machine — the
 * cost is that a deploy forgets every window. See sveltekit-commons/rate-limit.
 *
 * Only ACCEPTED submissions are charged (`allows` before, `record` after), so
 * a bot tripping the honeypot cannot spend the budget of a real visitor behind
 * the same address.
 */
const limiter = rateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const form = await request.formData().catch(() => null);
		if (!form) {
			return fail(400, {
				error: 'Invalid form submission.',
				values: { message: '', name: '', contact: '' }
			});
		}

		const { input, values } = readFeedbackForm(form);

		const v = validateFeedback(input);
		if (!v.ok) return fail(400, { error: v.error, values });

		if (!dbConfigured()) {
			return fail(503, { error: 'Feedback is not configured on this deployment.', values });
		}
		const ip = getClientAddress();
		if (!limiter.allows(ip)) {
			return fail(429, { error: 'Too many submissions — please try again later.', values });
		}

		// A throwing insert must not reach the error page: the visitor's text
		// only exists in this request, and a 500 renders a page that no longer
		// has it. Failing the action instead echoes it back into the textarea,
		// so a cluster hiccup costs a retry rather than the whole message.
		try {
			await insertFeedback({ createdAt: new Date().toISOString(), ...v.fields });
		} catch (e) {
			console.error('[feedback] insert failed:', e);
			return fail(503, { error: 'Could not save that just now — please try again.', values });
		}

		// after the insert, so a failed save does not spend the visitor's budget
		limiter.record(ip);
		return { success: true };
	}
};
