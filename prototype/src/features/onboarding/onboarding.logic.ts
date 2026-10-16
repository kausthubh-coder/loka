import { type ArcImport, addArcSpaces, addImportedFolder, type ImportNode } from "../import/import.logic";
import { SPACE_HUES } from "../sidebar/planet";
import { type BrowserState, createSpace, type SpaceLook, switchSpace, updateSpace } from "../sidebar/sidebar.logic";

/** What the tour hands back when it finishes. */
export interface TourResult {
	worlds: SpaceLook[];
	bookmarks: { name: string; nodes: ImportNode[] }[];
	arc: ArcImport | null;
}

/**
 * Applies the tour: its spaces replace the first ones in order and extra ones are added (spaces it didn't list are
 * kept); imported bookmarks become closed folders in the first space; Arc's spaces become new spaces. The first
 * space ends up current.
 */
export function applyTour(state: BrowserState, { worlds, bookmarks, arc }: TourResult): BrowserState {
	const firstId = state.spaces[0]?.id;
	let next = worlds.reduce((s, look, i) => {
		const existing = s.spaces[i];
		return existing ? updateSpace(s, existing.id, look) : createSpace(s, look)[0];
	}, state);
	if (firstId) {
		next = switchSpace(next, firstId);
		for (const b of bookmarks) next = addImportedFolder(next, firstId, b.name, b.nodes);
	}
	return arc ? addArcSpaces(next, arc, SPACE_HUES) : next;
}
