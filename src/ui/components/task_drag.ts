/**
 * A task card is draggable only while neither of its editors is active.
 *
 * Native drag events from selected editor text bubble to the card, so this
 * guard must also be checked by the card's dragstart handler—not just exposed
 * through the `draggable` attribute.
 */
export function canStartTaskDrag({
	isEditing,
	isMobileEditing,
}: {
	isEditing: boolean;
	isMobileEditing: boolean;
}): boolean {
	return !isEditing && !isMobileEditing;
}
