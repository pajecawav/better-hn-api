import { deleteApp } from "firebase/app";
import { goOffline } from "firebase/database";
import { definePlugin } from "nitro";
import { app, db } from "../lib/firebase";

export default definePlugin(nitroApp => {
	nitroApp.hooks.hook("close", async () => {
		// The Realtime Database SDK keeps a persistent WebSocket (with
		// heartbeat timers) open once any get() ran. srvx closes the HTTP
		// server on SIGINT but never calls process.exit(), so the socket
		// keeps the Node.js event loop alive and the process hangs after
		// "Server closed successfully.". Tear the connection down here.
		goOffline(db);
		await deleteApp(app).catch(error => {
			console.error("[firebase-cleanup] failed to delete app", error);
		});
	});
});
