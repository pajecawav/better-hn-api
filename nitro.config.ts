import { defineConfig } from "nitro";
import { type CachedEventHandlerOptions } from "nitro/types";

// Query params affect topic listings; they must be part of the cache key.
// Without `allowQuery`, nitro strips the query string and /news?offset=30
// would serve the cached response of /news?offset=0.
const listCache: CachedEventHandlerOptions = {
	swr: true,
	maxAge: 60,
	staleMaxAge: 120,
	allowQuery: ["offset", "limit"],
};

// Comment trees of older stories barely change — allow a wider stale window
// so users don't pay a full cold recompute when maxAge expires.
const itemCache: CachedEventHandlerOptions = {
	swr: true,
	maxAge: 60,
	staleMaxAge: 300,
};

export default defineConfig({
	serverDir: "./src",
	preset: "bun",
	builder: "bun",
	// FIXME: workaround for nitro — implicit resolution of `~/...` is broken;
	// remove once upstream fixes it
	alias: {
		"~": import.meta.dirname,
	},
	routeRules: {
		"/**": { cache: listCache },
		"/item/**": { cache: itemCache },
	},
	kv: {
		hn: {
			driver: "lru-cache",
			// Default driver max is 1000 entries — a single large comment tree
			// evicts the whole /news item set. ~50k entries ≈ tens of MB.
			// ttl bounds memory for cold entries (lru-cache ttl is in ms).
			max: 50_000,
			ttl: 30 * 60 * 1000,
		},
	},
	cloudflare: {
		wrangler: {
			observability: {
				enabled: true,
				logs: { enabled: true, invocation_logs: true },
				traces: { enabled: true },
			},
		},
	},
});
