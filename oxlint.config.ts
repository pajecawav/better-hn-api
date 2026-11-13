export default {
	plugins: ["unicorn", "typescript", "oxc"],
	categories: {
		correctness: "error",
		suspicious: "warn",
		perf: "warn",
	},
	options: { typeAware: true },
	rules: {
		"no-shadow": "off",
		"no-underscore-dangle": "off",
		"no-await-in-loop": "off",
		"typescript/consistent-return": "off",
		"typescript/no-explicit-any": "off",
		"typescript/no-unsafe-type-assertion": "off",
		"typescript/no-unnecessary-type-parameters": "off",
		"unicorn/consistent-function-scoping": "off",
		curly: "error",
	},
	ignorePatterns: [".output"],
};
