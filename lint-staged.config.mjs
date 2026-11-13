/**
 * lint-staged config. Function form ignores the staged paths lint-staged appends,
 * so oxlint and the type check always cover the whole project (same as before).
 */
export default {
	"*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}": ["bun fmt", () => "oxlint .", () => "bun check -b"],
	"*.{json,md,yml,yaml,css,scss,sass}": "bun fmt",
};
