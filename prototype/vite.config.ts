import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

// PORT comes from the repo root's .env.local (written by `bun run setup`) so parallel worktrees don't fight over
// one port. `bun run` doesn't pass .env.local to the script, so read it here; a PORT in the environment still wins.
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, resolve(import.meta.dirname, ".."), "PORT");
	const port = Number(process.env.PORT ?? env.PORT ?? 5173);
	return {
		server: { port, strictPort: true },
		preview: { port, strictPort: true },
	};
});
