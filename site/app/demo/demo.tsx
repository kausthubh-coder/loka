"use client";

// The hero's live sidebar. It looks and behaves like the prototype's (prototype/src/features/sidebar/loka-sidebar.ts):
// the same rows, folders without arrows, the horizon of planets, and the space's color over the whole page.

import {
	type CSSProperties,
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
	type WheelEvent,
} from "react";
import { Planet, type PlanetKind } from "../planet";
import {
	activate,
	addSpace,
	clearOpen,
	closeTab,
	type Demo as DemoState,
	type Found,
	faviconColor,
	findTabs,
	holds,
	hostOf,
	MAX_SPACES,
	type Node,
	nextHue,
	openTyped,
	PLANET_KINDS,
	reveal,
	SPACE_HUES,
	seed,
	spaceAt,
	tabOf,
	toggleFolder,
} from "./demo.logic";
import "./demo.css";

type Draft = { name: string; hue: number; planet: PlanetKind };
type Overlay = null | "spaces" | "editor" | "command";

const PLANET_NAMES: Record<PlanetKind, string> = {
	ringed: "Ringed",
	banded: "Banded",
	cratered: "Cratered",
	ocean: "Ocean",
};

let made = 0;
const newId = (prefix: string) => `${prefix}-${++made}`;

export function Demo() {
	const [demo, setDemo] = useState<DemoState>(seed);
	// Which way the last switch went, so the new list slides in from that side.
	const [dir, setDir] = useState<"left" | "right" | "none">("none");
	const [overlay, setOverlay] = useState<Overlay>(null);
	const [draft, setDraft] = useState<Draft>({ name: "", hue: 330, planet: "cratered" });
	// The space just made, so its planet forms instead of rising.
	const [born, setBorn] = useState<string | null>(null);
	const swipe = useRef({ wheel: 0, at: 0, x: null as number | null });

	const space = spaceAt(demo);
	const hue = overlay === "editor" ? draft.hue : space.hue;

	// The page around the demo takes the space's color too, and eases to it (--hue is registered in globals.css).
	useEffect(() => {
		document.documentElement.style.setProperty("--hue", String(hue));
	}, [hue]);

	const go = (index: number) => {
		if (index < 0 || index >= demo.spaces.length || index === demo.current) return;
		setDir(index > demo.current ? "right" : "left");
		setBorn(null);
		setDemo((d) => ({ ...d, current: index }));
	};

	const onWheel = (e: WheelEvent) => {
		// A two-finger swipe sideways on the sidebar moves one space, like the browser's.
		if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
		const s = swipe.current;
		if (e.timeStamp - s.at < 450) return;
		s.wheel += e.deltaX;
		if (Math.abs(s.wheel) > 60) {
			go(demo.current + (s.wheel > 0 ? 1 : -1));
			s.wheel = 0;
			s.at = e.timeStamp;
		}
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
			e.preventDefault();
			setOverlay("command");
		} else if (e.key === "Escape" && overlay) {
			setOverlay(null);
		}
	};

	const openEditor = () => {
		setDraft({
			name: "",
			hue: nextHue(demo),
			planet: PLANET_KINDS[demo.spaces.length % PLANET_KINDS.length] ?? "cratered",
		});
		setOverlay("editor");
	};

	const create = () => {
		const id = newId("space");
		setDir("right");
		setBorn(id);
		setDemo((d) => addSpace(d, draft.name, draft.hue, draft.planet, id));
		setOverlay(null);
	};

	const prev = demo.spaces[demo.current - 1];
	const next = demo.spaces[demo.current + 1];
	const activeTab = space.active ? tabOf(demo.tabs, space.active) : null;

	return (
		<section
			className="demo"
			aria-label="loka, live demo"
			style={{ "--hue": hue } as CSSProperties}
			onKeyDown={onKeyDown}
		>
			<aside className="d-side" onWheel={onWheel}>
				<div className="d-toolbar" aria-hidden="true">
					<Icon d="M10 3 5 8l5 5" />
					<Icon d="m6 3 5 5-5 5" />
					<Icon d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3" />
					<span className="d-push" />
					<span className="d-ext">u</span>
					<Icon d="M8 2.5v8m-3-3 3 3 3-3M3 13.5h10" />
					<Icon d="M3.5 8h.01M8 8h.01M12.5 8h.01" />
				</div>

				<button type="button" className="d-url" onClick={() => setOverlay("command")}>
					<span>{activeTab ? hostOf(activeTab.url) : "Search or enter address"}</span>
					<kbd>Ctrl K</kbd>
				</button>

				<div className="d-essentials">
					{demo.essentials.map((id) => (
						<button
							key={id}
							type="button"
							className={`d-essential${space.active === id ? " active" : ""}`}
							aria-label={tabOf(demo.tabs, id).title}
							title={tabOf(demo.tabs, id).title}
							onClick={() => setDemo((d) => activate(d, id))}
						>
							<Fav url={tabOf(demo.tabs, id).url} size={22} />
						</button>
					))}
				</div>

				<div className={`d-list from-${dir}`} key={space.id}>
					<Tree
						nodes={space.pinned}
						depth={0}
						active={space.active}
						tabs={demo.tabs}
						onTab={(id) => setDemo((d) => activate(d, id))}
						onFolder={(id) => setDemo((d) => toggleFolder(d, id))}
					/>
					{space.pinned.length === 0 ? <p className="d-empty">Pin tabs here to keep them in {space.name}.</p> : null}
					<div className="d-divider">
						<span />
						{space.open.length ? (
							<button type="button" className="d-clear" onClick={() => setDemo(clearOpen)}>
								Clear
							</button>
						) : null}
					</div>
					<button type="button" className="d-row d-new" onClick={() => setOverlay("command")}>
						<span className="d-plus" aria-hidden="true">
							+
						</span>
						New tab
					</button>
					{space.open.map((id) => (
						<div key={id} className={`d-row d-open${space.active === id ? " active" : ""}`}>
							<button type="button" className="d-hit" onClick={() => setDemo((d) => activate(d, id))}>
								<Fav url={tabOf(demo.tabs, id).url} size={18} />
								<span className="d-label">{tabOf(demo.tabs, id).title}</span>
							</button>
							<button
								type="button"
								className="d-close"
								aria-label={`Close ${tabOf(demo.tabs, id).title}`}
								onClick={() => setDemo((d) => closeTab(d, id))}
							>
								<Icon d="m4.5 4.5 7 7m0-7-7 7" />
							</button>
						</div>
					))}
				</div>

				<nav
					className="d-horizon"
					aria-label="Spaces"
					onPointerDown={(e) => {
						swipe.current.x = e.clientX;
					}}
					onPointerUp={(e) => {
						const start = swipe.current.x;
						swipe.current.x = null;
						if (start !== null && Math.abs(e.clientX - start) > 40) go(demo.current + (e.clientX < start ? 1 : -1));
					}}
				>
					{prev ? (
						<button
							key={`l-${prev.id}`}
							type="button"
							className="d-neighbour left"
							aria-label={`Go to ${prev.name}`}
							title={prev.name}
							onClick={() => go(demo.current - 1)}
						>
							<Planet kind={prev.planet} hue={prev.hue} size={30} />
						</button>
					) : null}
					<button
						key={space.id}
						type="button"
						className={`d-world${born === space.id ? " born" : ""}`}
						aria-label={`Spaces: ${space.name}. Show all spaces`}
						aria-expanded={overlay === "spaces"}
						onClick={() => setOverlay(overlay === "spaces" ? null : "spaces")}
						onKeyDown={(e) => {
							if (e.key === "ArrowRight") go(demo.current + 1);
							if (e.key === "ArrowLeft") go(demo.current - 1);
						}}
					>
						<Planet kind={overlay === "editor" ? draft.planet : space.planet} hue={hue} size={400} horizon />
					</button>
					<span key={`n-${space.id}`} className="d-world-name" aria-hidden="true">
						{overlay === "editor" ? draft.name || "New space" : space.name}
					</span>
					{next ? (
						<button
							key={`r-${next.id}`}
							type="button"
							className="d-neighbour right"
							aria-label={`Go to ${next.name}`}
							title={next.name}
							onClick={() => go(demo.current + 1)}
						>
							<Planet kind={next.planet} hue={next.hue} size={30} />
						</button>
					) : demo.spaces.length < MAX_SPACES ? (
						<button type="button" className="d-neighbour right d-add" aria-label="New space" onClick={openEditor}>
							+
						</button>
					) : null}
				</nav>

				{overlay === "spaces" ? (
					<div className="d-menu" role="menu" aria-label="Spaces">
						{demo.spaces.map((s, i) => (
							<button
								key={s.id}
								type="button"
								role="menuitemradio"
								aria-checked={i === demo.current}
								onClick={() => {
									go(i);
									setOverlay(null);
								}}
							>
								<Planet kind={s.planet} hue={s.hue} size={18} />
								<span className="d-label">{s.name}</span>
								{i === demo.current ? <span className="d-check">✓</span> : null}
							</button>
						))}
						<button type="button" role="menuitem" disabled={demo.spaces.length >= MAX_SPACES} onClick={openEditor}>
							<span className="d-plus" aria-hidden="true">
								+
							</span>
							<span className="d-label">New space</span>
						</button>
					</div>
				) : null}

				{overlay === "editor" ? (
					<SpaceEditor draft={draft} onChange={setDraft} onCancel={() => setOverlay(null)} onCreate={create} />
				) : null}
			</aside>

			<div className="d-page">
				<Page key={space.active ?? `none-${space.id}`} tab={activeTab} spaceName={space.name} />
			</div>

			{overlay === "command" ? (
				<CommandBar
					demo={demo}
					onClose={() => setOverlay(null)}
					onOpen={(text) => {
						setDemo((d) => openTyped(d, text, newId("tab")));
						setOverlay(null);
					}}
					onReveal={(found) => {
						if (found.space !== null && found.space !== demo.current) {
							setDir(found.space > demo.current ? "right" : "left");
						}
						setDemo((d) => reveal(d, found));
						setOverlay(null);
					}}
				/>
			) : null}
		</section>
	);
}

