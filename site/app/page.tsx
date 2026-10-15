import { existsSync } from "node:fs";
import { join } from "node:path";
import { Waitlist } from "@clerk/nextjs";
import Image, { type StaticImageData } from "next/image";
import type { CSSProperties } from "react";
import archive from "@/public/product/archive.png";
import build from "@/public/product/build.png";
import commandBar from "@/public/product/command-bar.png";
import folders from "@/public/product/folders.png";
import home from "@/public/product/home.png";
import importShot from "@/public/product/import.png";
import media from "@/public/product/media.png";
import school from "@/public/product/school.png";
import search from "@/public/product/search.png";
import sidebarBuild from "@/public/product/sidebar-build.png";
import sidebarHome from "@/public/product/sidebar-home.png";
import sidebarSchool from "@/public/product/sidebar-school.png";
import { Mark, Planet, type PlanetKind } from "./planet";
import { Sky } from "./sky";

const GITHUB = "https://github.com/kausthubh-coder/loka";

type Space = {
	id: string;
	name: string;
	hue: number;
	planet: PlanetKind;
	window: StaticImageData;
	sidebar: StaticImageData;
	alt: string;
};

// The prototype's seed spaces, in its order and colors (prototype/src/features/sidebar/sidebar.seed.ts).
const SPACES: Space[] = [
	{
		id: "build",
		name: "Build",
		hue: 200,
		planet: "ringed",
		window: build,
		sidebar: sidebarBuild,
		alt: "loka in the Build space: a blue night-sky sidebar with four Essentials, a Loka folder holding a Docs folder, three open tabs, a music card, and Build's ringed planet rising at the bottom.",
	},
	{
		id: "school",
		name: "School",
		hue: 30,
		planet: "banded",
		window: school,
		sidebar: sidebarSchool,
		alt: "loka in the School space: the same window turned amber, with a Canvas tab and a CSC 281 folder pinned, and School's banded planet on the horizon.",
	},
	{
		id: "home",
		name: "Home",
		hue: 150,
		planet: "ocean",
		window: home,
		sidebar: sidebarHome,
		alt: "loka in the Home space: the window turned green, nothing open but the Lo-fi beats tab, and Home's ocean planet on the horizon.",
	},
];

