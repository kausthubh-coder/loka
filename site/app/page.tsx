import { existsSync } from "node:fs";
import { join } from "node:path";
import { Waitlist } from "@clerk/nextjs";
import Image, { type StaticImageData } from "next/image";
import type { CSSProperties } from "react";
import archive from "@/public/product/archive.png";
import commandBar from "@/public/product/command-bar.png";
import folders from "@/public/product/folders.png";
import importShot from "@/public/product/import-crop.png";
import media from "@/public/product/media.png";
import search from "@/public/product/search.png";
import sidebarBuild from "@/public/product/sidebar-build.png";
import sidebarHome from "@/public/product/sidebar-home.png";
import sidebarSchool from "@/public/product/sidebar-school.png";
import { Demo } from "./demo/demo";
import { Mark, Planet, type PlanetKind } from "./planet";
import { Sky } from "./sky";

const GITHUB = "https://github.com/kausthubh-coder/loka";
const RELEASES = `${GITHUB}/releases`;

// The prototype's seed spaces, in its order and colors (prototype/src/features/sidebar/sidebar.seed.ts).
const SPACES: { id: string; name: string; hue: number; planet: PlanetKind; sidebar: StaticImageData; holds: string }[] =
	[
		{ id: "build", name: "Build", hue: 200, planet: "ringed", sidebar: sidebarBuild, holds: "Code, docs, the build" },
		{ id: "school", name: "School", hue: 30, planet: "banded", sidebar: sidebarSchool, holds: "Canvas and coursework" },
		{ id: "home", name: "Home", hue: 150, planet: "ocean", sidebar: sidebarHome, holds: "Music and the weekend" },
	];

// `width` is the size each crop is shown at, in CSS px: about the UI's real size, so its text reads. Wide cards take
// two of the grid's three columns.
const FEATURES: {
	title: string;
	body: string;
	image: StaticImageData;
	width: number;
	wide?: boolean;
	keys?: string;
	alt: string;
}[] = [
	{
		title: "Find any tab, in any space",
		body: "The command bar opens a page, searches the web, or runs a command. It finds tabs in every space and says which space each one is in.",
		image: commandBar,
		width: 600,
		wide: true,
		keys: "Ctrl K",
		alt: "The command bar with “canvas” typed: a web search row, then the Canvas: CSC 281 tab, marked as being in School.",
	},
	{
		title: "Search the whole sidebar",
		body: "Pick a result and loka takes you there, opening the folders on the way.",
		image: search,
		width: 300,
		keys: "Ctrl Shift F",
		alt: "Sidebar search with “minecraft” typed, finding Minecraft farm designs in School, inside CSC 281, inside Game project.",
	},
	{
		title: "Folders inside folders",
		body: "Drop one tab on another to make a folder of both. A closed folder still shows the tab you're on.",
		image: folders,
		width: 300,
		alt: "Build's pinned tabs: a Loka folder holding imputnet/helium-windows and a Docs folder, which holds Chromium: Windows build guide and Lit docs.",
	},
	{
		title: "Old tabs put themselves away",
		body: "Turn on the archive and tabs you haven't looked at for a day or a week move out of the way, ready to bring back.",
		image: archive,
		// A 1x shot from a verify run, so shown at its real size rather than scaled up.
		width: 272,
		alt: "The Archived tabs panel listing two tabs, Arc: what we learned and Zen Browser, with a search field.",
	},
	{
		title: "Music from any space",
		body: "Whatever plays in another space gets a card above the horizon: pause, skip, mute, or jump to it.",
		image: media,
		width: 300,
		alt: "A now-playing card for Lo-fi beats by Lofi Girl, with previous, pause, next and mute buttons, above the horizon.",
	},
];

