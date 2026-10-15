// The prototype's star field (prototype/src/app/loka-app.ts): the same seed, so the site's sky is the browser's sky.
// Drawn once in a 1280x800 box that covers the window. The gradients behind it live in globals.css (.sky).
const STARS = (() => {
	let seed = 7919;
	const rand = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
	return Array.from({ length: 160 }, (_, i) => {
		const bright = rand() > 0.92;
		return {
			key: i,
			x: (rand() * 1280).toFixed(1),
			y: (rand() * 800).toFixed(1),
			r: (bright ? 1 + rand() * 0.8 : 0.35 + rand() * 0.6).toFixed(2),
			fill: rand() > 0.8 ? "hsl(200 90% 88%)" : "#fff",
			opacity: (0.25 + rand() * 0.65).toFixed(2),
		};
	});
})();

export function Sky() {
	return (
		<div className="sky" aria-hidden="true">
			<svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
				{STARS.map((s) => (
					<circle key={s.key} cx={s.x} cy={s.y} r={s.r} fill={s.fill} opacity={s.opacity} />
				))}
			</svg>
		</div>
	);
}