function Tree({
	nodes,
	depth,
	active,
	tabs,
	onTab,
	onFolder,
}: {
	nodes: Node[];
	depth: number;
	active: string | null;
	tabs: DemoState["tabs"];
	onTab: (id: string) => void;
	onFolder: (id: string) => void;
}): ReactNode {
	return nodes.map((n) =>
		n.kind === "tab" ? (
			<button
				key={n.id}
				type="button"
				className={`d-row${active === n.id ? " active" : ""}`}
				style={{ "--depth": depth } as CSSProperties}
				onClick={() => onTab(n.id)}
			>
				<Fav url={tabOf(tabs, n.id).url} size={18} />
				<span className="d-label">{tabOf(tabs, n.id).title}</span>
			</button>
		) : (
			<div key={n.id} className="d-folder-group">
				<button
					type="button"
					className="d-row"
					style={{ "--depth": depth } as CSSProperties}
					aria-expanded={n.open}
					onClick={() => onFolder(n.id)}
				>
					<FolderIcon open={n.open} holdsActive={!n.open && holds(n, active)} />
					<span className="d-label">{n.name}</span>
					{n.open ? null : <span className="d-count">{n.children.length}</span>}
				</button>
				{n.open ? (
					<div className="d-children">
						<Tree nodes={n.children} depth={depth + 1} active={active} tabs={tabs} onTab={onTab} onFolder={onFolder} />
					</div>
				) : null}
			</div>
		),
	);
}

