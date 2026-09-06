let lockedBoard: HTMLElement | null = null;
let previousMinHeight = "";
let lockCount = 0;

/**
 * Preserve the board's pre-keyboard height while a mobile editor is focused.
 * Obsidian Mobile resizes its workspace when the soft keyboard opens; without
 * an explicit floor, the flex board can collapse to zero height behind the
 * editor.
 */
export function lockMobileBoardLayout(): () => void {
	lockCount += 1;
	if (lockCount === 1) {
		lockedBoard = document.querySelector<HTMLElement>(
			".task-list-kanban-view .board-main",
		);
		if (lockedBoard) {
			previousMinHeight = lockedBoard.style.minHeight;
			lockedBoard.style.minHeight = `${Math.ceil(lockedBoard.getBoundingClientRect().height)}px`;
		}
	}

	let released = false;
	return () => {
		if (released) return;
		released = true;
		lockCount = Math.max(0, lockCount - 1);
		if (lockCount === 0 && lockedBoard) {
			lockedBoard.style.minHeight = previousMinHeight;
			lockedBoard = null;
			previousMinHeight = "";
		}
	};
}
