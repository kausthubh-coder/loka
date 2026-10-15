import { resolve } from "node:path";
import { defineConfig } from "vite";

// Builds the Loka sidebar as the browser's own page into webui/dist. `bun run webui:build` then copies it into the
// build checkout's components/loka_sidebar/dist, where GN packs it into loka_sidebar_generated.pak.
export default defineConfig({
	root: import.meta.dirname,
	base: "./",
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "chrome140",
		modulePreload: false,
		rollupOptions: {
			input: { sidebar: resolve(import.meta.dirname, "sidebar.html") },
			output: { entryFileNames: "assets/[name]-[hash].js" },
		},
	},
});
