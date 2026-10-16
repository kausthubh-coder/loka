/// <reference types="vite/client" />
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./site.css";
import { html, render, type TemplateResult } from "lit";
// The hero demo is the real prototype, not a recording of it.
import type { LokaApp } from "../../prototype/src/app/loka-app";
import "../../prototype/src/app/loka-app";
import { faviconColor, faviconLetter } from "../../prototype/src/features/sidebar/favicon";
import type { BrowserState, PinnedNode } from "../../prototype/src/features/sidebar/sidebar.logic";
import { seedState } from "../../prototype/src/features/sidebar/sidebar.seed";
import { commitsFromApi, normalizeEmail, timeAgo, waitlistBody } from "./site.logic";

const REPO = "kausthubh-coder/loka";
const WAITLIST_URL: string = import.meta.env.VITE_WAITLIST_URL ?? "";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function must<T extends Element>(selector: string, root: ParentNode = document): T {
	const found = root.querySelector<T>(selector);
	if (!found) throw new Error(`landing page is missing ${selector}`);
	return found;
}

// ---- Page hue. Everything tinted reads --hue, so changing it recolors the page like switching a space. ----

function setHue(hue: number) {
	document.documentElement.style.setProperty("--hue", String(hue));
}

// ---- Star field: drawn once per size, never animated, so it costs nothing while scrolling. ----

const stars = must<HTMLCanvasElement>("canvas.stars");
function drawStars() {
	const ratio = Math.min(devicePixelRatio, 2);
	stars.width = innerWidth * ratio;
	stars.height = innerHeight * ratio;
	const ctx = stars.getContext("2d");
	if (!ctx) return;
	ctx.scale(ratio, ratio);
	// A fixed seed keeps the same sky on every load and resize.
	let seed = 7;
	const random = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
	const count = Math.round((innerWidth * innerHeight) / 5200);
	for (let i = 0; i < count; i++) {
		const size = random() < 0.92 ? random() * 0.9 + 0.3 : random() * 1.2 + 1;
		ctx.globalAlpha = random() * 0.55 + 0.15;
		ctx.fillStyle = random() < 0.15 ? "#bfe6ff" : "#ffffff";
		ctx.beginPath();
		ctx.arc(random() * innerWidth, random() * innerHeight, size / 2, 0, Math.PI * 2);
		ctx.fill();
	}
}
drawStars();
let resizeTimer = 0;
addEventListener("resize", () => {
	clearTimeout(resizeTimer);
	resizeTimer = window.setTimeout(drawStars, 150);
});

// ---- Live demo ----

const demo = must<HTMLElement>("#demo");
const demoScale = must<HTMLElement>(".demo-scale", demo);
const app = must<LokaApp>("loka-app", demo);
const phone = matchMedia("(max-width: 640px)");

// The prototype is laid out for a desktop window. On narrow screens, shrink the whole window instead of reflowing it.
new ResizeObserver(([entry]) => {
	// Matches .demo-scale's width in site.css.
	const demoWidth = phone.matches ? 680 : 1120;
	const width = entry?.contentRect.width ?? demoWidth;
	demoScale.style.zoom = String(Math.min(1, width / demoWidth));
}).observe(must<HTMLElement>(".demo-frame", demo));

// The prototype listens for Ctrl+K, Ctrl+L and Ctrl+1-9 on the whole window. On a web page those belong to the
// visitor's browser, so let them through to the demo only after the visitor has clicked into it.
let demoArmed = false;
addEventListener("pointerdown", (e) => {
	demoArmed = e.composedPath().includes(demo);
	demo.classList.toggle("armed", demoArmed);
});
addEventListener(
	"keydown",
	(e: KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && !demoArmed) e.stopPropagation();
	},
	{ capture: true },
);

