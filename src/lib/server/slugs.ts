/**
 * id → canonical URL slug, built once.
 *
 * Its own module rather than part of $lib/server/entities because two things
 * need it and they sit on opposite sides of that module: entity resolution
 * (high level, needs the tech tree to decide capabilities) and the tech tree
 * itself (low level, needs a slug to link a node). Leaving `slugFor` inside
 * entities.ts made those two import each other.
 *
 * The English name drives the slug so a URL does not change when a visitor
 * switches language.
 */
import { items } from './catalogue.ts';
import { slugify } from '../entities.ts';

const slugById = new Map<string, string>(items.map((i) => [i.id, slugify(i.name.en, i.id)]));

export function slugFor(id: string): string {
	return slugById.get(id) ?? id;
}

/** Every entity's canonical path — used by the prerender entry generator. */
export function allSlugs(): string[] {
	return [...slugById.values()];
}
