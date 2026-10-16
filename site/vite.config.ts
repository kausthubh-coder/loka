import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

// The landing page. It embeds the real sidebar prototype from ../prototype and reads the repo root's .env.local.
// It runs one port above the prototype's PORT so both can run at once; not strict, since that port isn't claimed.
// VITE_WAITLIST_URL is where the waitlist form posts. Without it the form says the waitlist isn't open yet.
export default defineConfig(({ mode }) => {
	const root = resolve(import.meta.dirname, "..");
	const env = loadEnv(mode, root, "PORT");
	const port = Number(process.env.SITE_PORT ?? Number(process.env.PORT ?? env.PORT ?? 5173) + 1);
	return {
		envDir: root,
		server: { port },
		preview: { port },
	};
});
