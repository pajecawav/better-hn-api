import { defineConfig } from "nitro";

export default defineConfig({
	serverDir: "./src",
	routeRules: {
		"/**": {
			cache: { swr: true, maxAge: 60, staleMaxAge: 20 },
		},
	},
});
