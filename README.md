# better-hn-api

An alternative Hacker News API with UI-friendly JSON responses. Built with [Nitro](https://v3.nitro.build) and [Bun](https://bun.sh), served straight from HN's public Firebase database.

**Live:** [https://api.bhn.pajecawav.dev](https://api.bhn.pajecawav.dev) — the root path returns the same reference as below in plain text.

## Why

The official [HN API](https://github.com/HackerNews/API) returns raw Firebase items: you get flat `kids` id arrays and have to resolve and shape everything yourself, per request. This service does that work up front and returns ready-to-render data:

- **UI-friendly shapes** — stories, comment trees and users come pre-transformed (HNPWA-style): relative timestamps, extracted domains, computed comment counts, no `kids` arrays to walk.
- **Full comment trees** — `GET /item/:id` resolves the whole tree server-side as nested `comments`.
- **Pagination** — topic feeds accept `offset` and `limit` instead of one big id array.
- **Cached with SWR** — responses and Firebase reads are cached with stale-while-revalidate, so repeat hits don't touch the network.
- **Server-Timing** — every response includes a `Server-Timing` header with `fetch` and `transform` phases.

## API

Base URL: `https://api.bhn.pajecawav.dev`

### `GET /:topic`

Story feeds, mapped from HN's topic lists:

| Topic    | HN list       |
| -------- | ------------- |
| `news`   | `topstories`  |
| `newest` | `newstories`  |
| `ask`    | `askstories`  |
| `show`   | `showstories` |
| `jobs`   | `jobstories`  |

Query params:

| Param    | Default | Notes            |
| -------- | ------- | ---------------- |
| `offset` | `0`     | Must be `>= 0`   |
| `limit`  | `30`    | Must be `1..200` |

```bash
curl "https://api.bhn.pajecawav.dev/news?limit=1"
```

```json
[
	{
		"id": 50499017,
		"title": "Lovable apps expose passport details and more than 200K private messages",
		"points": 185,
		"user": "armcat",
		"time": 1794678190,
		"time_ago": "2 hours ago",
		"comments_count": 47,
		"type": "link",
		"url": "https://www.crissyfield.de/research/lovable-en/",
		"domain": "crissyfield.de"
	}
]
```

### `GET /item/:id`

A single item with its full comment tree resolved server-side as nested `comments`.

```bash
curl "https://api.bhn.pajecawav.dev/item/8863"
```

```json
{
	"id": 8863,
	"title": "My YC app: Dropbox - Throw away your USB drive",
	"points": 104,
	"user": "dhouston",
	"time": 1175714200,
	"time_ago": "20 years ago",
	"type": "link",
	"content": "",
	"comments": [
		{
			"id": 9224,
			"level": 0,
			"user": "BrandonM",
			"parent": 8863,
			"type": "comment",
			"content": "<p>I have a few qualms with this app:…",
			"comments": []
		}
	]
}
```

### `GET /user/:id`

User profile.

```bash
curl "https://api.bhn.pajecawav.dev/user/jl"
```

```json
{
	"id": "jl",
	"about": "This is a test",
	"created_time": 1173923446,
	"created": "20 years ago",
	"karma": 4522
}
```

## Getting started

```bash
bun install
bun run dev
```

## Building

```bash
bun run build
bun run preview
```

## Docker

```bash
docker build -t better-hn-api .
docker run -p 3000:3000 better-hn-api
```

## License

[MIT](LICENSE)
