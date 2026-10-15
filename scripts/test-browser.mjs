// The browser that Playwright scripts (verify-loka) drive. Not the Loka browser build: that's scripts/browser.mjs.
// Playwright's own Chromium when the build this playwright wants is installed (my Windows machine), else Google
// Chrome, else the Chromium a cloud VM ships under PLAYWRIGHT_BROWSERS_PATH (an older build, which these scripts
// work with).
//
//   import { launchBrowser } from "./test-browser.mjs";
//   const browser = await launchBrowser();

import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { chromium } from "playwright";

const CHROME = [
	join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
	join(process.env["PROGRAMFILES(X86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
	join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
	"/usr/bin/google-chrome",
];

/**
 * Options for chromium.launch, plus a name for the doctor; null when there's no browser.
 * @returns {{ name: string, launch: import("playwright").LaunchOptions } | null}
 */
export function findBrowser() {
	let bundled = "";
	try {
		bundled = chromium.executablePath();
	} catch {} // throws on hosts Playwright doesn't support
	if (bundled && existsSync(bundled)) return { name: `Playwright's Chromium (${bundled})`, launch: {} };
	if (CHROME.some((file) => isAbsolute(file) && existsSync(file)))
		return { name: "Google Chrome", launch: { channel: "chrome" } };
	const shipped = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? "", "chromium");
	if (process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(shipped))
		return { name: `the VM's Chromium (${realpathSync(shipped)})`, launch: { executablePath: shipped } };
	return null;
}

/** @param {import("playwright").LaunchOptions} [options] */
export async function launchBrowser(options = {}) {
	const browser = findBrowser();
	if (!browser) throw new Error("No browser for Playwright. Run: node node_modules/playwright/cli.js install chromium");
	return chromium.launch({ ...options, ...browser.launch });
}
