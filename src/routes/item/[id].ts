import { defineHandler, type H3Event, HTTPError } from "nitro";
import { withServerTiming } from "nitro/h3";

import { resolveAlgoliaItem } from "~/src/lib/algolia";
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

	const item = await withServerTiming(event, "fetch", () =>
		getItem(event, id, parseSource(event)),
	);

	if (!item) {
		throw new HTTPError({ status: 404, message: "Item not found" });
	}

	return withServerTiming(event, "transform", () => transformItem(item));
});

// `?source=algolia` fetches the whole tree in one request, falling back to
// the Firebase walk when Algolia is rate limited, erroring, or has no item.
const getItem = async (
	event: H3Event,
	id: number,
	source: "algolia" | "firebase",
): Promise<HackerNewsItemTree | null> => {
	if (source === "algolia") {
		try {
			const tree = await resolveAlgoliaItem(event, id);

			if (tree) {
				return tree;
			}
		} catch (error) {
			console.error("[item] algolia fallback:", error);
		}
	}

	return getItemFromFirebase(event, id);
};

const parseSource = (event: H3Event): "algolia" | "firebase" => {
	return event.url.searchParams.get("source") === "algolia" ? "algolia" : "firebase";
};

const getItemFromFirebase = async (
	event: H3Event,
	id: number,
): Promise<HackerNewsItemTree | null> => {
	const raw = await resolveItem(event, id);

	if (!raw) {
		return null;
	}

	// resolveItem caches this object by reference — build the tree node from a
	// copy instead of mutating the cached original (the historical
	// `delete raw.kids` corrupted every later traversal of the same item).
	// kids are expanded into the comments tree below.
	const { kids, ...item } = raw;

	// we do not support polls
	delete item.parts;

	const comments = kids ? await Promise.all(kids.map(id => getItemFromFirebase(event, id))) : [];

	return { item, comments };
};
