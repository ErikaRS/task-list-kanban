import type { DropPosition } from "../settings/column_reorder";

// Rail geometry (SPEC 0034). The minimum is also the default: just wide
// enough for the dashboard-button column. Starting points, tuned in manual
// testing.
export const RAIL_MIN_WIDTH = 44;
export const RAIL_MAX_WIDTH = 320;
// Below this, an ellipsized name is an unreadable fragment ("W…"), so the
// rail shows first-letter chips instead of labels.
export const RAIL_LABEL_MIN_WIDTH = 72;

export type RailDisplayMode = "chip" | "label";

/**
 * Where the rail docks (SPEC 0034 phase 2). "left" is the default vertical
 * rail; "top" lays the same tabs out as a horizontal strip across the top of
 * the view. Chosen in the plugin settings tab, not by drag.
 */
export type RailDock = "left" | "top";

export function railDisplayMode(width: number): RailDisplayMode {
	return width >= RAIL_LABEL_MIN_WIDTH ? "label" : "chip";
}

export function clampRailWidth(width: number): number {
	return Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, Math.round(width)));
}

/**
 * The rail exists exactly when there is something to switch to. The count is
 * every discovered board — shown and hidden together — so dashboard curation
 * can never make the rail (and with it the dashboard button) vanish from a
 * genuinely multi-board vault.
 */
export function railVisible(discoveredBoardCount: number): boolean {
	return discoveredBoardCount > 1;
}

/**
 * Chip mode's label: the name's first character (a full code point, so
 * emoji-named boards keep their emoji). Duplicate letters are expected —
 * position, the active highlight, and tooltips disambiguate; widening the
 * rail is the real answer.
 */
export function railChipLabel(name: string): string {
	const first = [...name.trim()][0];
	return first?.toUpperCase() ?? "?";
}

/**
 * The vertical-list counterpart of the dashboard card's horizontal-midpoint
 * rule: the pointer's side of the tab's vertical midpoint decides
 * before/after.
 */
export function railDropPosition(
	clientY: number,
	rect: { top: number; height: number },
): DropPosition {
	return clientY > rect.top + rect.height / 2 ? "after" : "before";
}

/** The same midpoint rule along the x axis, for the top-docked rail's row. */
export function railDropPositionHorizontal(
	clientX: number,
	rect: { left: number; width: number },
): DropPosition {
	return clientX > rect.left + rect.width / 2 ? "after" : "before";
}
