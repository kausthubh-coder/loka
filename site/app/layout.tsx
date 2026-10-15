import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
	title: "loka: a calm, Arc-style browser for Windows",
	description:
		"Spaces, folders inside folders and a sidebar that changes color with the space you're in. Open source and built on Helium, so it stays private and fast. Join the waitlist for the first Windows build.",
};

export const viewport: Viewport = {
	colorScheme: "dark",
	themeColor: "#07090c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<ClerkProvider waitlistUrl="/#waitlist">{children}</ClerkProvider>
			</body>
		</html>
	);
}
