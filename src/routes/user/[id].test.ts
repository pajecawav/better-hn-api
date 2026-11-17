import { describe, expect, test } from "bun:test";

import { expectHTTPError, makeEvent, setFirebaseData } from "../../test-utils";

// Import after test-utils: the route must resolve firebase/database against the mock.
const userRoute = (await import("./[id].ts")).default;

describe("GET /user/:id", () => {
	test("returns a transformed user profile", async () => {
		setFirebaseData("v0/user/jl", {
			id: "jl",
			about: "This is a test",
			created: 1173923446,
			karma: 4522,
		});

		const user = await userRoute(makeEvent({ params: { id: "jl" } }));
		const { created, ...fields } = user;

		expect(fields).toEqual({
			id: "jl",
			about: "This is a test",
			created_time: 1173923446,
			karma: 4522,
		});
		// relative time formatting is covered by transformer tests
		expect(created).toMatch(/ago$/);
	});

	test("returns 404 for an unknown user", async () => {
		await expectHTTPError(() => userRoute(makeEvent({ params: { id: "ghost" } })), 404);
	});

	test("returns 404 for an empty user record", async () => {
		setFirebaseData("v0/user/empty", {});

		await expectHTTPError(() => userRoute(makeEvent({ params: { id: "empty" } })), 404);
	});
});
