/**
 * Column-local manual ordering (SPEC 0020, Phase 4).
 *
 * This module is the pure, filesystem-free core of manual ordering. It defines
 * the stable task-identity key, the display-order computation (pinned prefix +
 * file-order tail), and the prefix-pin drop algorithm. Side effects
 * (block-link writes, persistence) live in the task actions; everything here is
 * deterministic and unit-tested.
 *
 * See the spec's "Lazy pinning and the prefix invariant" section for the model:
 *
 * > Pinned tasks always form a contiguous prefix of the displayed column.
 */

/** Stable task identity: `path + "::" + blockLink`. */
export type ManualOrderKey = string;

/** Per-column display order, keyed by columnTag (the primary bucket id). */
export type ManualOrderStore = Record<string, ManualOrderKey[]>;

/** Minimal view of a task needed for ordering. */
export interface OrderableTask {
	id: string;
	path: string;
	blockLink: string | undefined;
	rowIndex: number;
}

export interface ManualOrderPruneTask {
	done: boolean;
	column: string | undefined;
	path: string;
	blockLink: string | undefined;
}

/** Builds a {@link ManualOrderKey} from a path and block link. */
export function manualOrderKey(path: string, blockLink: string): ManualOrderKey {
	return `${path}::${blockLink}`;
}

/**
 * The stable identity of a task, or `null` when it has no block link yet.
 *
 * A task without a block link can never be referenced by the store, so it can
 * never be pinned until one is assigned.
 */
export function taskKey(task: OrderableTask): ManualOrderKey | null {
	return task.blockLink ? manualOrderKey(task.path, task.blockLink) : null;
}

/**
 * Computes the displayed order of a column in Manual mode.
 *
 * Pinned tasks (those whose key appears in `entries`, in stored order) form a
 * contiguous prefix; every remaining task follows in file order. Stale entries
 * — keys with no matching present task — are skipped, so a deleted or moved task
 * simply drops out of the prefix.
 *
 * @param tasks   tasks already in file order
 * @param entries the column's stored order, or undefined when nothing is pinned
 */
export function computeDisplayOrder<T extends OrderableTask>(
	tasks: T[],
	entries: ManualOrderKey[] | undefined
): T[] {
	if (!entries || entries.length === 0) {
		return tasks;
	}

	const byKey = new Map<ManualOrderKey, T>();
	for (const task of tasks) {
		const key = taskKey(task);
		if (key !== null && !byKey.has(key)) {
			byKey.set(key, task);
		}
	}

	const pinned: T[] = [];
	const pinnedIds = new Set<string>();
	for (const entry of entries) {
		const task = byKey.get(entry);
		if (task && !pinnedIds.has(task.id)) {
			pinned.push(task);
			pinnedIds.add(task.id);
		}
	}

	const tail = tasks.filter((task) => !pinnedIds.has(task.id));
	return [...pinned, ...tail];
}

/**
 * The set of task ids that are currently pinned in a column.
 *
 * Pinned status is defined solely by a present store entry; a leftover block
 * link without an entry is *not* pinned (see the spec's lazy-pinning rules).
 */
export function computePinnedIds<T extends OrderableTask>(
	tasks: T[],
	entries: ManualOrderKey[] | undefined
): Set<string> {
	const pinned = new Set<string>();
	if (!entries || entries.length === 0) {
		return pinned;
	}
	const present = new Set<ManualOrderKey>();
	for (const task of tasks) {
		const key = taskKey(task);
		if (key !== null) present.add(key);
	}
	const entrySet = new Set(entries);
	for (const task of tasks) {
		const key = taskKey(task);
		if (key !== null && entrySet.has(key) && present.has(key)) {
			pinned.add(task.id);
		}
	}
	return pinned;
}

/**
 * Removes the dragged task from its current position and re-inserts it at
 * `targetIndex` (an index into the array *after* removal).
 */
export function arrayMove<T>(items: T[], fromIndex: number, targetIndex: number): T[] {
	if (fromIndex < 0 || fromIndex >= items.length) {
		return [...items];
	}
	const next = [...items];
	const [moved] = next.splice(fromIndex, 1);
	if (moved === undefined) {
		return next;
	}
	const clamped = Math.max(0, Math.min(targetIndex, next.length));
	next.splice(clamped, 0, moved);
	return next;
}

export interface DropPlan<T extends OrderableTask> {
	/** The new pinned prefix, in display order. */
	prefixTasks: T[];
	/** Prefix tasks lacking a block link (must be assigned one before pinning). */
	tasksNeedingBlockLink: T[];
}

/**
 * Computes the prefix-pin plan for dropping `draggedId` at `targetIndex` within
 * a column's current display order.
 *
 * The dropped task plus everything above its landing position become the pinned
 * prefix — the minimal set of pins that keeps the prefix contiguous. Tasks below
 * are left untouched and continue to follow file order.
 */
