// Markdown preview rendering shared by board cards, their source rows, and
// embedded-board cards (SPEC 0057). Callers add only their own checkbox
// handling after rendering; link behavior and media stripping live here so
// every card renderer treats rendered Markdown the same way.
import { Component, Keymap, MarkdownRenderer, type App } from "obsidian";

/**
 * Renders `markdown` into `container`, replacing what was there. `previous`
 * is unloaded first; the new render component is handed to `onComponent`
 * at once (unload it when the preview goes away). `postProcess` runs in the
 * same task as the render settles, so callers' checkbox handling is in place
 * before anything else observes the DOM.
 */
export async function renderCardMarkdown(options: {
	app: App;
	container: HTMLElement;
	markdown: string;
	sourcePath: string;
	previous?: Component;
	onComponent: (component: Component) => void;
	postProcess?: (container: HTMLElement) => void;
}): Promise<void> {
	const { app, container, markdown, sourcePath } = options;
	options.previous?.unload();
	container.empty();
	const component = new Component();
	options.onComponent(component);
	await MarkdownRenderer.render(app, markdown, container, sourcePath, component);
	attachInternalLinkHandlers(app, container, sourcePath);
	prepareRenderedContent(container);
	options.postProcess?.(container);
}

/** Internal links open through Obsidian (modifier-aware) and hover-preview. */
function attachInternalLinkHandlers(app: App, container: HTMLElement, sourcePath: string) {
	container.querySelectorAll<HTMLAnchorElement>("a.internal-link").forEach((anchorEl) => {
		anchorEl.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const linkTarget = anchorEl.getAttribute("data-href");
			if (linkTarget && app) {
				void app.workspace.openLinkText(linkTarget, sourcePath, Keymap.isModEvent(e));
			}
		});

		anchorEl.addEventListener("mouseover", (e) => {
			const linkTarget = anchorEl.getAttribute("data-href");
			if (linkTarget && app) {
				app.workspace.trigger("hover-link", {
					event: e,
					source: "kanban-view",
					hoverParent: container,
					targetEl: anchorEl,
					linktext: linkTarget,
					sourcePath,
				});
			}
		});
	});
}

function stopPropagation(e: Event) {
	e.stopPropagation();
}

/**
 * External links open in a new tab without activating the card; heavy
 * embeds that don't work in small cards are removed.
 */
function prepareRenderedContent(container: HTMLElement) {
	container.querySelectorAll<HTMLAnchorElement>("a:not(.internal-link)").forEach((anchor) => {
		anchor.target = "_blank";
		anchor.rel = "noopener noreferrer";
		anchor.addEventListener("click", stopPropagation);
		anchor.addEventListener("keypress", stopPropagation);
	});
	container.querySelectorAll("iframe, audio, video").forEach((el) => el.remove());
}

/** The rendered task's own checkbox (as opposed to nested ones). */
export const PRIMARY_CHECKBOX_SELECTOR =
	":scope > ul > li.task-list-item > input.task-list-item-checkbox, " +
	":scope > ul > li.task-list-item > p > input.task-list-item-checkbox";
