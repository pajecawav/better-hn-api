import { afterAll, describe, expect, mock, test } from "bun:test";

import { expectHTTPError, makeEvent, setFirebaseData } from "../../test-utils";

// Import after test-utils: the route must resolve firebase/database against the mock.
const itemRoute = (await import("./[id].ts")).default;

// the algolia source calls the real network stack — mock global fetch for it.
const realFetch = globalThis.fetch;
const fetchMock = mock((_url: string | URL | Request) => Promise.resolve(new Response()));
globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

afterAll(() => {
	globalThis.fetch = realFetch;
});

describe("GET /item/:id via firebase (?source=fb)", () => {
	test("resolves the full comment tree without touching algolia", async () => {
		setFirebaseData("v0/item/8863", {
			id: 8863,
			type: "story",
			by: "dhouston",
			time: 1175714200,
			score: 104,
			title: "My YC app",
			descendants: 3,
			url: "https://example.com/app",
			kids: [9224, 9229],
		});
		setFirebaseData("v0/item/9224", {
			id: 9224,
			type: "comment",
			by: "BrandonM",
			time: 1175714300,
			parent: 8863,
			text: "I have a few qualms",
			kids: [9300],
		});
		setFirebaseData("v0/item/9300", {
			id: 9300,
			type: "comment",
			by: "dhouston",
			time: 1175714400,
			parent: 9224,
			text: "Fair points",
		});
		setFirebaseData("v0/item/9229", {
			id: 9229,
			type: "comment",
			by: "peter",
			time: 1175714500,
			parent: 8863,
			text: "Nice",
		});

		const item = await itemRoute(makeEvent({ params: { id: "8863" }, query: "source=fb" }));

		expect(item).toMatchObject({
			id: 8863,
			title: "My YC app",
			user: "dhouston",
			type: "link",
			comments_count: 3,
		});
		expect(item.comments).toHaveLength(2);

		const [first, second] = item.comments;
		expect(first).toMatchObject({ id: 9224, level: 0, parent: 8863 });
		expect(first.comments).toHaveLength(1);
		expect(first.comments[0]).toMatchObject({ id: 9300, level: 1, parent: 9224 });
		expect(first.comments[0]?.comments).toHaveLength(0);

		expect(second).toMatchObject({ id: 9229, level: 0, parent: 8863 });

		// the firebase walk must not leak into the algolia transport
		expect(fetchMock).toHaveBeenCalledTimes(0);
	});

	test("resolves the full comment tree again on a repeat traversal", async () => {
		// resolveItem caches the HackerNewsItem by reference; the first
		// traversal must not corrupt the cached object (the historical
		// `delete item.kids` mutation made the second traversal empty).
		setFirebaseData("v0/item/7001", {
			id: 7001,
			type: "story",
			by: "someone",
			time: 1794678190,
			score: 10,
			title: "Story",
			descendants: 1,
			parts: [7002, 7003],
			kids: [7004],
		});
		setFirebaseData("v0/item/7004", {
			id: 7004,
			type: "comment",
			by: "someone_else",
			time: 1794678191,
			parent: 7001,
			text: "hello",
		});

		const first = await itemRoute(makeEvent({ params: { id: "7001" }, query: "source=fb" }));
		const second = await itemRoute(makeEvent({ params: { id: "7001" }, query: "source=fb" }));

		expect(first.comments).toHaveLength(1);
		expect(second.comments).toHaveLength(1);
		expect(second.comments_count).toBe(1);
		// poll parts stay out of the response
		expect(second.comments[0]?.parts).toBeUndefined();
	});

	test("marks deleted comments as [deleted]", async () => {
		setFirebaseData("v0/item/6001", {
			id: 6001,
			type: "story",
			by: "someone",
			time: 1794678190,
			score: 1,
			title: "Story",
			descendants: 1,
			kids: [6002],
		});
		setFirebaseData("v0/item/6002", {
			id: 6002,
			type: "comment",
			by: "ghost",
			time: 1794678191,
			parent: 6001,
			deleted: true,
			text: "should not leak",
		});

		const item = await itemRoute(makeEvent({ params: { id: "6001" }, query: "source=fb" }));

		expect(item.comments[0]).toMatchObject({ id: 6002, deleted: true });
		expect(item.comments[0]?.content).toBe("[deleted]");
	});

	test("returns 404 for a missing item", async () => {
		await expectHTTPError(
			() => itemRoute(makeEvent({ params: { id: "7777" }, query: "source=fb" })),
			404,
		);
	});

	test("rejects a non-numeric id", async () => {
		await expectHTTPError(() => itemRoute(makeEvent({ params: { id: "abc" } })), 400);
	});
});

