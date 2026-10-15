import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk's middleware with no route protection: the site is public, and Clerk only runs the waitlist form.
export default clerkMiddleware();

export const config = {
	matcher: [
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|avif|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|webm)).*)",
		"/(api|trpc)(.*)",
		"/__clerk/(.*)",
	],
};
