import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	base: "./",
	css: {
		transformer: "postcss",
	},
	build: {
		outDir: "dist/renderer",
		cssMinify: false,
	},
	fmt: {
		useTabs: true,
		singleQuote: false,
		semi: true,
		printWidth: 100,
		sortImports: {},
	},
	lint: {
		ignorePatterns: ["dist/**", "release/**"],
		plugins: ["typescript", "react"],
		options: {
			typeAware: true,
			typeCheck: true,
		},
		rules: {
			"typescript/no-explicit-any": "error",
		},
	},
});