/** No arrow: the icon itself is open or closed, and a closed one marks the tab you're on with a dot. */
function FolderIcon({ open, holdsActive }: { open: boolean; holdsActive: boolean }) {
	return open ? (
		<svg className="d-folder" viewBox="0 0 16 16" aria-hidden="true">
			<path d="M2.4 12.6 1.6 12V4.6c0-.8.6-1.4 1.4-1.4h3l1.6 1.6h4.2c.8 0 1.4.6 1.4 1.4v1.1" />
			<path
				className="body"
				d="M4.2 7.4h10.1c.6 0 1 .6.8 1.1l-1.4 4.2c-.2.5-.6.8-1.1.8H2.3c-.6 0-1-.6-.8-1.1l1.5-4.2c.2-.5.6-.8 1.2-.8z"
			/>
		</svg>
	) : (
		<svg className="d-folder" viewBox="0 0 16 16" aria-hidden="true">
			<path
				className="body"
				d="M1.6 4.6c0-.8.6-1.4 1.4-1.4h3l1.6 1.6H13c.8 0 1.4.6 1.4 1.4v6.2c0 .8-.6 1.4-1.4 1.4H3c-.8 0-1.4-.6-1.4-1.4z"
			/>
			<path className="lip" d="M1.9 6.6h12.2" />
			{holdsActive ? <circle className="holds" cx="13" cy="12.4" r="2.2" /> : null}
		</svg>
	);
}

