import { initializeApp } from "firebase/app";
import { getDatabase, ref } from "firebase/database";

export const app = initializeApp({
	databaseURL: "https://hacker-news.firebaseio.com/",
});

export const db = getDatabase(app);

export const dbRef = () => ref(db, "v0");
