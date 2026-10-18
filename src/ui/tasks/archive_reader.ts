import type { TFile, EventRef, Vault } from "obsidian";
import { writable } from "svelte/store";
import { getTagsFromContent } from "../../parsing/tags/tags";
import { Task, isArchivedTaskString, isStatusMatch, validateDoneStatusMarkers, type TaskParseContext } from "./task";
import { createSourceTree } from "./tasks";
import { parseSourceTaskLine } from "./source_block";
import { transformSourceRow, type PrepareFileContentsForWrite } from "./source_line_editor";

export const ARCHIVE_PAGE_SIZE = 50;
export const ARCHIVE_CURSOR_LIMIT = 64;
type Cursor = { path: string; row: number };
export type ArchiveCard = { task: Task; file: TFile; row: number; raw: string };
type Page = { cards: ArchiveCard[]; page: number; more: boolean; loading: boolean; message: string; progress: string; error: string };
export type ArchiveConfig = {
	context: TaskParseContext;
	excludedTaskTags: Set<string>;
	nested: boolean;
	includes: (path: string) => boolean;
};
const emptyPage = (): Page => ({ cards: [], page: 1, more: false, loading: false, message: "", progress: "", error: "" });
const yieldToUI = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));

/** A page of cards, a bounded cursor history, and no vault-wide task index. */
export class ArchivePageReader {
	readonly state = writable<Page>(emptyPage());
	private active = false;
	private generation = 0;
	private page = 1;
	private changeMessage = "";
	private cursors = new Map<number, Cursor | undefined>();
	private nextCursor: Cursor | undefined;
	private events: EventRef[] = [];
	private timer: number | undefined;
	private matches: (task: Task) => boolean = () => true;

	constructor(private vault: Vault, private config: () => ArchiveConfig,
		private prepareWrite?: PrepareFileContentsForWrite) {}

	open(matches: (task: Task) => boolean) {
		this.close();
		this.active = true;
		this.matches = matches;
		const changed = (file: { path: string }, oldPath?: string) => {
			if (this.config().includes(file.path) || (oldPath && this.config().includes(oldPath))) this.invalidate();
		};
		this.events = [this.vault.on("create", changed), this.vault.on("modify", changed),
			this.vault.on("delete", changed), this.vault.on("rename", changed)];
		this.refresh();
	}

	close() {
		this.active = false;
		this.cancel();
		this.events.forEach(event => this.vault.offref(event));
		this.events = [];
		this.cursors.clear();
		this.state.set(emptyPage());
	}

	cancel() {
		this.generation++;
		window.clearTimeout(this.timer);
		this.timer = undefined;
		this.state.update(state => ({ ...state, loading: false }));
	}

	invalidate(path?: string) {
		if (!this.active || (path && !this.config().includes(path))) return;
		this.generation++;
		this.cursors.clear();
		this.nextCursor = undefined;
		const message = this.page > 1 ? "Archive changed; showing the first page" : this.changeMessage;
		this.state.set({ ...emptyPage(), loading: true, message });
		// Fixed window: continuous writes cannot postpone the next scan forever.
		if (this.timer === undefined) this.timer = window.setTimeout(() => {
			this.timer = undefined;
			this.refresh(message);
		}, 100);
	}

	refresh(message = "") {
		if (!this.active) return;
		this.cursors.clear();
		this.nextCursor = undefined;
		void this.load(1, message);
	}

	previous() { if (this.page > 1) void this.load(this.page - 1); }
	next() {
		if (!this.nextCursor) return;
		this.remember(this.page + 1, this.nextCursor);
		void this.load(this.page + 1);
	}

	private remember(page: number, cursor: Cursor | undefined) {
		this.cursors.delete(page);
		this.cursors.set(page, cursor);
		const oldest = [...this.cursors.keys()][0];
		if (this.cursors.size > ARCHIVE_CURSOR_LIMIT && oldest !== undefined) this.cursors.delete(oldest);
	}

	private async load(page: number, message = "") {
		this.cancel();
		const generation = this.generation;
		this.page = page;
		this.changeMessage = message;
		this.nextCursor = undefined;
		this.state.set({ ...emptyPage(), page, message, loading: true });
		try {
			let cursor = this.cursors.get(page);
			if (page > 1 && !this.cursors.has(page)) {
				for (let skipped = 1; skipped < page; skipped++) {
					const result = await this.scan(cursor, generation);
					if (generation !== this.generation) return;
					cursor = result.next;
					this.remember(skipped + 1, cursor);
				}
			}
			this.remember(page, cursor);
			const result = await this.scan(cursor, generation);
			if (generation !== this.generation || !this.active) return;
			this.nextCursor = result.next;
			this.state.set({ cards: result.cards, page, more: !!result.next, loading: false, message, progress: "", error: "" });
		} catch (error) {
			if (generation === this.generation && this.active)
				this.state.set({ ...emptyPage(), page, message, error: String(error) });
		}
	}

