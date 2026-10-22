// Every name the sidebar and LokaSidebarHandler (chrome/browser/ui/webui/loka_sidebar/) share. bridge.ts may only
// send and listen for names listed here. messages.test.ts checks that the handler registers every live name and that
// every name it registers is listed here, live or planned.

/** Requests the sidebar sends with chrome.send; the handler registers each in RegisterMessages. */
export const MESSAGES = [
	"getSpaces",
	"spacesDo",
	"syncTabs",
	"getTabs",
	"getGroups",
	"getStore",
	"setStore",
	"createTab",
	"activateTab",
	"closeTab",
	"navigateTab",
	"goBack",
	"goForward",
	"reload",
	"setMuted",
	"search",
	"openPage",
	"windowAction",
	"browserCommand",
	"startWindowDrag",
	"extensionAction",
	// The floating menu window (LokaMenu): the sidebar shows a menu; the menu page says its size, what was picked, or
	// to close.
	"showMenu",
	"menuReady",
	"menuPicked",
	"closeMenu",
] as const;

/** News the handler pushes with FireWebUIListener. */
export const EVENTS = [
	"spaces-changed",
	"links-changed",
	"tabs-changed",
	"store-changed",
	// The menu window: the menu to draw (to menu.html); what was picked, or that it closed (to the sidebar).
	"menu-show",
	"menu-picked",
	"menu-closed",
] as const;

/**
 * Requests the handler in patches/loka doesn't answer yet (the browser drops them). The build checkout may be ahead:
 * once the C++ for one is exported into the patch, move it up to MESSAGES.
 */
export const PLANNED_MESSAGES = [
	"getExtensions",
	"runExtension",
	"setExtensionPinned",
	// An extension's right-click menu: its options page, its chrome://extensions page, or Chrome's Remove dialog.
	"extensionAction",
	"getDownloads",
	"downloadAction",
	"getMedia",
	"mediaAction",
	"suggest",
	"setSidebarPinned",
	"getSidebarPinned",
	"setColorScheme",
	"openCommandBar",
	"closeCommandBar",
	// The floating command bar (command.html) hands its pick to the window's sidebar; the browser passes it on.
	"commandPicked",
	// The window's frame around the page takes the space's color ("#rrggbb", or null for the default).
	"setThemeColor",
	// Media autoplay for pages: "block" (until a click), "block-audible" or "allow" (the loka.autoplay pref).
	"setAutoplay",
	"getAutoplay",
	// A hidden sidebar that is showing stays open while true (typing in it, a menu open, a drag).
	"holdSidebar",
	// The browser's own bookmarks (setup's import brings them in there), handed out once as a Bookmarks file.
	"takeBrowserBookmarks",
] as const;

/** Events the handler in patches/loka doesn't fire yet; same rule as PLANNED_MESSAGES. */
export const PLANNED_EVENTS = [
	"extensions-changed",
	"downloads-changed",
	"media-changed",
	"suggestions",
	"command",
	// The sidebar's pinned state changed elsewhere (another window, a browser menu).
	"sidebar-pinned-changed",
	// commandPicked's pick, delivered to the window's sidebar.
	"command-picked",
] as const;

export type Message = (typeof MESSAGES)[number] | (typeof PLANNED_MESSAGES)[number];
export type BrowserEvent = (typeof EVENTS)[number] | (typeof PLANNED_EVENTS)[number];

/**
 * The Library's history messages (history.html at chrome://history). LokaHistoryHandler answers them, not
 * LokaSidebarHandler, so they're listed apart; history-bridge.ts may only use these. The Library also has the
 * sidebar's handler, for getSpaces, spacesDo, getDownloads and downloadAction (through bridge.ts).
 */
export const HISTORY_MESSAGES = ["queryHistory", "deleteUrls", "deleteRange", "openUrl"] as const;
export const HISTORY_EVENTS = ["history-changed"] as const;

export type HistoryMessage = (typeof HISTORY_MESSAGES)[number];
export type HistoryEvent = (typeof HISTORY_EVENTS)[number];
