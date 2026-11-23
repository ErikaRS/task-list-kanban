// Parser for the `task-list-kanban` code block (SPEC 0057).
//
//   ```task-list-kanban
//   board: Projects/Work Board.md
//   filter: #urgent
//   height: 420
//   layout: auto
//   ```
//
// One `key: value` per line. Errors stop the embed and are reported per
// line; unknown keys only warn, so blocks written for a later version keep
// working here.

export type EmbedLayout = "auto" | "table" | "list";

export interface EmbedBlockParams {
	/** Vault path or link text, resolved like a wikilink from the note. */
	board: string;
	/** A saved view's name (local or global), for this embed only. */
	view?: string;
	/** A filter query that replaces the board's filter for this embed only. */
	filter?: string;
	/** Maximum height in px. */
	height: number;
	layout: EmbedLayout;
}

export interface EmbedBlockIssue {
	/** 1-based line within the block; 0 for the block as a whole. */
	line: number;
	message: string;
	severity: "error" | "warning";
}

export interface EmbedBlockParseResult {
	/** Undefined when any error was found. */
	params?: EmbedBlockParams;
	issues: EmbedBlockIssue[];
}

export const EMBED_DEFAULT_HEIGHT = 420;
export const EMBED_MIN_HEIGHT = 160;
export const EMBED_MAX_HEIGHT = 1200;

const KNOWN_KEYS = ["board", "view", "filter", "height", "layout"] as const;
type EmbedKey = (typeof KNOWN_KEYS)[number];
const LAYOUTS: readonly EmbedLayout[] = ["auto", "table", "list"];

export function parseEmbedBlock(source: string): EmbedBlockParseResult {
	const issues: EmbedBlockIssue[] = [];
	const values = new Map<EmbedKey, { value: string; line: number }>();

	source.split(/\r?\n/).forEach((rawLine, index) => {
		const line = index + 1;
		const text = rawLine.trim();
		if (text === "") return;
		const colon = text.indexOf(":");
		if (colon <= 0) {
			issues.push({ line, severity: "error", message: `Expected "key: value", found "${text}".` });
			return;
		}
		const key = text.slice(0, colon).trim().toLowerCase();
		const value = text.slice(colon + 1).trim();
		if (!(KNOWN_KEYS as readonly string[]).includes(key)) {
			issues.push({ line, severity: "warning", message: `Unknown key "${key}" is ignored.` });
			return;
		}
		if (values.has(key as EmbedKey)) {
			issues.push({ line, severity: "error", message: `"${key}" is set more than once.` });
			return;
		}
		values.set(key as EmbedKey, { value, line });
	});

	const board = values.get("board");
	const boardValue = board ? normalizeBoardReference(board.value) : "";
	if (!board) {
		issues.push({ line: 0, severity: "error", message: 'Add a "board:" line naming the board file.' });
	} else if (boardValue === "") {
		issues.push({ line: board.line, severity: "error", message: 'Add the board file after "board:".' });
	}

	let height = EMBED_DEFAULT_HEIGHT;
	const heightEntry = values.get("height");
	if (heightEntry) {
		const match = /^(\d+)(px)?$/i.exec(heightEntry.value);
		if (!match) {
			issues.push({
				line: heightEntry.line,
				severity: "error",
				message: `Height must be a number of pixels, such as 420. Found "${heightEntry.value}".`,
			});
		} else {
			const requested = Number(match[1]);
			height = Math.min(EMBED_MAX_HEIGHT, Math.max(EMBED_MIN_HEIGHT, requested));
			if (height !== requested) {
				issues.push({
					line: heightEntry.line,
					severity: "warning",
					message: `Height is limited to ${EMBED_MIN_HEIGHT}–${EMBED_MAX_HEIGHT}px; using ${height}.`,
				});
			}
		}
	}

	let layout: EmbedLayout = "auto";
	const layoutEntry = values.get("layout");
	if (layoutEntry) {
		const value = layoutEntry.value.toLowerCase();
		if ((LAYOUTS as readonly string[]).includes(value)) {
			layout = value as EmbedLayout;
		} else {
			issues.push({
				line: layoutEntry.line,
				severity: "error",
				message: `Layout must be auto, table, or list. Found "${layoutEntry.value}".`,
			});
		}
	}

	const optional = (key: "view" | "filter") => {
		const entry = values.get(key);
		if (entry && entry.value === "") {
			issues.push({ line: entry.line, severity: "warning", message: `"${key}:" is empty and is ignored.` });
			return undefined;
		}
		return entry?.value;
	};
	const view = optional("view");
	const filter = optional("filter");

	if (issues.some((issue) => issue.severity === "error")) {
		return { issues };
	}
	return {
		params: {
			board: boardValue,
			...(view !== undefined ? { view } : {}),
			...(filter !== undefined ? { filter } : {}),
			height,
			layout,
		},
		issues,
	};
}

/** Accepts `[[Board]]`, `[[Board|alias]]`, and quoted values as well as bare paths. */
function normalizeBoardReference(value: string): string {
	let reference = value.trim();
	if (/^(["']).*\1$/.test(reference)) {
		reference = reference.slice(1, -1).trim();
	}
	const wikilink = /^\[\[([^\]]*)\]\]$/.exec(reference);
	if (wikilink) {
		reference = (wikilink[1] ?? "").split("|")[0]!.trim();
	}
	return reference;
}
