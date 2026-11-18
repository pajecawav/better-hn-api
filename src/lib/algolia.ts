import type { H3Event } from "nitro";
import { defineCachedFunction } from "nitro/cache";

import type { HackerNewsItemTree } from "./types";

// https://hn.algolia.com/api/v1/items/:id returns the whole comment tree in
// one request — orders of magnitude fewer round trips than walking the
// Firebase database per node. Trade-offs: dead/deleted comments are omitted,
// fresh items are indexed with a small delay, and the API is rate limited.

const ALGOLIA_ITEM_URL = "https://hn.algolia.com/api/v1/items/";
const REQUEST_TIMEOUT_MS = 15_000;

// Circuit breaker: after a 429 we stop calling the API entirely for a
// cooldown window. Repeated rate limits escalate the window up to a cap;
// the Retry-After header (seconds) wins when it asks for longer.
const COOLDOWN_BASE_MS = 60_000;
const COOLDOWN_MAX_MS = 5 * 60_000;
let cooldownUntil = 0;
let cooldownEscalation = 1;

export const algoliaRateLimited = (): boolean => Date.now() < cooldownUntil;

const enterCooldown = (retryAfterHeader: string | null) => {
	const seconds = Number(retryAfterHeader);
	const fromHeader = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;

	const escalated = Math.min(COOLDOWN_BASE_MS * cooldownEscalation, COOLDOWN_MAX_MS);
	const cooldownMs = Math.max(escalated, fromHeader);

	cooldownEscalation = Math.min(
		cooldownEscalation * 2,
		Math.ceil(COOLDOWN_MAX_MS / COOLDOWN_BASE_MS),
	);
	cooldownUntil = Date.now() + cooldownMs;

	console.warn(`[algolia] rate limited, backing off for ${Math.round(cooldownMs / 1000)}s`);
};

const leaveCooldown = () => {
	cooldownUntil = 0;
	cooldownEscalation = 1;
};

// Test hook: bun test files share module state, so tests need a way to
// start from a clean breaker.
export const resetAlgoliaRateLimit = leaveCooldown;

export class AlgoliaRateLimitError extends Error {
	constructor() {
		super("algolia: rate limited, cooldown active");
		this.name = "AlgoliaRateLimitError";
	}
}

interface AlgoliaNode {
	id: number;
	type: string;
	author: string | null;
	created_at_i: number;
	title: string | null;
	text: string | null;
	url: string | null;
	points: number | null;
	parent_id: number | null;
	children?: AlgoliaNode[];
}

const mapNode = (node: AlgoliaNode): HackerNewsItemTree => ({
	item: {
		id: node.id,
		type: node.type as HackerNewsItemTree["item"]["type"],
		by: node.author ?? "",
		time: node.created_at_i,
		text: node.text ?? "",
		parent: node.parent_id ?? 0,
		url: node.url ?? undefined,
		score: node.points ?? 0,
		title: node.title ?? "",
	},
	comments: (node.children ?? []).map(mapNode),
});

export const resolveAlgoliaItem = defineCachedFunction(
	async (_event: H3Event, id: number): Promise<HackerNewsItemTree | null> => {
		// Fail fast without touching the network while the cooldown lasts.
		if (algoliaRateLimited()) {
			throw new AlgoliaRateLimitError();
		}

		const response = await fetch(`${ALGOLIA_ITEM_URL}${id}`, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			headers: { accept: "application/json" },
		});

		if (response.status === 429) {
			enterCooldown(response.headers.get("retry-after"));
			throw new AlgoliaRateLimitError();
		}

		if (response.status === 404) {
			// Not indexed (yet) — the caller falls back to Firebase.
			return null;
		}

		if (!response.ok) {
			throw new Error(`algolia: unexpected status ${response.status}`);
		}

		leaveCooldown();

		return mapNode((await response.json()) as AlgoliaNode);
	},
	{
		base: "hn",
		name: "algolia-item",
		swr: true,
		maxAge: 60,
		staleMaxAge: 300,
		getKey: (_, id) => `algolia-item/${id}`,
	},
);
