import { resolve } from "node:path";
import { defineConfig } from "vite";

// Builds Loka's own browser pages into webui/dist, sharing one bundle: the sidebar (sidebar.html), the floating
// command bar (command.html) and the History page (history.html, chrome://history, with its own handler). `bun run webui:build` then copies them into the build checkout's
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
				history: resolve(import.meta.dirname, "history.html"),
			},
			output: { entryFileNames: "assets/[name]-[hash].js" },
		},
	},
});
