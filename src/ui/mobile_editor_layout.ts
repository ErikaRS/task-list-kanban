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
