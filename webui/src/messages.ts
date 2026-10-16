// Every name the sidebar and LokaSidebarHandler (chrome/browser/ui/webui/loka_sidebar/) share. bridge.ts may only
// send and listen for names listed here. messages.test.ts checks that the handler registers every live name and that
// every name it registers is listed here, live or planned.

/** Requests the sidebar sends with chrome.send; the handler registers each in RegisterMessages. */
export const MESSAGES = [
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
	"groupTabs",
	"updateGroup",
	"ungroupTabs",
	"search",
	"openPage",
	"windowAction",
	"startWindowDrag",
	"extensionAction",
] as const;

/** News the handler pushes with FireWebUIListener. */
export const EVENTS = ["tabs-changed", "store-changed"] as const;

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
 * The History page's own messages (history.html at chrome://history). A different handler answers them, not
 * LokaSidebarHandler, so they're listed apart; history-bridge.ts may only use these.
 */
export const HISTORY_MESSAGES = ["queryHistory", "deleteUrls", "deleteRange", "openUrl"] as const;
export const HISTORY_EVENTS = ["history-changed"] as const;

export type HistoryMessage = (typeof HISTORY_MESSAGES)[number];
export type HistoryEvent = (typeof HISTORY_EVENTS)[number];
