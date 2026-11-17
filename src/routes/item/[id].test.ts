import { describe, expect, test } from "bun:test";

import { expectHTTPError, makeEvent, setFirebaseData } from "../../test-utils";

// Import after test-utils: the route must resolve firebase/database against the mock.
const itemRoute = (await import("./[id].ts")).default;

describe("GET /item/:id", () => {
	test("resolves the full comment tree", async () => {
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

		const item = await itemRoute(makeEvent({ params: { id: "8863" } }));

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

		const item = await itemRoute(makeEvent({ params: { id: "6001" } }));

		expect(item.comments[0]).toMatchObject({ id: 6002, deleted: true });
		expect(item.comments[0]?.content).toBe("[deleted]");
	});

	test("returns 404 for a missing item", async () => {
		await expectHTTPError(() => itemRoute(makeEvent({ params: { id: "7777" } })), 404);
	});

	test("rejects a non-numeric id", async () => {
		await expectHTTPError(() => itemRoute(makeEvent({ params: { id: "abc" } })), 400);
	});
});
