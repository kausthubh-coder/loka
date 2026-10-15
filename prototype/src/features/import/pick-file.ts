/** Asks for one file and returns its text, or null if the picker was closed without choosing. */
export function pickFile(accept = ".json,application/json,*"): Promise<string | null> {
	return new Promise((done) => {
		const input = Object.assign(document.createElement("input"), { type: "file", accept });
		input.addEventListener("change", async () => done((await input.files?.[0]?.text()) ?? null));
		input.addEventListener("cancel", () => done(null));
		input.click();
	});
}

/** Where each browser keeps the file, shown under the button so a user can find it in the picker. */
export const IMPORT_SOURCES = {
	chrome: { name: "Chrome", file: "Bookmarks", where: "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default" },
	edge: { name: "Edge", file: "Bookmarks", where: "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default" },
	arc: {
		name: "Arc",
		file: "StorableSidebar.json",
		where: "%LOCALAPPDATA%\\Packages\\TheBrowserCompany.Arc_…\\LocalCache\\Local\\Arc",
	},
} as const;

export type ImportSource = keyof typeof IMPORT_SOURCES;