// `width` is the size each crop is shown at, in CSS px: a little over the UI's real size, so its text reads.
const FEATURES: { title: string; body: string; image: StaticImageData; width: number; alt: string }[] = [
	{
		title: "Find any tab with Ctrl+K",
		body: "The command bar opens a page, searches the web, or runs a command. It finds tabs in every space and says which space each one is in.",
		image: commandBar,
		width: 640,
		alt: "The command bar with “canvas” typed: a web search row, then the Canvas: CSC 281 tab, marked as being in School.",
	},
	{
		title: "Search the whole sidebar",
		body: "Ctrl+Shift+F searches every space's tabs and folders. Pick a result and loka takes you there, opening the folders on the way.",
		image: search,
		width: 380,
		alt: "Sidebar search with “minecraft” typed, finding Minecraft farm designs in School, inside CSC 281, inside Game project.",
	},
	{
		title: "Old tabs put themselves away",
		body: "Turn on the archive and open tabs you haven't looked at for a day or a week move out of the way. Search the archive to bring one back.",
		image: archive,
		// A 1x shot from a verify run, so shown at its real size rather than scaled up.
		width: 272,
		alt: "The Archived tabs panel listing two tabs, Arc: what we learned and Zen Browser, with a search field.",
	},
	{
		title: "Music from any space",
		body: "Whatever plays in another space gets a card above the horizon: pause, skip, mute, or jump to the tab.",
		image: media,
		width: 380,
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
const hasVideo = existsSync(join(process.cwd(), "public", "launch.mp4"));

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
					<h1 id="hero-title">A calm, Arc-style browser for Windows</h1>
					<p className="lead">
						loka keeps your tabs in a sidebar of spaces, with folders inside folders. Each space is its own world, with
						its own color. It's open source and built on Helium, so it stays private and fast, and Chrome extensions
						still work.
					</p>
					<div className="actions">
						<a className="button" href="#waitlist">
							Join the waitlist
						</a>
						<span className="note">Free and open source. Windows first.</span>
					</div>

					<fieldset className="switcher">
						<legend>Pick a space</legend>
						{SPACES.map((s, i) => (
							<label key={s.id} style={{ "--h": s.hue } as CSSProperties}>
								<input type="radio" name="space" id={`space-${s.id}`} value={s.id} defaultChecked={i === 0} />
								<Planet kind={s.planet} hue={s.hue} size={22} />
								{s.name}
							</label>
						))}
					</fieldset>

					<figure className="window">
						<div className="shots">
							{SPACES.map((s, i) => (
								<Image
									key={s.id}
									className={`shot shot-${s.id}`}
									src={s.window}
									alt={s.alt}
									sizes="(min-width: 1260px) 1200px, calc(100vw - 32px)"
									priority={i === 0}
								/>
							))}
						</div>
						<figcaption>The sidebar prototype, with its demo data. Pick a space above and the sky follows.</figcaption>
					</figure>
				</section>

				{hasVideo ? (
					<section className="video" aria-labelledby="video-title">
						<h2 id="video-title">loka in 40 seconds</h2>
						<video
							controls
							playsInline
							preload="none"
							poster="/launch-poster.jpg"
							width={1920}
							height={1080}
							aria-describedby="video-title"
						>
							<source src="/launch.mp4" type="video/mp4" />
							{/* The video has music and no speech; the captions carry its on-screen words. */}
							<track kind="captions" src="/launch.vtt" srcLang="en" label="English" />
						</video>
					</section>
				) : null}

				<section className="spaces" aria-labelledby="spaces-title">
					<div className="copy">
						<h2 id="spaces-title">Every space is its own world</h2>
						<p>
							A space keeps its own pinned tabs, folders and open tabs, and paints the window its color. Work stays in
							Build, coursework in School, music in Home.
						</p>
						<p>
							The space you're in rises as a planet at the bottom of the sidebar, with its neighbours on either side.
							Click one, swipe with two fingers, or press Ctrl+1 to Ctrl+9.
						</p>
					</div>
					<div className="sidebars">
						{SPACES.map((s) => (
							<Image key={s.id} src={s.sidebar} alt={`The sidebar in ${s.name}.`} sizes="272px" placeholder="blur" />
						))}
					</div>
				</section>

				<section className="split" aria-labelledby="folders-title">
					<div className="copy">
						<h2 id="folders-title">Folders inside folders</h2>
						<p>
							Pin a tab and file it. Folders hold folders, as deep as you need. Drop one tab on another to make a folder
							of both, and a closed folder still shows the tab you're on.
						</p>
					</div>
					<Image
						className="crop"
						src={folders}
						alt="Build's pinned tabs: a Loka folder holding imputnet/helium-windows and a Docs folder, which holds Chromium: Windows build guide and Lit docs."
						sizes="408px"
						placeholder="blur"
					/>
				</section>

				<section className="features" aria-labelledby="features-title">
					<h2 id="features-title">The rest of what you reach for</h2>
					<div className="grid">
						{FEATURES.map((f) => (
							<article key={f.title}>
								<div className="feature-media">
									<Image
										className="crop"
										src={f.image}
										alt={f.alt}
										style={{ width: f.width }}
										sizes={`(min-width: 760px) ${f.width}px, calc(100vw - 32px)`}
										placeholder="blur"
									/>
								</div>
								<h3>{f.title}</h3>
								<p>{f.body}</p>
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
						<p>Leave your email and you'll hear when there's a build to download.</p>
					</div>
					<div className="form">
						<Waitlist
							appearance={{
								variables: {
									colorPrimary: "var(--accent)",
									colorPrimaryForeground: "var(--accent-fg)",
									colorBackground: "var(--surface-raised)",
									colorForeground: "var(--text)",
									colorMutedForeground: "var(--text-muted)",
									colorInput: "var(--surface)",
									colorInputForeground: "var(--text)",
									colorBorder: "var(--border)",
									colorRing: "var(--focus)",
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
