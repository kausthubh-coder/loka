import { defineConfig } from "vite";

// PORT comes from the environment so parallel worktrees don't fight over one port.
const port = Number(process.env.PORT ?? 5173);

export default defineConfig({
	server: { port, strictPort: true },
	preview: { port, strictPort: true },
});
