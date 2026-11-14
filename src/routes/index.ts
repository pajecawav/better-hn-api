import { defineHandler } from "nitro";

// Plain-text API reference served at `/` — keep in sync with README.md
const DOCS = `better-hn-api — an alternative Hacker News API.

Base URL: https://api.bhn.pajecawav.dev
Source:   https://github.com/pajecawav/better-hn-api

## Endpoints

### GET /:topic
UI-friendly story feeds.

Topics: news (top stories), newest, ask, show, jobs.

Query params:
- offset — skip the first N items (default: 0)
- limit  — number of items to return (default: 30, max: 200)

Example: curl https://api.bhn.pajecawav.dev/news?limit=10

### GET /item/:id
A single item with its full comment tree.

Example: curl https://api.bhn.pajecawav.dev/item/8863

### GET /user/:id
User profile.

Example: curl https://api.bhn.pajecawav.dev/user/jl

## Notes
- Responses are cached with stale-while-revalidate.
- Timing info is exposed via the Server-Timing header.
- MIT licensed.
`;

export default defineHandler(() => {
	return new Response(DOCS, {
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
});
