import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";

import { transformItem, transformItemToStory, transformUser } from "./transformers";
import type { HackerNewsItem, HackerNewsItemTree, HackerNewsUser } from "./types";

const NOW = Date.UTC(2026, 10, 16, 12, 0, 0); // 2026-11-16T12:00:00Z
const TWO_HOURS = 2 * 60 * 60;
const TWO_YEARS = 2 * 365 * 24 * 60 * 60;

const makeItem = (overrides: Partial<HackerNewsItem> = {}): HackerNewsItem => ({
	id: 1,
	type: "story",
	by: "someone",
	time: (NOW - TWO_HOURS * 1000) / 1000,
	text: "",
	parent: 0,
	poll: 0,
	score: 42,
	title: "A story",
	descendants: 7,
	...overrides,
});

beforeAll(() => {
	setSystemTime(NOW);
});

afterAll(() => {
	setSystemTime();
});

describe("transformItemToStory", () => {
	test("maps a link story", () => {
		const story = transformItemToStory(
			makeItem({
				id: 50499017,
				title: "Lovable apps expose data",
				by: "armcat",
				score: 185,
				url: "https://www.crissyfield.de/research/lovable-en/",
			}),
		);

		expect(story).toEqual({
			id: 50499017,
			title: "Lovable apps expose data",
			points: 185,
			user: "armcat",
			time: NOW / 1000 - TWO_HOURS,
			time_ago: "2 hours ago",
			comments_count: 7,
			type: "link",
			url: "https://www.crissyfield.de/research/lovable-en/",
			domain: "crissyfield.de",
		});
	});

	test("defaults comments_count to 0 when descendants is missing", () => {
		const story = transformItemToStory(makeItem({ descendants: undefined }));

		expect(story.comments_count).toBe(0);
	});

	test("falls back to item url for stories without a url", () => {
		const story = transformItemToStory(makeItem({ id: 8863, url: undefined }));

		expect(story.url).toBe("item?id=8863");
		expect(story.domain).toBeUndefined();
	});

	test("detects ask stories without a url by title", () => {
		const story = transformItemToStory(makeItem({ id: 1234, title: "Ask HN: Why?" }));

		expect(story.type).toBe("ask");
		expect(story.url).toBe("item?id=1234");
	});

	test("a plain title on an item-url story stays a link", () => {
		const story = transformItemToStory(makeItem({ id: 1234, title: "Show me things" }));

		expect(story.type).toBe("link");
		expect(story.url).toBe("item?id=1234");
	});

	test("strips user and points from jobs", () => {
		const story = transformItemToStory(
			makeItem({ type: "job", url: "https://company.example/jobs" }),
		);

		expect(story.user).toBeNull();
		expect(story.points).toBeNull();
	});
});

describe("transformItem", () => {
	test("maps a story with a nested comment tree", () => {
		const tree: HackerNewsItemTree = {
			item: makeItem({ id: 8863, title: "My YC app", kids: [9224, 9225] }),
			comments: [
				{
					item: makeItem({
						id: 9224,
						type: "comment",
						by: "BrandonM",
						parent: 8863,
						text: "I have a few qualms",
					}),
					comments: [
						{
							item: makeItem({
								id: 9226,
								type: "comment",
								by: "dhouston",
								parent: 9224,
								text: "Fair points",
							}),
							comments: [],
						},
					],
				},
				{
					item: makeItem({
						id: 9225,
						type: "comment",
						by: "peter",
						parent: 8863,
						text: "Nice",
					}),
					comments: [],
				},
			],
		};

		const item = transformItem(tree);

		expect(item.id).toBe(8863);
		expect(item.level).toBeUndefined();
		expect(item.comments).toHaveLength(2);

		const [first, second] = item.comments;
		expect(first.id).toBe(9224);
		expect(first.level).toBe(0);
		expect(first.parent).toBe(8863);
		expect(first.content).toBe("<p>I have a few qualms");
		expect(first.comments).toHaveLength(1);
		expect(first.comments[0]?.level).toBe(1);
		expect(first.comments[0]?.comments).toHaveLength(0);

		expect(second.id).toBe(9225);
		expect(second.level).toBe(0);

		// 2 direct comments + 1 nested reply
		expect(item.comments_count).toBe(3);
		expect(first.comments_count).toBe(1);
	});

	test("marks deleted comments as [deleted]", () => {
		const tree: HackerNewsItemTree = {
			item: makeItem({
				id: 500,
				type: "comment",
				deleted: true,
				text: "should not leak",
			}),
			comments: [],
		};

		const item = transformItem(tree);

		expect(item.deleted).toBe(true);
		expect(item.content).toBe("[deleted]");
	});

	test("strips user and points from jobs", () => {
		const tree: HackerNewsItemTree = {
			item: makeItem({ id: 999, type: "job", url: "https://co.example/x" }),
			comments: [],
		};

		const item = transformItem(tree);

		expect(item.user).toBeNull();
		expect(item.points).toBeNull();
	});

	test("wraps text in <p> and strips closing </p> tags", () => {
		const tree: HackerNewsItemTree = {
			item: makeItem({ id: 501, type: "comment", text: "hello</p>world" }),
			comments: [],
		};

		expect(transformItem(tree).content).toBe("<p>helloworld");

		const prefixed: HackerNewsItemTree = {
			item: makeItem({ id: 502, type: "comment", text: "<p>already wrapped</p>" }),
			comments: [],
		};

		expect(transformItem(prefixed).content).toBe("<p>already wrapped");
	});
});

describe("transformUser", () => {
	test("maps a hacker news user", () => {
		const hnUser: HackerNewsUser = {
			id: "jl",
			about: "This is a test",
			created: NOW / 1000 - TWO_YEARS,
			karma: 4522,
		};

		expect(transformUser(hnUser)).toEqual({
			id: "jl",
			about: "This is a test",
			created_time: NOW / 1000 - TWO_YEARS,
			created: "2 years ago",
			karma: 4522,
		});
	});
});
