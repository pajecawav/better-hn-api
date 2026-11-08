import { definePlugin, HTTPError } from "nitro";
import type { HTTPEvent } from "nitro/h3";

// Request logger, same output as srvx's logger (used by `nitro preview`):
// `[18:26:39] GET /user/pg [200] (968.10ms)`.
// Console output reaches both `nitro dev` and Cloudflare Observability, so
// no logging dependency and no tracing.
//
// Typed on the event, not event.req: on a cache miss the routeRules cache
// rebuilds the request without authorization/cookie headers and the
// response hook receives the rebuilt one.

// FORCE_COLOR wins ("0" disables), otherwise fall back to isTTY so that
// Workers, containers and pipes get plain output.
function colorsEnabled(): boolean {
	if (process.env.NO_COLOR) {
		return false;
	}
	const force = process.env.FORCE_COLOR;
	if (force !== undefined && force !== "") {
		return force !== "0";
	}
	return process.stdout.isTTY;
}

const colors = colorsEnabled();
const paint = (code: string, value: string) => (colors ? `\x1b[${code}m${value}\x1b[0m` : value);
const bold = (s: string) => paint("1", s);
const gray = (s: string) => paint("2", s);
const blue = (s: string) => paint("34", s);
const statusPaint = (code: number) =>
	paint(code < 200 ? "34" : code < 300 ? "32" : code < 400 ? "33" : "31", String(code));

let cachedSecond = 0;
let cachedTime = "";

/** `[18:26:39]`, cached per second like srvx does. */
function time(): string {
	const now = Date.now();
	const second = now - (now % 1000);
	if (second !== cachedSecond) {
		cachedSecond = second;
		cachedTime = new Date(now).toLocaleTimeString();
	}
	return `[${cachedTime}]`;
}

const reqStart = new WeakMap<HTTPEvent, number>();

export default definePlugin(nitroApp => {
	nitroApp.hooks.hook("request", event => {
		reqStart.set(event, performance.now());
	});

	nitroApp.hooks.hook("response", (res, event) => {
		const start = reqStart.get(event);
		if (start === undefined) {
			return;
		}
		const url = new URL(event.req.url);
		console.log(
			`${time()} ${bold(event.req.method)} ${blue(url.pathname + url.search)} [${statusPaint(res.status)}] ${gray(`(${(performance.now() - start).toFixed(2)}ms)`)}`,
		);
	});

	// HTTPError (400/404/…) is already visible as a status in the request
	// line, so log only unhandled failures here.
	nitroApp.hooks.hook("error", (error, context) => {
		if (HTTPError.isError(error)) {
			return;
		}
		const url = context.event ? new URL(context.event.req.url) : undefined;
		const where =
			context.event && url ? `${context.event.req.method} ${url.pathname + url.search}` : "";
		console.error(
			`${time()} ${where ? `${where}: ` : ""}${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
		);
		if (error instanceof Error && error.stack) {
			console.error(error.stack);
		} else {
			console.error(error);
		}
	});
});
