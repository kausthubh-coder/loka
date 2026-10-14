# Browser build

The real browser is Helium plus Loka's patches, built in the build checkout (`C:\src\loka`). Today it carries no Loka
patches, so it behaves exactly like Helium. This file says how to launch it and what to check until the sidebar
moves into it.

## Sub-features

- `browser-launch` opens the dev build with a throwaway profile.
- `browser-patches` applies Loka's patches on top of Helium's (none yet).

## How to get to it (user POV)

- `bun run browser:run` once `bun run browser:build` has finished. See `docs/browser-build.md`.

## Driving it with loka.mjs

Preconditions: `bun run doctor --browser` passes and `C:\src\loka\build\src\out\Default\chrome.exe` exists.
Neither is true yet: Visual Studio 2026, SDK 10.0.28000 and long paths still need installing.

- **Launch.** `bun run browser:run -- --remote-debugging-port=9340` starts it with `C:\src\loka\profile-dev`.
- **Drive.** Connect with `chromium.connectOverCDP("http://127.0.0.1:9340")` from Playwright and use the page as
  usual. Loka's browser UI isn't WebUI yet, so there are no Loka handles to drive.
- **Proof.** `chrome://version` shows the Helium version from `git describe --tags` and the build path under
  `C:\src\loka`.

## Gotchas

- `browser:run` refuses to start without a finished build. A first build takes hours. Ask before starting one.
- Never point it at a real profile. It always uses `C:\src\loka\profile-dev`.
- Update this file and add a recipe when the first Loka patch lands.
