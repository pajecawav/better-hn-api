import { expect, test } from "bun:test";

import { makeEvent } from "../test-utils";

const indexRoute = (await import("./index.ts")).default;

test("GET / serves the plain-text api reference", async () => {
	const response = indexRoute(makeEvent());

	expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
	expect(await response.text()).toContain("GET /:topic");
});
