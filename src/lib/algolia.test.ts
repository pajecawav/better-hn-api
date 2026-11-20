import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";

import type { H3Event } from "nitro";

import { algoliaRateLimited, resetAlgoliaRateLimit, resolveAlgoliaItem } from "./algolia";

// The lib resolves `fetch` from the global scope on every call.
const realFetch = globalThis.fetch;
const fetchMock = mock((_url: string | URL | Request, _init?: RequestInit) =>
	Promise.resolve(new Response()),
);
globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

const event = {} as H3Event;

// Asserts that fn rejects with an error message matching the pattern.
const expectRejects = async (fn: () => unknown, pattern: RegExp) => {
	try {
		await fn();
	} catch (error) {
		expect((error as Error).message).toMatch(pattern);
		return;
	}

	throw new Error(`expected a rejection matching ${String(pattern)}`);
};

const algoliaStory = {
	id: 8863,
	type: "story",
	author: "dhouston",
	created_at_i: 1175714200,
	title: "My YC app",
	text: null,
	url: "https://example.com/app",
	points: 104,
	parent_id: null,
	children: [
		{
			id: 9224,
			type: "comment",
			author: "BrandonM",
			created_at_i: 1175714300,
			title: null,
			text: "I have a few qualms",
			url: null,
			points: null,
			parent_id: 8863,
			children: [],
		},
		{
			id: 9229,
			type: "comment",
			author: "peter",
			created_at_i: 1175714500,
			title: null,
			text: "Nice",
			url: null,
			points: null,
			parent_id: 8863,
			children: [],
		},
	],
};

const jsonResponse = (body: unknown, init?: ResponseInit) =>
	new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
		...init,
	});

beforeEach(() => {
	resetAlgoliaRateLimit();
	fetchMock.mockReset();
	globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
	setSystemTime(new Date("2026-11-19T12:00:00Z"));
});

afterAll(() => {
	globalThis.fetch = realFetch;
	setSystemTime();
});

describe("resolveAlgoliaItem", () => {
	test("maps the algolia tree to a hacker news item tree", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(algoliaStory));

		const tree = await resolveAlgoliaItem(event, 8863);

		expect(tree).toEqual({
			item: {
				id: 8863,
				type: "story",
				by: "dhouston",
				time: 1175714200,
				url: "https://example.com/app",
				score: 104,
				title: "My YC app",
			},
			comments: [
				{ item: expect.objectContaining({ id: 9224, parent: 8863 }), comments: [] },
				{ item: expect.objectContaining({ id: 9229, parent: 8863 }), comments: [] },
			],
		});
		// comment nodes carry exactly the fields a firebase comment has —
		// no title/points noise on leaves, no parent on the root
		const [firstComment] = tree?.comments ?? [];
		expect(firstComment ? Object.keys(firstComment.item).toSorted() : []).toEqual([
			"by",
			"id",
			"parent",
			"text",
			"time",
			"type",
		]);
		expect("parent" in (tree?.item ?? {})).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://hn.algolia.com/api/v1/items/8863");
		expect(init?.headers).toMatchObject({
			accept: "application/json",
			"user-agent": "better-hn-api (+https://api.bhn.pajecawav.dev)",
		});
	});

	test("returns null on 404 so the caller can fall back", async () => {
		fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));

		expect(await resolveAlgoliaItem(event, 7001)).toBeNull();
		expect(algoliaRateLimited()).toBe(false);
	});

	test("caches 404 misses for the cache window (negative cache)", async () => {
		fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));

		expect(await resolveAlgoliaItem(event, 9101)).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// even though algolia "has" the item now, the cached null wins —
		// not-yet-indexed items don't hammer the api until the entry expires
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ ...algoliaStory, id: 9101 }), {
				headers: { "content-type": "application/json" },
			}),
		);

		expect(await resolveAlgoliaItem(event, 9101)).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("does not call the api again while the cooldown is active", async () => {
		fetchMock.mockResolvedValueOnce(new Response("rate limit", { status: 429 }));

		await expectRejects(() => resolveAlgoliaItem(event, 7002), /rate limited/);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// Fail fast without a network round trip...
		await expectRejects(() => resolveAlgoliaItem(event, 7003), /cooldown active/);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		expect(algoliaRateLimited()).toBe(true);

		// ...for the whole base cooldown window.
		setSystemTime(new Date("2026-11-19T12:00:59Z"));
		await expectRejects(() => resolveAlgoliaItem(event, 7004), /cooldown active/);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		setSystemTime(new Date("2026-11-19T12:01:01Z"));
		expect(algoliaRateLimited()).toBe(false);
	});

	test("honours the retry-after header when it asks for longer", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response("rate limit", { status: 429, headers: { "retry-after": "600" } }),
		);

		await expectRejects(() => resolveAlgoliaItem(event, 7005), /rate limited/);

		setSystemTime(new Date("2026-11-19T12:05:00Z"));
		expect(algoliaRateLimited()).toBe(true);
	});

	test("escalates the cooldown on repeated rate limits", async () => {
		// First 429 at 12:00:00 → 60s cooldown, escalation factor becomes 2.
		fetchMock.mockResolvedValueOnce(new Response("rate limit", { status: 429 }));
		await expectRejects(() => resolveAlgoliaItem(event, 7006), /rate limited/);

		// Jump past the first window, hit a second 429 at 12:02:00.
		setSystemTime(new Date("2026-11-19T12:02:00Z"));
		fetchMock.mockResolvedValueOnce(new Response("rate limit", { status: 429 }));
		await expectRejects(() => resolveAlgoliaItem(event, 7007), /rate limited/);
		expect(fetchMock).toHaveBeenCalledTimes(2);

		// Second window is escalated to 120s: still blocked at 12:03:00...
		setSystemTime(new Date("2026-11-19T12:03:00Z"));
		expect(algoliaRateLimited()).toBe(true);

		// ...and open again after 12:04:00.
		setSystemTime(new Date("2026-11-19T12:04:01Z"));
		expect(algoliaRateLimited()).toBe(false);
	});

	test("a successful call resets the escalation", async () => {
		fetchMock.mockResolvedValueOnce(new Response("rate limit", { status: 429 }));
		await expectRejects(() => resolveAlgoliaItem(event, 7008), /rate limited/);

		setSystemTime(new Date("2026-11-19T12:02:00Z"));

		// Success resets both the cooldown and the escalation factor.
		fetchMock.mockResolvedValueOnce(jsonResponse({ ...algoliaStory, id: 7009 }));
		await resolveAlgoliaItem(event, 7009);

		// The next 429 gets the base 60s window again, not the escalated one.
		fetchMock.mockResolvedValueOnce(new Response("rate limit", { status: 429 }));
		await expectRejects(() => resolveAlgoliaItem(event, 7010), /rate limited/);

		setSystemTime(new Date("2026-11-19T12:02:59Z"));
		expect(algoliaRateLimited()).toBe(true);

		setSystemTime(new Date("2026-11-19T12:03:01Z"));
		expect(algoliaRateLimited()).toBe(false);

		// Leave the breaker closed for other test files (module state is
		// shared between bun test files in one run).
		fetchMock.mockResolvedValueOnce(jsonResponse({ ...algoliaStory, id: 7011 }));
		await resolveAlgoliaItem(event, 7011);
	});
});
