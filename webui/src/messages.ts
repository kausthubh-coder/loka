// Every name the sidebar and LokaSidebarHandler (chrome/browser/ui/webui/loka_sidebar/) share. bridge.ts may only
// send and listen for names listed here, and messages.test.ts checks the handler registers each one that isn't
// planned. When the handler starts answering a planned name, move it to the list above it.

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
] as const;

/** News the handler pushes with FireWebUIListener. */
export const EVENTS = ["tabs-changed", "store-changed"] as const;

/** Requests bridge.ts already sends that the handler doesn't answer yet: the browser drops them. */
export const PLANNED_MESSAGES = [
	"getExtensions",
	"runExtension",
	"setExtensionPinned",
	"getDownloads",
	"downloadAction",
	"getMedia",
	"mediaAction",
	"suggest",
	"setSidebarPinned",
	"getSidebarPinned",
	"setColorScheme",
] as const;

/** Events bridge.ts listens for that the handler doesn't fire yet. */
export const PLANNED_EVENTS = [
	"extensions-changed",
	"downloads-changed",
	"media-changed",
	"suggestions",
	"command",
] as const;

export type Message = (typeof MESSAGES)[number] | (typeof PLANNED_MESSAGES)[number];
export type BrowserEvent = (typeof EVENTS)[number] | (typeof PLANNED_EVENTS)[number];
