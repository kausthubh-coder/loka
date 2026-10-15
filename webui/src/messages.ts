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
] as const;

/** Events the handler in patches/loka doesn't fire yet; same rule as PLANNED_MESSAGES. */
export const PLANNED_EVENTS = [
	"extensions-changed",
	"downloads-changed",
	"media-changed",
	"suggestions",
	"command",
] as const;

export type Message = (typeof MESSAGES)[number] | (typeof PLANNED_MESSAGES)[number];
export type BrowserEvent = (typeof EVENTS)[number] | (typeof PLANNED_EVENTS)[number];
