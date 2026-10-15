import { resolve } from "node:path";
import { defineConfig } from "vite";

// Builds the Loka sidebar as a browser extension into extension/dist: four pages plus the background worker,
// which must keep a fixed name because the manifest points at it.
export default defineConfig({
	root: import.meta.dirname,
	base: "./",
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "chrome120",
		modulePreload: false,
		rollupOptions: {
			input: {
				sidebar: resolve(import.meta.dirname, "sidebar.html"),
				newtab: resolve(import.meta.dirname, "newtab.html"),
				settings: resolve(import.meta.dirname, "settings.html"),
				onboarding: resolve(import.meta.dirname, "onboarding.html"),
				background: resolve(import.meta.dirname, "src/background.ts"),
			},
			output: {
				entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
			},
		},
	},
});
