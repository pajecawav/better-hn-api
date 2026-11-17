import { expect, mock } from "bun:test";

import { type H3Event, HTTPError } from "nitro";

// In-memory store backing the mocked firebase/database module, keyed by
// database path ("v0/item/8863", "v0/topstories", ...).
const firebaseData = new Map<string, unknown>();

// Replaces firebase/database with an in-memory fake. Runs on import of this
// module, so import it before dynamically importing any route or resolver —
// they must resolve firebase/database against the mock, not the real SDK.
void mock.module("firebase/database", () => ({
	getDatabase: () => ({}),
	ref: (_db: unknown, path: string) => ({ path }),
	child: (parent: { path: string }, path: string) => ({ path: `${parent.path}/${path}` }),
	query: (ref: unknown) => ref,
	get: async (ref: { path: string }) => ({
		val: () => firebaseData.get(ref.path) ?? null,
	}),
}));

export const setFirebaseData = (path: string, value: unknown) => {
	firebaseData.set(path, value);
};

interface FakeEventOptions {
	params?: Record<string, string>;
	path?: string;
	query?: string;
}

// Minimal H3Event stand-in: just enough context.params, url.searchParams and
// res.headers for the route handlers (including withServerTiming) to work.
export const makeEvent = (options: FakeEventOptions = {}): H3Event => {
	const { params = {}, path = "/", query = "" } = options;

	return {
		context: { params },
		url: new URL(`http://localhost${path}${query ? `?${query}` : ""}`),
		res: { headers: new Headers() },
	} as unknown as H3Event;
};

// Asserts that fn throws an HTTPError with the given status.
export const expectHTTPError = async (fn: () => unknown, status: number) => {
	try {
		await fn();
	} catch (error) {
		expect(error).toBeInstanceOf(HTTPError);
		expect((error as HTTPError).status).toBe(status);
		return;
	}

	throw new Error(`Expected an HTTPError with status ${status}, but nothing was thrown`);
};