describe("GET /item/:id with ?source=algolia", () => {
	const algoliaPayload = (id: number, kidId: number, grandKidId: number) => ({
		id,
		type: "story",
		author: "someone",
		created_at_i: 1794678190,
		title: "Algolia story",
		text: null,
		url: "https://example.com/algolia",
		points: 10,
		parent_id: null,
		children: [
			{
				id: kidId,
				type: "comment",
				author: "commenter",
				created_at_i: 1794678191,
				title: null,
				text: "top comment",
				url: null,
				points: null,
				parent_id: id,
				children: [
					{
						id: grandKidId,
						type: "comment",
						author: "replier",
						created_at_i: 1794678192,
						title: null,
						text: "reply",
						url: null,
						points: null,
						parent_id: kidId,
						children: [],
					},
				],
			},
		],
	});

	const firebaseTree = (storyId: number, commentId: number) => {
		setFirebaseData(`v0/item/${storyId}`, {
			id: storyId,
			type: "story",
			by: "someone",
			time: 1794678190,
			score: 10,
			title: "Firebase story",
			descendants: 1,
			kids: [commentId],
		});
		setFirebaseData(`v0/item/${commentId}`, {
			id: commentId,
			type: "comment",
			by: "commenter",
			time: 1794678191,
			parent: storyId,
			text: "firebase comment",
		});
	};

	test("defaults to algolia when no source is given", async () => {
		fetchMock.mockReset();
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(algoliaPayload(7400, 7401, 7402)), {
				headers: { "content-type": "application/json" },
			}),
		);

		const item = await itemRoute(makeEvent({ params: { id: "7400" } }));

		expect(item).toMatchObject({ id: 7400, title: "Algolia story", comments_count: 2 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("serves the tree from a single algolia request", async () => {
		fetchMock.mockReset();
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(algoliaPayload(7100, 7101, 7102)), {
				headers: { "content-type": "application/json" },
			}),
		);

		const item = await itemRoute(
			makeEvent({ params: { id: "7100" }, query: "source=algolia" }),
		);

		expect(item).toMatchObject({ id: 7100, title: "Algolia story", comments_count: 2 });
		expect(item.comments[0]).toMatchObject({ id: 7101, level: 0, parent: 7100 });
		expect(item.comments[0]?.comments[0]).toMatchObject({ id: 7102, level: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("falls back to firebase when algolia has no item", async () => {
		fetchMock.mockReset();
		fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
		firebaseTree(7200, 7201);

		const item = await itemRoute(
			makeEvent({ params: { id: "7200" }, query: "source=algolia" }),
		);

		expect(item).toMatchObject({ id: 7200, title: "Firebase story" });
		expect(item.comments).toHaveLength(1);
	});

	test("falls back to firebase when rate limited, without retrying", async () => {
		fetchMock.mockReset();
		fetchMock.mockResolvedValueOnce(new Response("rate limit", { status: 429 }));
		firebaseTree(7300, 7301);

		const item = await itemRoute(
			makeEvent({ params: { id: "7300" }, query: "source=algolia" }),
		);

		expect(item).toMatchObject({ id: 7300, title: "Firebase story" });
		expect(item.comments).toHaveLength(1);
		// one attempt only — the cooldown keeps us from hammering algolia
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
