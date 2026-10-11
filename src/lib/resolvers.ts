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

// Fetches the full id list for a topic (topstories, newstories, ...).
// Shared by all offset/limit pages so concurrent requests for the same
// topic fetch the list once instead of once per page.
export const resolveTopic = defineCachedFunction(
	async (_event: H3Event, topic: string): Promise<number[]> => {
		const snapshot = await get(child(dbRef(), topic));

		return (snapshot.val() as number[]) ?? [];
	},
	{
		base: "hn",
		name: "topic",
		swr: true,
		maxAge: 60,
		staleMaxAge: 120,
		getKey: (_, topic) => `topic/${topic}`,
	},
);
