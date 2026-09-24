/** The Obsidian workspace can shrink for the keyboard without resizing the WebView. */
export function mobileVisibleBottom(anchor: HTMLElement, ownerWindow: Window): number {
	const viewport = ownerWindow.visualViewport;
	let bottom = Math.min(ownerWindow.innerHeight, (viewport?.offsetTop ?? 0) + (viewport?.height ?? ownerWindow.innerHeight));
	const workspace = anchor.closest<HTMLElement>(".workspace-leaf-content, .workspace-tab-container");
	if (workspace) bottom = Math.min(bottom, workspace.getBoundingClientRect().bottom);
	const keyboard = (ownerWindow.navigator as Navigator & { virtualKeyboard?: { boundingRect?: DOMRect } }).virtualKeyboard?.boundingRect;
	if (keyboard && keyboard.height > 0) bottom = Math.min(bottom, keyboard.top);
	return bottom;
}
