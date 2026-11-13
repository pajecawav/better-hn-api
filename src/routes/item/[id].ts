import { defineHandler, type H3Event, HTTPError } from "nitro";
import { withServerTiming } from "nitro/h3";

import { resolveItem } from "~/src/lib/resolvers";
import { transformItem } from "~/src/lib/transformers";
import type { HackerNewsItemTree } from "~/src/lib/types";

export default defineHandler(async event => {
	const id = Number(event.context.params?.id);

	if (!event.context.params?.id) {
		throw new HTTPError({ status: 400, message: "Missing item id param" });
	}

	if (Number.isNaN(id)) {
		throw new HTTPError({ status: 400, message: "Invalid item id param" });
	}

	const item = await withServerTiming(event, "fetch", () => getItem(event, id));

	if (!item) {
		throw new HTTPError({ status: 404, message: "Item not found" });
	}

	return withServerTiming(event, "transform", () => transformItem(item));
});

const getItem = async (event: H3Event, id: number): Promise<HackerNewsItemTree | null> => {
	const item = await resolveItem(event, id);

	if (!item) {
		return null;
	}

	const comments = item.kids ? await Promise.all(item.kids?.map(id => getItem(event, id))) : [];

	delete item.kids;
	delete item.parts; // we do not support polls

	return { item, comments };
};
