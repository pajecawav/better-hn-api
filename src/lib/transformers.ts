import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { HackerNewsItem, HackerNewsUser, Story, User } from "./types";

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