	private async scan(cursor: Cursor | undefined, generation: number) {
		const config = this.config();
		const cards: ArchiveCard[] = [];
		const files = this.vault.getMarkdownFiles().filter(file => config.includes(file.path))
			.sort((a, b) => a.path.localeCompare(b.path));
		let processed = 0;
		const checkpoint = async () => {
			await yieldToUI();
			if (generation !== this.generation || !this.active) throw new Error("Scan cancelled");
		};
		for (const file of files) {
			if (cursor && file.path.localeCompare(cursor.path) < 0) continue;
			await checkpoint();
			this.state.update(state => ({ ...state, progress: `Reading ${file.path}` }));
			const rows = (await this.vault.read(file)).split("\n");
			for (let row = cursor?.path === file.path ? cursor.row : 0; row < rows.length;) {
				if (++processed % 256 === 0) await checkpoint();
				const raw = rows[row]!;
				const parsed = parseSourceTaskLine(raw);
				if (!parsed || isStatusMatch(parsed.status, config.context.ignoredStatusMarkers)
					|| [...getTagsFromContent(parsed.content)].some(tag => config.excludedTaskTags.has(tag.toLowerCase()))) {
					row++;
					continue;
				}
				let end = row + 1;
				if (config.nested) {
					while (end < rows.length && rows[end] !== "") {
						const indent = rows[end]!.match(/^\s*/)?.[0] ?? "";
						if (indent.length <= parsed.indentation.length || !indent.startsWith(parsed.indentation)) break;
						end++;
						if (++processed % 256 === 0) await checkpoint();
					}
				}
				if (isArchivedTaskString(raw, config.context.replaceArchiveTagWithStatus, config.context.archiveStatusMarkers)) {
					const task = new Task(raw as ConstructorParameters<typeof Task>[0], file, row, config.context);
					if (this.matches(task)) {
						if (cards.length === ARCHIVE_PAGE_SIZE) return { cards, next: { path: file.path, row } };
						if (config.nested) {
							const tree = createSourceTree({ fileHandle: file, parseContext: config.context,
								excludedTaskTags: config.excludedTaskTags });
							for (let child = row; child < end; child++) {
								tree.add(rows[child]!, child);
								if (++processed % 256 === 0) await checkpoint();
							}
							task.sourceChildren.push(...(tree.nodesByRowIndex.get(row)?.sourceChildren ?? []));
						}
						cards.push({ task, file, row, raw });
					}
				}
				row = end;
			}
		}
		return { cards, next: undefined };
	}

	get restoreDisabledReason(): string {
		const context = this.config().context;
		const marker = Array.from(context.doneStatusMarkers)[0];
		return !marker || validateDoneStatusMarkers(context.doneStatusMarkers).length > 0 || marker === "[" || marker === "]"
			|| isStatusMatch(marker, context.ignoredStatusMarkers)
			|| (context.replaceArchiveTagWithStatus && isStatusMatch(marker, context.archiveStatusMarkers ?? ""))
			? "Configure a valid Done marker before restoring archived tasks." : "";
	}

	restoreHelp(card: ArchiveCard): string {
		return this.config().context.replaceArchiveTagWithStatus && getTagsFromContent(card.raw).has("archived")
			? "Preserves #archived: this task will still be archived on boards using the tag."
			: "Restore to Done";
	}

	async restore(card: ArchiveCard) {
		if (this.restoreDisabledReason) throw new Error(this.restoreDisabledReason);
		const generation = this.generation;
		const context = this.config().context;
		const changed = await transformSourceRow(this.vault, card.file, card.row, raw => {
			if (!this.active || generation !== this.generation || raw !== card.raw
				|| !isArchivedTaskString(raw, context.replaceArchiveTagWithStatus, context.archiveStatusMarkers))
				throw new Error("Task changed; try again");
			const parsed = parseSourceTaskLine(raw)!;
			const marker = !context.replaceArchiveTagWithStatus && isStatusMatch(parsed.status, context.doneStatusMarkers)
				? parsed.status : Array.from(context.doneStatusMarkers)[0]!;
			let next = raw.replace(/\[[^[\]]*\]/, `[${marker}]`);
			if (!context.replaceArchiveTagWithStatus) next = next.replace(/#([-_/\p{L}\p{N}]+)/gu,
				(token, tag: string) => tag === "archived" ? "" : token);
			return next;
		}, this.prepareWrite).catch(error => { this.invalidate(); throw error; });
		this.invalidate(card.file.path);
		if (!changed) throw new Error("Task changed; try again");
	}
}
