# Spaces

A space is a named set of tabs with its own color. Switching spaces swaps the pinned tree and open tabs, tints the
whole window with the space's hue, and brings back the tab that was active in that space. Essentials stay the same.

## Sub-features

- `space-switch-click` switches with the round buttons at the bottom of the sidebar.
- `space-switch-keys` switches with Ctrl+1 to Ctrl+9, in switcher order.
- `space-switch-drag` switches when a dragged tab hovers over a space button.
- `space-memory` keeps one active tab per space.
- `space-empty` shows "Nothing open in <space>." in the page area when the space has no active tab.
- `space-new` adds `Space N` with the next color and switches to it.

## How to get to it (user POV)

- The space buttons at the bottom of the sidebar. Hover shows the name and shortcut.
- Ctrl+1 to Ctrl+9.
- Drag a tab and hold it over a space button.
- The `+` button (`New space`), or `...` > `New space`.

## Driving it with loka.mjs

Preconditions: seed data.

- **Keys.** `page.keyboard.press("Control+2")`. `outline()` gives `space: "School"` and `activeTab: "Canvas: CSC 281"`.
- **Click.** `loka.space("Home").click()`. `space` is `Home` and the page shows `Nothing open in Home.`
- **Memory.** `loka.space("Build").click()`. `activeTab` is `imputnet/helium-windows` again.
- **Drag-hover.** `loka.row("Zen Browser").dragTo(loka.space("School"))`. `space` is `School`.
- **New.** Click the `New space` button. `space` is `Space 4`, with empty `pinned` and `open`.
- **Tint.** Compare `proof()` screenshots of Build (blue) and School (amber). The backdrop and accents change hue.
- **Recipe.** `node .agents/skills/verify-loka/scripts/run.mjs spaces`.

## Gotchas

- `loka.space(name)` matches the button's full label, `<name> (Ctrl <n>)`. New spaces get numbers in order.
- The tint animates over about 420 ms. Wait before screenshotting a hue change.
- Dropping onto a space button itself does nothing. Only hovering switches spaces, and the drop has to land on a
  row in the new space.
