import { child, get, limitToFirst, orderByKey, query, startAt } from "firebase/database";
import { defineHandler, HTTPError, type H3Event } from "nitro";
import { withServerTiming } from "nitro/h3";
import { dbRef } from "../lib/firebase";
import { transformItemToStory } from "../lib/transformers";
import type { HackerNewsItem } from "../lib/types";

const TOPICS: Record<string, string> = {
	news: "topstories",
	newest: "newstories",
	ask: "askstories",
	show: "showstories",
	jobs: "jobstories",
};

export default defineHandler(async event => {
	const mappedTopic = parseTopic(event);
	const offset = parseOffset(event);
	const limit = parseLimit(event);

	const items = await withServerTiming(event, "fetch", async () => {
		const snapshot = await get(
			query(
				child(dbRef(), mappedTopic),
				orderByKey(),
				limitToFirst(limit),
				startAt(offset.toString()),
			),
		);

		const itemIds = snapshot.val() as number[];

		return Promise.all<Promise<HackerNewsItem>>(
			itemIds.map(async id => get(child(dbRef(), `item/${id}`)).then(snap => snap.val())),
		);
	});

	return withServerTiming(event, "transform", () => items.map(transformItemToStory));
});

const parseTopic = (event: H3Event): string => {
	const topic = event.context.params?.["topic"];

	if (!topic) {
		throw new HTTPError({ status: 400, message: "Missing topic param" });
	}

	const mappedTopic = TOPICS[topic];

	if (!mappedTopic) {
		throw new HTTPError({
			status: 400,
			message: `Invalid topic. Available values: ${Object.keys(TOPICS).join(", ")}`,
		});
	}

	return mappedTopic;
};

const parseOffset = (event: H3Event): number => {
	const offset = Number(event.url.searchParams.get("offset") ?? 0);

	if (Number.isNaN(offset)) {
		return 0;
	}

	if (offset < 0) {
		throw new HTTPError({ status: 400, message: "Offset must be a non-negative number" });
	}

	return offset;
};

const parseLimit = (event: H3Event): number => {
	const limit = Number(event.url.searchParams.get("limit") ?? 30);

	if (Number.isNaN(limit)) {
		return 30;
	}

	if (limit <= 0) {
		throw new HTTPError({ status: 400, message: "Limit must be a positive number" });
	}

	if (limit > 200) {
		throw new HTTPError({ status: 400, message: "Limit must be less than or equal to 200" });
	}

	return limit;
};