// Follow the demo's active space: the prototype writes it as --hue on its window element.
let demoHue = 200;
let heroInView = true;
function readDemoHue() {
	const frame = app.shadowRoot?.querySelector<HTMLElement>(".window");
	const value = frame?.style.getPropertyValue("--hue").trim();
	const hue = Number(value);
	if (!value || !Number.isFinite(hue) || hue === demoHue) return;
	demoHue = hue;
	if (heroInView) setHue(hue);
}
app.updateComplete.then(() => {
	const root = app.shadowRoot;
	if (!root) return;
	new MutationObserver(readDemoHue).observe(root, { attributes: true, attributeFilter: ["style"], subtree: true });
	readDemoHue();
	setHue(demoHue);
});

// ---- Spaces: a static sidebar drawn from the same seed data, following the step in the middle of the screen. ----

const seed: BrowserState = seedState();
const mock = must<HTMLElement>("[data-mock]");

function favicon(tabId: string): TemplateResult {
	const tab = seed.tabs[tabId];
	if (!tab) return html``;
	return html`<span class="fav" style="--fav: ${faviconColor(tab.url)}">${faviconLetter(tab.url)}</span>`;
}

function tree(nodes: PinnedNode[], activeTabId: string | null): TemplateResult {
	return html`<ul>
		${nodes.map((node) =>
			node.kind === "folder"
				? html`<li class="folder ${node.open ? "" : "closed"}">
						<span class="row"><span class="chev" aria-hidden="true"></span>${node.name}</span>
						${node.open ? tree(node.children, activeTabId) : html`<span class="folded">${node.children.length} tabs</span>`}
					</li>`
				: html`<li>
						<span class="row ${node.id === activeTabId ? "active" : ""}">${favicon(node.id)}${seed.tabs[node.id]?.title}</span>
					</li>`,
		)}
	</ul>`;
}

function renderMock(spaceId: string, focus: string) {
	const space = seed.spaces.find((s) => s.id === spaceId) ?? seed.spaces[0];
	if (!space) return;
	// School's group project starts folded in the seed; open it here so the nesting is visible.
	const pinned = JSON.parse(JSON.stringify(space.pinned).replaceAll('"open":false', '"open":true')) as PinnedNode[];
	mock.dataset.focus = focus;
	render(
		html`<div class="mock-window" style="--space-hue: ${space.hue}">
			<div class="mock-essentials">${seed.essentials.map((id) => html`<span class="tile">${favicon(id)}</span>`)}</div>
			<p class="mock-space"><span class="dot"></span>${space.name}</p>
			<div class="mock-tree">${pinned.length ? tree(pinned, space.activeTabId) : html`<p class="empty">Nothing pinned yet</p>`}</div>
			<div class="mock-divider"><span>Clear</span></div>
			<ul class="mock-open">
				${space.open.map((id) => html`<li><span class="row">${favicon(id)}${seed.tabs[id]?.title}</span></li>`)}
			</ul>
			<div class="mock-switcher">
				${seed.spaces.map(
					(s) =>
						html`<span class="switch ${s.id === space.id ? "on" : ""}" style="--space-hue: ${s.hue}">${s.name[0]}</span>`,
				)}
			</div>
		</div>`,
		mock,
	);
}
renderMock("s-home", "switcher");

// Scrolling the page travels between worlds: each section and each spaces step has a data-hue, and whichever
// crosses a thin band across the screen sets the page's hue. The hero follows the demo instead. On phones the band
// sits lower, below the sticky sidebar copy, so the step being described isn't hidden under it.
const steps = [...document.querySelectorAll<HTMLElement>(".step")];
const hero = must<HTMLElement>(".hero");
const band = new IntersectionObserver(
	(entries) => {
		for (const entry of entries) {
			if (entry.target === hero) {
				heroInView = entry.isIntersecting;
				if (heroInView) setHue(demoHue);
				continue;
			}
			if (!entry.isIntersecting) continue;
			const target = entry.target as HTMLElement;
			setHue(Number(target.dataset.hue));
			if (!target.classList.contains("step")) continue;
			for (const other of steps) other.classList.toggle("current", other === target);
			renderMock(target.dataset.space ?? "s-home", target.dataset.focus ?? "");
		}
	},
	{ rootMargin: phone.matches ? "-58% 0px -32% 0px" : "-45% 0px -45% 0px" },
);
band.observe(hero);
for (const target of document.querySelectorAll<HTMLElement>("[data-hue]")) band.observe(target);

