import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { HackerNewsItem, Story } from "./types";

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
