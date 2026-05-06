import { child, get, query } from "firebase/database";
import { defineHandler, HTTPError } from "nitro";
import { db } from "~/src/lib/firebase";
import { transformUser } from "~/src/lib/transformers";
import type { HackerNewsUser } from "~/src/lib/types";

export default defineHandler(async event => {
	const id = event.context.params?.id;

	if (!id) {
		throw new HTTPError({ status: 400, message: "Missing user id param" });
	}

	const snapshot = await get(query(child(db, `user/${id}`)));

	const user = snapshot.val() as HackerNewsUser;

	if (!user?.id) {
		throw new HTTPError({ status: 404, message: "User not found" });
	}

	return transformUser(user);
});