// ---- Roadmap votes, sent along with the waitlist email ----

const WANTS_KEY = "loka.site.wants";
const wants = new Set<string>(JSON.parse(localStorage.getItem(WANTS_KEY) ?? "[]") as string[]);
const ideaOrder = [...document.querySelectorAll<HTMLElement>("[data-idea]")].map((el) => el.dataset.idea ?? "");

function renderWants() {
	for (const idea of document.querySelectorAll<HTMLElement>("[data-idea]")) {
		const on = wants.has(idea.dataset.idea ?? "");
		idea.classList.toggle("wanted", on);
		const button = must<HTMLButtonElement>(".want", idea);
		button.setAttribute("aria-pressed", String(on));
		button.textContent = on ? "Wanted" : "Want this";
	}
	const note = document.querySelector<HTMLElement>("[data-wants-note]");
	if (note && wants.size) {
		note.textContent = `Sent with your email: ${ideaOrder.filter((idea) => wants.has(idea)).join(", ")}.`;
	}
}
for (const idea of document.querySelectorAll<HTMLElement>("[data-idea]")) {
	must<HTMLButtonElement>(".want", idea).addEventListener("click", () => {
		const name = idea.dataset.idea ?? "";
		if (wants.has(name)) wants.delete(name);
		else wants.add(name);
		localStorage.setItem(WANTS_KEY, JSON.stringify([...wants]));
		renderWants();
	});
}
renderWants();

// ---- Waitlist ----

const JOINED_KEY = "loka.site.joined";
const forms = [...document.querySelectorAll<HTMLFormElement>("[data-waitlist]")];

// lit's render() adds to what's already in a container, so the static markup is cleared before each one-off render.
function showJoined(email: string) {
	for (const form of forms) {
		form.classList.add("joined");
		form.replaceChildren();
		render(
			html`<p class="joined-note" role="status"><span class="check" aria-hidden="true"></span> You're on the list as
				<b>${email}</b>. We'll write once, when the Windows build is ready.</p>`,
			form,
		);
	}
}

function setNote(form: HTMLFormElement, text: string, tone: "error" | "info", link?: { href: string; label: string }) {
	const note = must<HTMLElement>(".form-note", form);
	note.dataset.tone = tone;
	note.textContent = text;
	if (!link) return;
	const a = document.createElement("a");
	a.href = link.href;
	a.textContent = link.label;
	note.append(" ", a, ".");
}

for (const form of forms) {
	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const input = must<HTMLInputElement>("input[name=email]", form);
		const email = normalizeEmail(input.value);
		if (!email) {
			input.setAttribute("aria-invalid", "true");
			setNote(form, "That doesn't look like an email address.", "error");
			input.focus();
			return;
		}
		input.removeAttribute("aria-invalid");
		if (!WAITLIST_URL) {
			setNote(form, "The waitlist isn't open yet. To hear first,", "info", {
				href: `https://github.com/${REPO}`,
				label: "watch the repo on GitHub",
			});
			return;
		}
		const button = must<HTMLButtonElement>("button[type=submit]", form);
		button.disabled = true;
		button.textContent = "Joining...";
		try {
			const response = await fetch(WAITLIST_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json", Accept: "application/json" },
				body: waitlistBody(
					email,
					ideaOrder.filter((idea) => wants.has(idea)),
				),
			});
			if (!response.ok) throw new Error(`waitlist answered ${response.status}`);
			localStorage.setItem(JOINED_KEY, email);
			showJoined(email);
		} catch (error) {
			console.warn(error);
			button.disabled = false;
			button.textContent = "Join the waitlist";
			setNote(form, "Couldn't reach the waitlist. Try again in a minute.", "error");
		}
	});
}
const joined = localStorage.getItem(JOINED_KEY);
if (joined) showJoined(joined);

