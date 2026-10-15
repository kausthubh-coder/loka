# loka site

The launch page for loka: one Next.js (App Router) page with Clerk's waitlist form. Everything on it is static
except the waitlist, which is Clerk's `<Waitlist />` component.

## Run it

```
cd site
bun install
bun run dev          # http://localhost:5544
bun run typecheck
```

Lint runs from the repo root with the rest of the repo: `bunx biome check site`.

With no Clerk keys set, `bun run dev` runs Clerk in keyless mode. On the first request Clerk creates a temporary,
unclaimed development instance and writes its keys to `site/.clerk/.tmp/keyless.json`. That folder is gitignored
(it holds a secret key). A "Claim your application" prompt shows in the page corner in development only.

## What's on the page

| Part | Where it comes from |
| --- | --- |
| Look | `.critly/direction.md`, described from the prototype's night window |
| Planets and stars | ported from `prototype/src/features/sidebar/planet.ts` and `prototype/src/app/loka-app.ts`, same numbers and seed |
| The mark | the lit planet with a moon from `.agents/reports/2026-10-15-loka-look.html` in the main checkout |
| Screenshots | `public/product/*.png`, taken from the prototype by `scripts/capture-product.mjs` |
| Launch video | `public/launch.mp4`, `public/launch-poster.jpg` and `public/launch.vtt`, rendered from `video/` in the repo root. The video section only appears when `launch.mp4` exists. |

Picking a space in the hero (Build, School, Home) recolors the page and swaps the screenshot. It's plain CSS
(`:has()` on a radio group), with no client script.

### Retake the screenshots

From the repo root:

```
bun run build                              # the prototype, into prototype/dist
node site/scripts/capture-product.mjs      # writes site/public/product/*.png at 2x
```

The script serves `prototype/dist` to a headless Chromium straight from disk, so no dev server runs alongside it.
Each shot starts from the seed data and gets there with keys and clicks, like the verify-loka recipes.

## Make the waitlist real

Keyless mode is for development. Before the page goes live, the owner has to do this:

1. **Claim the instance.** Run `bun run dev`, open the page, and use the "Claim your application" prompt in the
   corner, or run `npx -y clerk@latest auth login` in `site/`. Claiming moves the keyless instance into your Clerk
   account. If you'd rather start clean, create a new application in the
   [Clerk Dashboard](https://dashboard.clerk.com/) instead.
2. **Turn on waitlist mode.** In the Dashboard, open the application's **Access mode** page, choose **Waitlist**,
   and save ([Clerk's waitlist guide](https://clerk.com/docs/nextjs/guides/secure/waitlist)). Email has to be
   enabled so Clerk can send invitation emails. Until this is on, the form talks to an instance that isn't in
   waitlist mode.
3. **Make a production instance.** Clerk's development instances are for testing. Create the production instance
   (`npx -y clerk@latest deploy`, or the Dashboard's production toggle), add the site's domain, and set the DNS
   records Clerk lists.
4. **Set env vars on the host** (Vercel: Project > Settings > Environment Variables), from the production
   instance's API keys page:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_live_...`)
   - `CLERK_SECRET_KEY` (`sk_live_...`, server only, never in client code or git)
5. **Deploy** with `site` as the project's root directory. Install command `bun install`, build command
   `bun run build`.
6. **Manage the list** in the Dashboard's **Waitlist** page: `...` on a row, then **Invite** to let someone in or
   **Revoke** to deny.

Once real keys are set, Clerk stops using `.clerk/`; delete that folder.

## What's been checked, and what hasn't (2026-10-15)

A Chromium build was running on the laptop with 1 to 2 GB free, and it crashed twice when browsers ran
alongside it. So far only these ran: `tsc --noEmit` (clean), `bunx biome check site` (clean), and the screenshot
capture. The page itself has **not** been opened in a browser yet.

Still to do, each needing at least 3 GB free or the build finished (one at a time, stop each by its PID):

1. `cd site && bun run dev`, open http://localhost:5544, and look at it at 1440 and 390 wide. Check the space
   switcher recolors the page, and that Clerk's keyless mode starts (it writes `site/.clerk/`) and the waitlist
   form renders. Submitting the form only works once waitlist mode is on (step 2 above), which needs the
   claimed instance.
2. With the dev server up: `npx @kausthubh/critly check http://localhost:5544/` (fix until exit 0), then
   `npx @kausthubh/critly taste http://localhost:5544/` and open the images it writes to `.critly/taste/`.
3. `cd site && bun run build` (with Clerk keys set, since keyless mode is development only).
4. The launch video: render it as `video/README.md` describes, then copy it and its poster into `public/`.

Not checkable here at all: the music bed is a HeyGen library track (nobody has listened to it yet), and whether
HeyGen's license covers using it on this site needs checking against HeyGen's terms before launch. The
Clerk Dashboard steps above come from Clerk's docs, not from clicking through the Dashboard. There is no Open
Graph image yet, so shared links show no picture.
