import { child, get } from "firebase/database";
import type { H3Event } from "nitro";
import { defineCachedFunction } from "nitro/cache";
import { dbRef } from "./firebase";
import type { HackerNewsItem } from "./types";

export const resolveItem = defineCachedFunction(
	async (_event: H3Event, id: number): Promise<HackerNewsItem | null> => {
		const snapshot = await get(child(dbRef(), `item/${id}`));

		return snapshot.val() as HackerNewsItem | null;
	},
	{
		base: "hn",
		name: "item",
		swr: true,
		maxAge: 60,
		staleMaxAge: 20,
		getKey: (_, id) => `item/${id}`,
	},
);
