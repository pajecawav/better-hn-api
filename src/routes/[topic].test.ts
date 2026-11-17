import { describe, expect, test } from "bun:test";

import { expectHTTPError, makeEvent, setFirebaseData } from "../test-utils";

// Import after test-utils: the route must resolve firebase/database against the mock.
const topicRoute = (await import("./[topic].ts")).default;

describe("GET /:topic", () => {
	test("returns transformed stories for a topic", async () => {
		setFirebaseData("v0/topstories", [1001, 1002, 1003]);
		setFirebaseData("v0/item/1001", {
			id: 1001,
			type: "story",
			by: "alice",
			time: 1794678190,
			score: 185,
			title: "A link story",
			descendants: 47,
			url: "https://example.com/post",
		});
		setFirebaseData("v0/item/1002", {
			id: 1002,
			type: "story",
			by: "bob",
			time: 1794678191,
			score: 10,
			title: "Ask HN: Test",
			descendants: 1,
		});
		setFirebaseData("v0/item/1003", {
			id: 1003,
			type: "story",
			by: "carol",
			time: 1794678192,
			score: 5,
			title: "No url story",
			descendants: 0,
		});

		const stories = await topicRoute(makeEvent({ params: { topic: "news" } }));

		expect(stories).toHaveLength(3);
		expect(stories[0]).toMatchObject({
			id: 1001,
			user: "alice",
			type: "link",
			domain: "example.com",
		});
		expect(stories[1]).toMatchObject({ id: 1002, type: "ask" });
		expect(stories[2]).toMatchObject({ id: 1003, url: "item?id=1003" });
	});

	test("drops items that fail to resolve", async () => {
		setFirebaseData("v0/newstories", [2001, 2002]);
		setFirebaseData("v0/item/2001", {
			id: 2001,
			type: "story",
			by: "dave",
			time: 1794678190,
			score: 1,
			title: "Only survivor",
			descendants: 0,
		});
		// 2002 is deliberately missing.

		const stories = await topicRoute(makeEvent({ params: { topic: "newest" } }));

		expect(stories).toHaveLength(1);
		expect(stories[0]?.id).toBe(2001);
	});

	test("applies offset and limit", async () => {
		const ids = [3001, 3002, 3003, 3004, 3005];
		setFirebaseData("v0/askstories", ids);
		for (const id of ids) {
			setFirebaseData(`v0/item/${id}`, {
				id,
				type: "story",
				by: "erin",
				time: 1794678190,
				score: 1,
				title: `Story ${id}`,
				descendants: 0,
			});
		}

		const stories = await topicRoute(
			makeEvent({ params: { topic: "ask" }, query: "offset=1&limit=2" }),
		);

		expect(stories.map(story => story.id)).toEqual([3002, 3003]);
	});

	test("rejects an unknown topic", async () => {
		await expectHTTPError(() => topicRoute(makeEvent({ params: { topic: "hot" } })), 400);
	});

	test("rejects a negative offset", async () => {
		await expectHTTPError(
			() => topicRoute(makeEvent({ params: { topic: "show" }, query: "offset=-1" })),
			400,
		);
	});

	test("rejects a zero limit", async () => {
		await expectHTTPError(
			() => topicRoute(makeEvent({ params: { topic: "show" }, query: "limit=0" })),
			400,
		);
	});

	test("rejects a limit over 200", async () => {
		await expectHTTPError(
			() => topicRoute(makeEvent({ params: { topic: "show" }, query: "limit=201" })),
			400,
		);
	});

	test("falls back to defaults for non-numeric offset and limit", async () => {
		setFirebaseData("v0/jobstories", [4001, 4002]);
		setFirebaseData("v0/item/4001", {
			id: 4001,
			type: "job",
			by: "hiring",
			time: 1794678190,
			score: 1,
			title: "Hiring",
			descendants: 0,
			url: "https://corp.example/job",
		});
		setFirebaseData("v0/item/4002", {
			id: 4002,
			type: "job",
			by: "hiring2",
			time: 1794678191,
			score: 2,
			title: "Hiring more",
			descendants: 0,
		});

		const stories = await topicRoute(
			makeEvent({ params: { topic: "jobs" }, query: "offset=abc&limit=abc" }),
		);

		expect(stories).toHaveLength(2);
		// jobs keep the transform rules of the feed
		expect(stories[0]).toMatchObject({ id: 4001, user: null, points: null });
	});
});
