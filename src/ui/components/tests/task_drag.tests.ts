import { describe, expect, it } from "vitest";
import { canStartTaskDrag } from "../task_drag";

describe("canStartTaskDrag", () => {
	it("rejects native drag events while the inline editor is active", () => {
		expect(canStartTaskDrag({ isEditing: true, isMobileEditing: false })).toBe(false);
	});

	it("rejects native drag events while the mobile editor is active", () => {
		expect(canStartTaskDrag({ isEditing: false, isMobileEditing: true })).toBe(false);
	});

	it("allows card dragging when neither editor is active", () => {
		expect(canStartTaskDrag({ isEditing: false, isMobileEditing: false })).toBe(true);
	});
});