function Fav({ url, size }: { url: string; size: number }) {
	return (
		<span className="d-fav" style={{ "--size": `${size}px`, "--fav": faviconColor(url) } as CSSProperties}>
			{(hostOf(url)[0] ?? "?").toUpperCase()}
		</span>
	);
}

function Icon({ d }: { d: string }) {
	return (
		<svg className="d-icon" viewBox="0 0 16 16" aria-hidden="true">
			<path d={d} />
		</svg>
	);
}

/** A stand-in web page for the tab that's showing: its tile, title, address and some grey lines. */
function Page({ tab, spaceName }: { tab: { title: string; url: string } | null; spaceName: string }) {
	if (!tab) {
		return (
			<div className="d-site d-site-empty">
				<p>Nothing open in {spaceName} yet.</p>
				<p>
					Press <kbd>Ctrl K</kbd> or click New tab.
				</p>
			</div>
		);
	}
	const fav = { "--fav": faviconColor(tab.url) } as CSSProperties;
	return (
		<div className="d-site" style={fav}>
			<nav aria-hidden="true">
				<Fav url={tab.url} size={22} />
				<span className="d-pill" />
				<span className="d-pill" />
				<span className="d-pill short" />
			</nav>
			<header>
				<div>
					<h3>{tab.title}</h3>
					<p>{hostOf(tab.url)}</p>
				</div>
			</header>
			<span className="d-line" style={{ width: "72%" }} />
			<span className="d-line" style={{ width: "58%" }} />
			<span className="d-block" />
			<div className="d-cards" aria-hidden="true">
				<span />
				<span />
				<span />
			</div>
		</div>
	);
}

function SpaceEditor({
	draft,
	onChange,
	onCancel,
	onCreate,
}: {
	draft: Draft;
	onChange: (d: Draft) => void;
	onCancel: () => void;
	onCreate: () => void;
}) {
	return (
		<form
			className="d-editor"
			aria-label="New space"
			onSubmit={(e) => {
				e.preventDefault();
				onCreate();
			}}
		>
			<h4>New space</h4>
			<label className="d-field">
				<span>Name</span>
				<input
					// biome-ignore lint/a11y/noAutofocus: the editor opens because the user asked for it; typing the name is next.
					autoFocus
					value={draft.name}
					placeholder="Reading"
					maxLength={20}
					onChange={(e) => onChange({ ...draft, name: e.target.value })}
				/>
			</label>
			<fieldset>
				<legend>Color</legend>
				<div className="d-swatches">
					{SPACE_HUES.map((h) => (
						<label key={h} className="d-swatch" style={{ "--h": h } as CSSProperties}>
							<input
								type="radio"
								name="hue"
								checked={draft.hue === h}
								onChange={() => onChange({ ...draft, hue: h })}
								aria-label={`Color ${h}`}
							/>
						</label>
					))}
				</div>
			</fieldset>
			<fieldset>
				<legend>Planet</legend>
				<div className="d-kinds">
					{PLANET_KINDS.map((k) => (
						<label key={k} className="d-kind" title={PLANET_NAMES[k]}>
							<input
								type="radio"
								name="planet"
								checked={draft.planet === k}
								onChange={() => onChange({ ...draft, planet: k })}
								aria-label={PLANET_NAMES[k]}
							/>
							<Planet kind={k} hue={draft.hue} size={28} />
						</label>
					))}
				</div>
			</fieldset>
			<div className="d-editor-actions">
				<button type="button" className="d-ghost" onClick={onCancel}>
					Cancel
				</button>
				<button type="submit" className="d-primary">
					Create space
				</button>
			</div>
		</form>
	);
}

