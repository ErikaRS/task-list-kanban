// @vitest-environment happy-dom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { writable } from "svelte/store";

// The real child, controller, snapshot cache, and vault-backed host run
// against these Obsidian doubles; only rendering and the app are faked.
vi.mock("obsidian", () => {
	class TFile {
		path = ""; basename = ""; extension = "md";
		stat = { ctime: 1, mtime: 1, size: 0 };
		parent: { path: string } | null = null;
	}
	class Component {
		private cleanups: Array<() => void> = [];
		load() { (this as unknown as { onload?: () => void }).onload?.(); }
		unload() { this.cleanups.forEach((cleanup) => cleanup()); (this as unknown as { onunload?: () => void }).onunload?.(); }
		register(cleanup: () => void) { this.cleanups.push(cleanup); }
		registerEvent() {}
	}
	class MarkdownRenderChild extends Component {
		constructor(public containerEl: HTMLElement) { super(); }
	}
	return {
		TFile, Component, MarkdownRenderChild, Modal: class {}, Notice: class {},
		Platform: { isMobile: false },
		Keymap: { isModEvent: (e: MouseEvent) => (e.metaKey ? "tab" : false) },
		setIcon: () => {},
		MarkdownRenderer: {
			render: async (_app: unknown, markdown: string, container: HTMLElement) => {
				// Enough Markdown for the test: the first line's text, plus a link.
				const text = markdown.split("\n")[0]!.replace(/^- \[.\] /, "");
				container.innerHTML = `<p>${text.replace(/\[\[(.+?)\]\]/, '<a class="internal-link" data-href="$1">$1</a>')}</p>`;
			},
		},
	};
});

import { TFile, type App } from "obsidian";
import { EmbeddedBoardChild, createEmbedHost } from "../embedded_board_child";
import { createBoardSnapshotCache } from "../../boards/board_snapshot";
import { createVaultSnapshotHost } from "../../boards/vault_snapshot_host";
import { defaultGlobalSettings } from "../../settings/global_settings";

beforeAll(() => {
	(HTMLElement.prototype as unknown as { empty(): void }).empty = function (this: HTMLElement) {
		this.replaceChildren();
	};
	(HTMLElement.prototype as unknown as { addClass(c: string): void }).addClass = function (this: HTMLElement, c: string) {
		this.classList.add(c);
	};
	// Start immediately instead of waiting for the viewport.
	(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});

let child: EmbeddedBoardChild | undefined;
afterEach(() => { child?.unload(); child = undefined; document.body.innerHTML = ""; });

function file(path: string): TFile {
	const f = new TFile();
	f.path = path;
	f.basename = path.split("/").pop()!.replace(/\.md$/, "");
	f.parent = { path: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "/" } as TFile["parent"];
	return f;
}

function mountEmbed(source: string) {
	const contents = new Map<string, string>([
		["boards/Work.md", "---\nkanban_plugin: ...\n---\n"],
		["boards/alpha.md", "- [ ] Write spec #todo\n- [ ] Read [[Notes]] #todo"],
		["boards/beta.md", "- [ ] Hidden in folded column #doing\n- [ ] Review #todo"],
	]);
	const files = new Map([...contents.keys()].map((path) => [path, file(path)]));
	const boardSettings = {
		columns: ["Todo", "Doing"],
		collapsedColumns: ["column-doing"],
		groupSource: { kind: "file" },
		doneVisibility: "never",
	};
	const writes: string[] = [];
	const refuse = (name: string) => () => { writes.push(name); throw new Error(`embed wrote via ${name}`); };
	const openLinkText = vi.fn();
	const app = {
		vault: {
			getMarkdownFiles: () => [...files.values()],
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			cachedRead: async (f: TFile) => contents.get(f.path) ?? "",
			on: () => ({}),
			modify: refuse("modify"), process: refuse("process"), create: refuse("create"),
			append: refuse("append"), delete: refuse("delete"), trash: refuse("trash"), rename: refuse("rename"),
		},
		metadataCache: {
			getFileCache: (f: TFile) => (f.path === "boards/Work.md"
				? { frontmatter: { kanban_plugin: JSON.stringify(boardSettings) } }
				: { frontmatter: {} }),
			getFirstLinkpathDest: (link: string) =>
				[...files.values()].find((f) => f.basename === link || f.path === link) ?? null,
			on: () => ({}),
		},
		fileManager: { processFrontMatter: refuse("processFrontMatter") },
		workspace: { openLinkText, trigger: () => {} },
	} as unknown as App;
	const getGlobalSettings = () => defaultGlobalSettings;
	const openBoard = vi.fn();
	const el = document.createElement("div");
	document.body.append(el);
	child = new EmbeddedBoardChild(el, app, source, "notes/Plan.md", {
		host: createEmbedHost(app, createBoardSnapshotCache(createVaultSnapshotHost(app, getGlobalSettings)), getGlobalSettings),
		globalSettingsStore: writable(defaultGlobalSettings),
		openBoard,
	});
	child.load();
	return { el, openBoard, openLinkText, writes };
}

async function settle() {
	for (let i = 0; i < 5; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await tick();
	}
}

it("renders columns, lanes, and the folded column read-only, and opens the board from a card", async () => {
	const { el, openBoard, openLinkText, writes } = mountEmbed("board: Work");
	await settle();

	const headers = Array.from(el.querySelectorAll(".tlk-embed-column-header")).map((h) => h.textContent?.replace(/\s+/g, " ").trim());
	expect(headers).toEqual(["Todo 3 tasks", "Doing 1"]);
	const lanes = Array.from(el.querySelectorAll(".tlk-embed-row-header .tlk-embed-axis-label")).map((h) => h.textContent?.trim());
	expect(lanes).toEqual(["boards/alpha.md", "boards/beta.md"]);
	// The folded column's cells are empty stubs; its card does not render.
	expect(el.querySelectorAll(".tlk-embed-cell.collapsed")).toHaveLength(2);
	const cards = Array.from(el.querySelectorAll(".tlk-embed-card")).map((card) => card.querySelector(".content-preview")?.textContent);
	expect(cards).toEqual(["Write spec", "Read Notes", "Review"]);
	expect(el.querySelector(".tlk-embed-count")?.textContent).toBe("Total: 4 tasks");

	// Read-only: no buttons on cards, and no editor opens.
	expect(el.querySelectorAll(".tlk-embed-card button")).toHaveLength(0);

	const link = el.querySelector<HTMLAnchorElement>(".tlk-embed-card a.internal-link")!;
	link.click();
	expect(openLinkText).toHaveBeenCalledWith("Notes", "boards/alpha.md", false);
	expect(openBoard).not.toHaveBeenCalled();

	el.querySelector<HTMLElement>(".tlk-embed-card .content-preview")!
		.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
	expect(openBoard).toHaveBeenCalledWith("boards/Work.md", "tab");
	expect(writes).toEqual([]);
});