// ---- GitHub: latest commits, and the star count once it's worth showing ----

async function github(path: string): Promise<unknown> {
	// Cached for ten minutes per tab, because GitHub allows 60 unauthenticated requests an hour per visitor.
	const key = `loka.site.gh.${path}`;
	const cached = sessionStorage.getItem(key);
	if (cached) {
		const { at, json } = JSON.parse(cached) as { at: number; json: unknown };
		if (Date.now() - at < 10 * 60 * 1000) return json;
	}
	const response = await fetch(`https://api.github.com/repos/${REPO}${path}`);
	if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
	const json: unknown = await response.json();
	sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), json }));
	return json;
}

const commitList = must<HTMLElement>("[data-commits]");
github("/commits?per_page=12")
	.then((json) => {
		const now = new Date();
		commitList.replaceChildren(); // drop the static "Loading" row; lit only manages what it rendered
		render(
			commitsFromApi(json, 5).map(
				(c) => html`<li>
					<a href=${c.url}><code>${c.sha}</code><span class="msg">${c.message}</span></a>
					<time datetime=${c.date}>${timeAgo(c.date, now)}</time>
				</li>`,
			),
			commitList,
		);
	})
	.catch(() => {
		commitList.replaceChildren();
		render(
			html`<li class="commit-empty">Couldn't load commits. <a href="https://github.com/${REPO}/commits">See them on GitHub</a>.</li>`,
			commitList,
		);
	});

github("")
	.then((json) => {
		const stars = Number((json as { stargazers_count?: number }).stargazers_count);
		// A tiny count reads as "nobody uses this", so the button shows a number only once there is a real one.
		if (!(stars >= 25)) return;
		const label = must<HTMLElement>(".gh-stars");
		label.textContent = stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : String(stars);
		label.hidden = false;
	})
	.catch(() => {});

// ---- Small things ----

const copyButton = must<HTMLButtonElement>("[data-copy]");
copyButton.addEventListener("click", async () => {
	await navigator.clipboard.writeText(must<HTMLElement>(".try code").innerText);
	copyButton.textContent = "Copied";
	setTimeout(() => {
		copyButton.textContent = "Copy";
	}, 1600);
});

// The !bang card types a few real bangs, one after another.
const bangs: [string, string, string][] = [
	["!gh", "loka", "github.com/search"],
	["!w", "Chromium", "en.wikipedia.org"],
	["!yt", "lofi beats", "youtube.com/results"],
	["!mdn", "dialog", "developer.mozilla.org"],
];
if (!reducedMotion) {
	const bangInput = must<HTMLElement>(".bang-input b");
	const bangText = must<HTMLElement>("[data-bang-text]");
	const bangTarget = must<HTMLElement>("[data-bang-target]");
	let index = 0;
	setInterval(() => {
		index = (index + 1) % bangs.length;
		const [bang, query, target] = bangs[index] ?? bangs[0] ?? ["", "", ""];
		bangInput.textContent = bang;
		bangText.textContent = query;
		bangTarget.textContent = target;
		bangTarget.classList.remove("go");
		void bangTarget.offsetWidth; // restart the arrive animation
		bangTarget.classList.add("go");
	}, 2600);
}

// Cards light up under the pointer.
for (const card of document.querySelectorAll<HTMLElement>(".card, .idea")) {
	card.addEventListener("pointermove", (e) => {
		const box = card.getBoundingClientRect();
		card.style.setProperty("--mx", `${e.clientX - box.left}px`);
		card.style.setProperty("--my", `${e.clientY - box.top}px`);
	});
}
