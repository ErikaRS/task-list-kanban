/**
 * Preserve the board's pre-keyboard height while a mobile editor is focused.
 * Obsidian Mobile resizes its workspace when the soft keyboard opens; without
 * an explicit floor, the flex board can collapse to zero height behind the
 * editor.
 */
export function lockMobileBoardLayout(board: HTMLElement | null): () => void {
	if (!board) {
		return () => {};
	}

	const previousMinHeight = board.style.minHeight;
	board.style.minHeight = `${Math.ceil(board.getBoundingClientRect().height)}px`;

	let released = false;
	return () => {
		if (released) return;
		released = true;
		board.style.minHeight = previousMinHeight;
	};
}

/** Keep the scrollable board at its full height while a mobile input owns focus. */
export function mobileKeyboardBoardLayout(node: HTMLElement, enabled: boolean) {
	if (!enabled) return {};
	const ownerWindow = node.ownerDocument.defaultView!;
	const viewport = ownerWindow.visualViewport;
	let unlock: (() => void) | undefined;
	let startingHeight = 0;
	let releaseTimer = 0;
	const isEditor = (target: EventTarget | null) =>
		target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]');
	const release = () => {
		if (!unlock) return;
		if (isEditor(node.ownerDocument.activeElement)) return;
		if (viewport && viewport.height < startingHeight - 40) return;
		unlock();
		unlock = undefined;
	};
	const focusIn = (event: FocusEvent) => {
		if (!isEditor(event.target) || unlock) return;
		ownerWindow.clearTimeout(releaseTimer);
		startingHeight = viewport?.height ?? ownerWindow.innerHeight;
		unlock = lockMobileBoardLayout(node.querySelector<HTMLElement>(".board-main"));
	};
	const focusOut = () => {
		ownerWindow.clearTimeout(releaseTimer);
		releaseTimer = ownerWindow.setTimeout(release, 0);
	};
	node.addEventListener("focusin", focusIn);
	node.addEventListener("focusout", focusOut);
	viewport?.addEventListener("resize", release);
	ownerWindow.addEventListener("resize", release);
	return { destroy() {
		ownerWindow.clearTimeout(releaseTimer);
		node.removeEventListener("focusin", focusIn);
		node.removeEventListener("focusout", focusOut);
		viewport?.removeEventListener("resize", release);
		ownerWindow.removeEventListener("resize", release);
		unlock?.();
	} };
}