function CommandBar({
	demo,
	onClose,
	onOpen,
	onReveal,
}: {
	demo: DemoState;
	onClose: () => void;
	onOpen: (text: string) => void;
	onReveal: (found: Found) => void;
}) {
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState(0);
	const found = findTabs(demo, query);
	// The typed text is always the first row (open it, or search for it), then the tabs that match.
	const rows = query.trim() ? 1 + found.length : found.length;

	const pick = (i: number) => {
		if (query.trim() && i === 0) onOpen(query);
		else {
			const f = found[query.trim() ? i - 1 : i];
			if (f) onReveal(f);
		}
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: clicking the dimmed backdrop closes the bar, as Escape does.
		<div className="d-command-backdrop" onClick={onClose} onKeyDown={() => {}} role="presentation">
			<div
				className="d-command"
				role="dialog"
				aria-label="Command bar"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<input
					// biome-ignore lint/a11y/noAutofocus: the bar opens because the user asked for it; typing is next.
					autoFocus
					role="combobox"
					aria-expanded={rows > 0}
					aria-controls="d-results"
					aria-label="Search tabs or enter an address"
					placeholder="Search tabs in every space, or type an address"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setSelected(0);
					}}
					onKeyDown={(e) => {
						if (e.key === "ArrowDown") {
							e.preventDefault();
							setSelected((s) => Math.min(s + 1, rows - 1));
						} else if (e.key === "ArrowUp") {
							e.preventDefault();
							setSelected((s) => Math.max(s - 1, 0));
						} else if (e.key === "Enter" && rows) {
							pick(selected);
						} else if (e.key === "Escape") {
							onClose();
						}
					}}
				/>
				<div id="d-results" role="listbox" aria-label="Results">
					{query.trim() ? (
						<button
							type="button"
							role="option"
							aria-selected={selected === 0}
							className="d-result"
							onClick={() => pick(0)}
						>
							<span className="d-result-icon" aria-hidden="true">
								{/\./.test(query) ? "↗" : "⌕"}
							</span>
							<span className="d-label">
								{/\./.test(query) ? `Open ${query.trim()}` : `Search for “${query.trim()}”`}
							</span>
						</button>
					) : (
						<p className="d-hint">Try “canvas”, “docs” or “music”.</p>
					)}
					{found.map((f, i) => {
						const row = query.trim() ? i + 1 : i;
						const t = tabOf(demo.tabs, f.tabId);
						const where = f.space === null ? "Essentials" : spaceAt(demo, f.space).name;
						return (
							<button
								key={`${f.tabId}-${f.space}`}
								type="button"
								role="option"
								aria-selected={selected === row}
								className="d-result"
								onClick={() => pick(row)}
							>
								<Fav url={t.url} size={18} />
								<span className="d-label">{t.title}</span>
								<span
									className="d-where"
									style={{ "--h": f.space === null ? spaceAt(demo).hue : spaceAt(demo, f.space).hue } as CSSProperties}
								>
									{where}
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
