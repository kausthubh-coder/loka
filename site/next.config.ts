import type { NextConfig } from "next";

const config: NextConfig = {
	// The dev badge sits over the page corner and gets into screenshots and the Critly check.
	devIndicators: false,
	images: { formats: ["image/avif", "image/webp"] },
};

export default config;
