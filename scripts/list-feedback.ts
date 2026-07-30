/**
 * Print stored visitor feedback, newest first.
 *
 * The only reader of the `feedback` collection — nothing on the site displays
 * it. Creds come from .env, same as the seed scripts:
 *
 *   node --env-file=.env scripts/list-feedback.ts
 */

import { closeDb, db, type FeedbackDoc } from '../src/lib/server/db.ts';

const d = await db();
const docs = await d
	.collection<FeedbackDoc>('feedback')
	.find()
	.sort({ createdAt: -1 })
	.toArray();

if (!docs.length) {
	console.log('No feedback yet.');
} else {
	for (const f of docs) {
		const who = [f.name, f.contact].filter(Boolean).join(' · ');
		console.log(`── ${f.createdAt}${who ? `  (${who})` : ''}\n${f.message}\n`);
	}
	console.log(`${docs.length} entr${docs.length === 1 ? 'y' : 'ies'}.`);
}

// the pool keeps the event loop alive, so this has to be explicit
await closeDb();
