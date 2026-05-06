import { defineConfig } from "nitro";
import { CachedEventHandlerOptions } from "nitro/types";

const cache: CachedEventHandlerOptions = { swr: true, maxAge: 60, staleMaxAge: 20 };

export default defineConfig({
	serverDir: "./src",
	routeRules: {
		"/**": { cache },
		"/item/**": { cache },
		"/user/**": { cache },
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