const FAQ: { q: string; a: string }[] = [
	{
		q: "Can I use it today?",
		a: "Not as a browser yet. The sidebar works as a clickable web prototype, which is what every picture on this page shows. The browser is being built on Helium now, and the waitlist gets the first Windows build.",
	},
	{
		q: "Which platforms?",
		a: "Windows first. macOS and Linux come later; Helium already runs on both, so the base is there.",
	},
	{
		q: "Does it cost anything?",
		a: "No. loka is free, and open source under the GPL-3.0 license.",
	},
	{
		q: "Will my Chrome extensions work?",
		a: "Yes. Underneath, loka is Chromium by way of Helium, so extensions from the Chrome Web Store install as usual.",
	},
	{
		q: "Can I bring my Arc spaces?",
		a: "Yes. The import reads Arc's sidebar file and turns each Arc space into a loka space with its folders and pinned tabs. Bookmarks from Chrome and Edge come in as folders.",
	},
	{
		q: "How is it different from Arc or Zen?",
		a: "Arc is closed source. Zen is open source but built on Firefox. loka is open source and built on Chromium, through Helium, so Chrome extensions and sites behave the way they do in Chrome.",
	},
	{
		q: "Where's the code?",
		a: "On GitHub, at github.com/kausthubh-coder/loka. The sidebar prototype runs with bun run dev.",
	},
];

// The launch video only exists once it has been rendered (see video/ in the repo), so the section waits for the file.
const hasVideo = ["launch.mp4", "launch-poster.jpg"].every((f) => existsSync(join(process.cwd(), "public", f)));