export function computeDropPlan<T extends OrderableTask>(
	displayOrder: T[],
	draggedId: string,
	targetIndex: number
): DropPlan<T> {
	const fromIndex = displayOrder.findIndex((task) => task.id === draggedId);
	if (fromIndex === -1) {
		return { prefixTasks: [], tasksNeedingBlockLink: [] };
	}

	const reordered = arrayMove(displayOrder, fromIndex, targetIndex);
	const landedIndex = reordered.findIndex((task) => task.id === draggedId);
	const prefixTasks = reordered.slice(0, landedIndex + 1);
	const tasksNeedingBlockLink = prefixTasks.filter((task) => !task.blockLink);

	return { prefixTasks, tasksNeedingBlockLink };
}

/**
 * Builds the store entries for a pinned prefix.
 *
 * `resolveBlockLink` must return the block link for every prefix task — the
 * existing one, or a freshly assigned one for tasks that lacked it.
 */
export function buildOrderEntries<T extends OrderableTask>(
	prefixTasks: T[],
	resolveBlockLink: (task: T) => string
): ManualOrderKey[] {
	return prefixTasks.map((task) => manualOrderKey(task.path, resolveBlockLink(task)));
}

/**
 * Prunes entries whose key no longer matches any present task, keeping the
 * remaining order. Returns the same array reference when nothing changed.
 */
export function pruneEntries<T extends OrderableTask>(
	entries: ManualOrderKey[] | undefined,
	tasks: T[]
): ManualOrderKey[] {
	if (!entries || entries.length === 0) {
		return entries ?? [];
	}
	const present = new Set<ManualOrderKey>();
	for (const task of tasks) {
		const key = taskKey(task);
		if (key !== null) present.add(key);
	}
	const next = entries.filter((entry) => present.has(entry));
	return next.length === entries.length ? entries : next;
}

/**
 * Removes a single task's entry from a column's order (the unpin operation).
 * Returns the same array reference when the key was absent.
 */
export function removeEntry(
	entries: ManualOrderKey[] | undefined,
	key: ManualOrderKey
): ManualOrderKey[] {
	if (!entries || entries.length === 0) {
		return entries ?? [];
	}
	const next = entries.filter((entry) => entry !== key);
	return next.length === entries.length ? entries : next;
}

/**
 * Builds the present-key map used to prune stale manual-order entries.
 *
 * This intentionally uses the full task set, not the currently filtered/rendered
 * board matrix, so temporary content/tag/file filters cannot delete valid pins.
 */
export function collectPresentManualOrderKeys<T extends ManualOrderPruneTask>(
	tasks: T[]
): Record<string, Set<ManualOrderKey>> {
	const presentKeysByColumn: Record<string, Set<ManualOrderKey>> = {};
	for (const task of tasks) {
		if (!task.blockLink || task.column === "archived") {
			continue;
		}

		const columnTag = task.done || task.column === "done"
			? "done"
			: task.column ?? "uncategorised";
		const keys = presentKeysByColumn[columnTag] ?? new Set<ManualOrderKey>();
		keys.add(manualOrderKey(task.path, task.blockLink));
		presentKeysByColumn[columnTag] = keys;
	}
	return presentKeysByColumn;
}

const BLOCK_LINK_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generates a short, file-unique block-link id (without the leading `^`).
 *
 * `existing` should contain block links already present in the target file so
 * the generated id does not collide.
 */
export function generateBlockLinkId(existing: Set<string>): string {
	for (let attempt = 0; attempt < 100; attempt++) {
		let id = "";
		for (let i = 0; i < 6; i++) {
			id += BLOCK_LINK_ALPHABET[Math.floor(Math.random() * BLOCK_LINK_ALPHABET.length)];
		}
		if (!existing.has(id)) {
			return id;
		}
	}
	// Extremely unlikely fallback: append a timestamp to guarantee uniqueness.
	return `t${Date.now().toString(36)}`;
}

const blockLinkRegexp = /\s\^([a-zA-Z0-9-]+)\s*$/;

/**
 * Ensures a source row has a trailing Obsidian block link.
 *
 * If the row already has one on disk, that link is reused. This protects fast
 * repeated reorders where the in-memory task store has not yet observed the
 * previous file write.
 */
export function ensureRowBlockLink(
	row: string,
	existing: Set<string>
): { row: string; blockLink: string; changed: boolean } {
	const existingMatch = row.match(blockLinkRegexp);
	if (existingMatch?.[1]) {
		existing.add(existingMatch[1]);
		return { row, blockLink: existingMatch[1], changed: false };
	}

	const blockLink = generateBlockLinkId(existing);
	existing.add(blockLink);
	return {
		row: `${row.trimEnd()} ^${blockLink}`,
		blockLink,
		changed: true,
	};
}
