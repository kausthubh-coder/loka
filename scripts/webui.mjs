// Copies the built Loka sidebar page (webui/dist, from `vite build --config webui/vite.config.ts`) into the build
// checkout, where components/loka_sidebar packs it into the browser. The next `bun run browser:build` picks it up.

import { cpSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILD_DIR } from "./browser.mjs";

const from = resolve(import.meta.dirname, "..", "webui", "dist");
const to = join(BUILD_DIR, "build", "src", "components", "loka_sidebar", "dist");
if (!existsSync(join(from, "sidebar.html"))) {
	console.error("webui/dist/sidebar.html is missing. Run: vite build --config webui/vite.config.ts");
	process.exit(1);
}
if (!existsSync(join(to, ".."))) {
	console.error(`${join(to, "..")} doesn't exist: the build checkout needs Loka's patches applied first.`);
	process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`Copied the sidebar into ${to}`);