export default function Page() {
	return (
		<>
			<Sky />
			<header className="nav">
				<a className="wordmark" href="/" aria-label="loka home">
					<Mark size={28} />
					loka
				</a>
				<nav aria-label="Site">
					<a className="link" href={GITHUB}>
						GitHub
					</a>
					<a className="button small" href="#waitlist">
						Join the waitlist
					</a>
				</nav>
			</header>

			<main>
				<section className="hero" aria-labelledby="hero-title">
					<h1 id="hero-title">Every space is its own world</h1>
					<p className="lead">
						loka is a calm, Arc-style browser for Windows. Your tabs live in a sidebar of spaces, with folders inside
						folders, and each space brings its own color and its own sky. It's open source and built on Helium, so it
						stays private and fast, and Chrome extensions still work.
					</p>
					<div className="actions">
						<a className="button" href="#waitlist">
							Join the waitlist
						</a>
						<a className="link" href={RELEASES}>
							Try the Windows alpha
						</a>
					</div>

					<figure className="window">
						<Demo />
						<figcaption>
							<span>This is live. Click a tab or a folder.</span>
							<span>Click a planet or swipe sideways to change space.</span>
							<span>
								<b>+</b> makes a new one, and <kbd>Ctrl</kbd> <kbd>K</kbd> searches every space.
							</span>
						</figcaption>
					</figure>
				</section>

				{hasVideo ? (
					<section className="video" aria-labelledby="video-title">
						<h2 id="video-title">Watch the tour</h2>
						{/* Loads nothing but the poster until someone presses play. */}
						<video
							controls
							playsInline
							preload="none"
							poster="/launch-poster.jpg"
							width={1920}
							height={1080}
							aria-labelledby="video-title"
						>
							<source src="/launch.mp4" type="video/mp4" />
							{/* The only sound is a music bed; every word in the video is on screen. */}
							<track kind="captions" src="/launch.vtt" srcLang="en" label="English" />
						</video>
					</section>
				) : null}

				<section className="spaces" aria-labelledby="spaces-title">
					<div className="copy">
						<h2 id="spaces-title">A planet for every space</h2>
						<p>
							A space keeps its own pinned tabs, folders and open tabs, and paints the window its color. Work stays in
							Build, coursework in School, music in Home.
						</p>
						<p>
							The space you're in rises as a planet at the bottom of the sidebar, with its neighbours on either side.
							Click one, swipe with two fingers, or press Ctrl+1 to Ctrl+9.
						</p>
					</div>
					<ul className="sidebars">
						{SPACES.map((s) => (
							<li key={s.id} style={{ "--h": s.hue } as CSSProperties}>
								<Image
									src={s.sidebar}
									alt={`The sidebar in ${s.name}: ${s.holds.toLowerCase()}.`}
									sizes="272px"
									placeholder="blur"
								/>
								<p>
									<Planet kind={s.planet} hue={s.hue} size={18} />
									<b>{s.name}</b>
									<span>{s.holds}</span>
								</p>
							</li>
						))}
					</ul>
				</section>

				<section className="features" aria-labelledby="features-title">
					<h2 id="features-title">The rest of what you reach for</h2>
					<div className="bento">
						{FEATURES.map((f) => (
							<article key={f.title} className={f.wide ? "wide" : undefined}>
								<div className="stage">
									<Image
										className="crop"
										src={f.image}
										alt={f.alt}
										style={{ width: f.width }}
										sizes={`(min-width: 760px) ${f.width}px, calc(100vw - 64px)`}
										placeholder="blur"
									/>
								</div>
								<div className="card-copy">
									<h3>
										{f.title}
										{f.keys ? <kbd>{f.keys}</kbd> : null}
									</h3>
									<p>{f.body}</p>
								</div>
							</article>
						))}
					</div>
				</section>

				<section className="split reverse" aria-labelledby="import-title">
					<div className="copy">
						<h2 id="import-title">Bring your browser along</h2>
						<p>
							The first-run tour imports bookmarks from Chrome and Edge, and spaces, folders and pinned tabs from Arc.
							Then you name your first three spaces and pick their colors. It takes about a minute.
						</p>
					</div>
					<Image
						className="crop"
						src={importShot}
						alt="The tour's import step: Chrome ready with 4 bookmarks, Edge unchecked, Arc ready with 2 spaces and 3 pinned tabs, and an Import from 2 browsers button."
						sizes="(min-width: 900px) 640px, calc(100vw - 32px)"
						placeholder="blur"
					/>
				</section>

				<section className="why" aria-labelledby="why-title">
					<h2 id="why-title">Private and fast, because it's Helium</h2>
					<p className="intro">
						loka is a set of patches on <a href="https://helium.computer/">Helium</a>, an open-source browser built on
						ungoogled-chromium. You get what Helium does, with loka's sidebar on top.
					</p>
					<ul>
						<li>
							<h3>uBlock Origin built in</h3>
							<p>Ads, trackers and cookie banners are blocked from the first launch.</p>
						</li>
						<li>
							<h3>No Google services</h3>
							<p>Helium removes Chromium's Google dependencies and sends nothing in the background without asking.</p>
						</li>
						<li>
							<h3>Chrome extensions work</h3>
							<p>Install them from the Chrome Web Store. Helium anonymizes those requests.</p>
						</li>
						<li>
							<h3>Open source, GPL-3.0</h3>
							<p>
								Read the code, build it yourself, or send a patch <a href={GITHUB}>on GitHub</a>.
							</p>
						</li>
					</ul>
				</section>

				<section className="join" id="waitlist" aria-labelledby="join-title">
					<div className="copy">
						<Mark size={72} />
						<h2 id="join-title">Get the first Windows build</h2>
						<p className="join-note">
							Leave your email and you'll hear when the beta is ready. Can't wait? The{" "}
							<a href={RELEASES}>Windows alpha is on GitHub</a>: unsigned and early, so expect rough edges.
						</p>
					</div>
					<div className="form">
						<Waitlist
							appearance={{
								variables: {
									// Clerk works out its own shades from these, so they are real colors, not CSS variables: Build's blue.
									colorPrimary: "#7dc8f5",
									colorPrimaryForeground: "#0d1d26",
									colorBackground: "#151e26",
									colorForeground: "#ececf1",
									colorMutedForeground: "#a7a8b4",
									colorInput: "#1d2933",
									colorInputForeground: "#ececf1",
									colorBorder: "#2d3c47",
									colorRing: "#7dc8f5",
									borderRadius: "8px",
									fontFamily: "inherit",
									fontFamilyButtons: "inherit",
									fontSize: "1rem",
								},
							}}
						/>
					</div>
				</section>

				<section className="faq" aria-labelledby="faq-title">
					<h2 id="faq-title">Questions</h2>
					{FAQ.map((f) => (
						<details key={f.q}>
							<summary>{f.q}</summary>
							<p>{f.a}</p>
						</details>
					))}
				</section>
			</main>

			<footer className="footer">
				<a className="wordmark" href="/" aria-label="loka home">
					<Mark size={22} />
					loka
				</a>
				<p>
					GPL-3.0. Built on <a href="https://helium.computer/">Helium</a> and ungoogled-chromium.
				</p>
				<a className="link" href={GITHUB}>
					Source on GitHub
				</a>
			</footer>
		</>
	);
}
