import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

import type {
	HackerNewsItem,
	HackerNewsItemTree,
	HackerNewsUser,
	Item,
	Story,
	User,
} from "./types";

dayjs.extend(relativeTime);

const ITEM_URL_REGEX = /^item/i;
const ASK_TITLE_REGEX = /^ask/i;

export const transformItemToStory = (item: HackerNewsItem): Story => {
	let commentsCount = item.descendants || 0;

	let story: Story = {
		id: item.id,
		title: item.title,
		points: item.score,
		user: item.by,
		time: item.time,
		time_ago: dayjs(item.time * 1000).fromNow(),
		comments_count: commentsCount,
		type: item.type === "story" ? "link" : item.type,
	};

	processStoryUrl(item, story);

	if (item.type == "job") {
		story.user = story.points = null;
	}

	if (
		item.type === "story" &&
		story.url &&
		ITEM_URL_REGEX.test(story.url) &&
		ASK_TITLE_REGEX.test(item.title)
	) {
		story.type = "ask";
	}

	return story;
};

export const transformItem = (tree: HackerNewsItemTree, level?: number): Item => {
	const { item } = tree;

	const mappedItem: Item = {
		id: item.id,
		level,
		title: item.title,
		points: item.score,
		user: item.by,
		time: item.time,
		time_ago: dayjs(tree.item.time * 1000).fromNow(),
		parent: item.parent,
		type: item.type === "story" ? "link" : item.type,
		content: item.deleted ? "[deleted]" : cleanText(item.text),
		deleted: item.deleted,
		dead: item.dead,
		parts: item.parts,
		comments: [],
		comments_count: 0,
	};

	processStoryUrl(item, mappedItem);
	processItem(mappedItem, tree, level ?? -1);

	// strip user and points for jobs
	if (item.type == "job") {
		mappedItem.user = null;
		mappedItem.points = null;
	}

	return mappedItem;
};

export const transformUser = (user: HackerNewsUser): User => {
	return {
		id: user.id,
		about: user.about,
		created_time: user.created,
		created: dayjs(user.created * 1000).fromNow(),
		karma: user.karma,
	} satisfies User;
};

const processStoryUrl = (item: HackerNewsItem, story: Story) => {
	if (item.url) {
		try {
			const url = new URL(item.url);

			if (url) {
				story.url = item.url;
				story.domain = url.hostname.replace("www.", "");
			}
		} catch {}
	} else {
		story.url = `item?id=${item.id}`;
	}
};

const processItem = (item: Item, tree: HackerNewsItemTree, level: number) => {
	item.comments = tree.comments.reduce<Item[]>((acc, comment) => {
		if (comment) {
			acc.push(transformItem(comment, level + 1));
		}

		return acc;
	}, []);

	item.comments_count = item.comments.reduce(
		(acc, comment) => acc + 1 + (comment.comments_count ?? 0),
		0,
	);
};

const cleanText = (html: string): string => {
	if (!html) {
		return "";
	}

	html = html.replace(/<\/p>/gi, "");

	if (!html.startsWith("<p>")) {
		html = "<p>" + html;
	}

	return html;
};
