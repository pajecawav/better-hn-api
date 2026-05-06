import { child, get } from "firebase/database";
import { defineHandler, HTTPError } from "nitro";
import { db } from "~/src/lib/firebase";
import { transformItem } from "~/src/lib/transformers";
import type { HackerNewsItem, HackerNewsItemTree } from "~/src/lib/types";

export default defineHandler(async event => {
	const id = Number(event.context.params?.id);

	if (!event.context.params?.id) {
		throw new HTTPError({ status: 400, message: "Missing item id param" });
	}

	if (Number.isNaN(id)) {
		throw new HTTPError({ status: 400, message: "Invalid item id param" });
	}

	const item = await getItem(id);

	if (!item) {
		throw new HTTPError({ status: 404, message: "Item not found" });
	}

	return transformItem(item);
});

const getItem = async (id: number): Promise<HackerNewsItemTree | null> => {
	const snapshot = await get(child(db, `item/${id}`));
	const item = snapshot.val() as HackerNewsItem;

	const comments = item.kids ? await Promise.all(item.kids?.map(getItem)) : [];

	delete item.kids;
	delete item.parts; // we do not support polls

	return { item, comments };
};
