/** Place a section-owned button in the visible part of that section. */
export function floatingActionTop(
	sectionTop: number,
	sectionBottom: number,
	viewportTop: number,
	viewportBottom: number,
	size = 48,
	inset = 12,
): number | null {
	const top = Math.min(sectionBottom - inset - size, viewportBottom - inset - size);
	return top < Math.max(sectionTop, viewportTop) ? null : top - sectionTop;
}

interface FloatingEntry {
	node: HTMLButtonElement;
	section: HTMLElement;
	headers: HTMLElement[];
}

/** One observer set and one animation frame per board, regardless of cell count. */
class FloatingActionController {
	private readonly entries = new Set<FloatingEntry>();
	private readonly observed = new Map<Element, number>();
	private readonly ownerWindow: typeof window;
	private readonly resizeObserver: ResizeObserver;
	private readonly mutationObserver: MutationObserver;
	private frame = 0;

	constructor(private readonly viewport: HTMLElement) {
		this.ownerWindow = viewport.ownerDocument.defaultView!;
		this.resizeObserver = new this.ownerWindow.ResizeObserver(this.schedule);
		this.mutationObserver = new this.ownerWindow.MutationObserver(this.schedule);
		// Keyed groups can move without resizing; don't observe our own style writes.
		this.mutationObserver.observe(viewport, { childList: true, subtree: true });
		this.observe(viewport);
		viewport.addEventListener("scroll", this.schedule, { passive: true });
		this.ownerWindow.addEventListener("resize", this.schedule);
		this.ownerWindow.visualViewport?.addEventListener("resize", this.schedule);
		this.ownerWindow.visualViewport?.addEventListener("scroll", this.schedule);
	}

	private observe(element: Element) {
		const count = this.observed.get(element) ?? 0;
		if (count === 0) this.resizeObserver.observe(element);
		this.observed.set(element, count + 1);
	}

	private unobserve(element: Element) {
		const count = this.observed.get(element) ?? 0;
		if (count <= 1) {
			this.resizeObserver.unobserve(element);
			this.observed.delete(element);
		} else {
			this.observed.set(element, count - 1);
		}
	}

	private schedule = () => {
		if (this.frame) return;
		this.frame = this.ownerWindow.requestAnimationFrame(this.position);
	};

	private position = () => {
		this.frame = 0;
		const rects = new Map<Element, DOMRect>();
		const rect = (element: Element) => {
			let value = rects.get(element);
			if (!value) {
				value = element.getBoundingClientRect();
				rects.set(element, value);
			}
			return value;
		};
		const viewport = rect(this.viewport);
		const visual = this.ownerWindow.visualViewport;
		const visibleTop = Math.max(viewport.top, visual?.offsetTop ?? 0);
		const visualBottom = (visual?.offsetTop ?? 0) + Math.min(visual?.height ?? this.ownerWindow.innerHeight, this.ownerWindow.innerHeight);
		// Mobile host/browser navigation can overlay the board's bottom edge.
		// Leave a thumb-sized clear area so the + remains reachable above it.
		const bottom = Math.min(viewport.bottom, visualBottom) - (this.viewport.closest(".mobile-task-list") ? 64 : 0);
		// Batch reads before writes to avoid repeatedly forcing layout while scrolling.
		const placements = Array.from(this.entries, entry => {
			const section = rect(entry.section);
			const top = Math.max(visibleTop, ...entry.headers.map(header => rect(header).bottom));
			const inset = Number.parseFloat(this.ownerWindow.getComputedStyle(entry.node).marginBottom) || 12;
			return {
				node: entry.node,
				top: floatingActionTop(section.top, section.bottom, top, bottom, entry.node.offsetHeight || 48, inset),
			};
		});
		for (const placement of placements) {
			placement.node.style.visibility = placement.top === null ? "hidden" : "visible";
			placement.node.style.top = `${placement.top ?? 0}px`;
		}
	};

	register(entry: FloatingEntry) {
		this.entries.add(entry);
		const list = entry.section.closest(".mobile-board-list");
		const elements: Element[] = [entry.section, ...entry.headers];
		if (list) elements.push(list);
		for (const element of elements) this.observe(element);
		this.schedule();
		return () => {
			this.entries.delete(entry);
			for (const element of elements) this.unobserve(element);
			if (this.entries.size > 0) {
				this.schedule();
				return;
			}
			this.ownerWindow.cancelAnimationFrame(this.frame);
			this.resizeObserver.disconnect();
			this.mutationObserver.disconnect();
			this.viewport.removeEventListener("scroll", this.schedule);
			this.ownerWindow.removeEventListener("resize", this.schedule);
			this.ownerWindow.visualViewport?.removeEventListener("resize", this.schedule);
			this.ownerWindow.visualViewport?.removeEventListener("scroll", this.schedule);
			controllers.delete(this.viewport);
		};
	}
}

const controllers = new WeakMap<HTMLElement, FloatingActionController>();

export function mobileFloatingAction(node: HTMLButtonElement) {
	let destroyed = false;
	let unregister: (() => void) | undefined;
	const register = () => {
		if (destroyed || unregister) return;
		const section = node.closest<HTMLElement>(".tasks-wrapper");
		const viewport = node.closest<HTMLElement>(".columns");
		if (!section || !viewport) return;
		const outer = section.closest(".mobile-outer-section")?.querySelector<HTMLElement>(".mobile-outer-header");
		const inner = section.closest(".mobile-cell")?.querySelector<HTMLElement>(".mobile-inner-header");
		const headers = [outer, inner].filter((header): header is HTMLElement => !!header);
		let controller = controllers.get(viewport);
		if (!controller) {
			controller = new FloatingActionController(viewport);
			controllers.set(viewport, controller);
		}
		unregister = controller.register({ node, section, headers });
	};
	register();
	// A nested Svelte component can mount before its board viewport is attached.
	if (!unregister) queueMicrotask(register);
	return { destroy() {
		if (destroyed) return;
		destroyed = true;
		unregister?.();
	} };
}
