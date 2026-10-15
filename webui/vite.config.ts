import { resolve } from "node:path";
import { defineConfig } from "vite";

// Builds Loka's own browser pages into webui/dist: the sidebar (sidebar.html) and the floating command bar
// (command.html), sharing one bundle. `bun run webui:build` then copies them into the build checkout's
// components/loka_sidebar/dist, where GN packs everything in it into loka_sidebar_generated.pak.
export default defineConfig({
	root: import.meta.dirname,
	base: "./",
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "chrome140",
		modulePreload: false,
		rollupOptions: {
			input: {
				sidebar: resolve(import.meta.dirname, "sidebar.html"),
				command: resolve(import.meta.dirname, "command.html"),
			},
			output: { entryFileNames: "assets/[name]-[hash].js" },
		},
	},
});
