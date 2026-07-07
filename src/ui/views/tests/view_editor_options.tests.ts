import { describe, expect, it } from "vitest";
import { ColumnOrderMode } from "../../../parsing/properties/comparators";
import {
	SORT_FILE_VALUE,
	SORT_MANUAL_VALUE,
	SORT_TASK_NAME_VALUE,
	propertyKeyFromOptionValue,
	propertyOptionValue,
	sortSelectValueFor,
	sortSelectionFromValue,
} from "../view_editor_options";

describe("view editor option values", () => {
	it("round-trips property keys through option values", () => {
		expect(propertyKeyFromOptionValue(propertyOptionValue("due"))).toBe("due");
		expect(propertyKeyFromOptionValue(SORT_FILE_VALUE)).toBeUndefined();
		expect(propertyKeyFromOptionValue("none")).toBeUndefined();
	});

	it("maps every order mode to its select value", () => {
		expect(sortSelectValueFor(ColumnOrderMode.FileOrder, null)).toBe(SORT_FILE_VALUE);
		expect(sortSelectValueFor(ColumnOrderMode.TaskName, null)).toBe(SORT_TASK_NAME_VALUE);
		expect(sortSelectValueFor(ColumnOrderMode.Manual, null)).toBe(SORT_MANUAL_VALUE);
		expect(sortSelectValueFor(ColumnOrderMode.Property, "priority")).toBe(
			propertyOptionValue("priority"),
		);
	});

	it("falls back to file order for a property sort without a property", () => {
		expect(sortSelectValueFor(ColumnOrderMode.Property, null)).toBe(SORT_FILE_VALUE);
		expect(sortSelectValueFor(ColumnOrderMode.Property, undefined)).toBe(SORT_FILE_VALUE);
	});

	it("decodes select values back into sort selections", () => {
		expect(sortSelectionFromValue(SORT_FILE_VALUE)).toEqual({
			mode: ColumnOrderMode.FileOrder,
		});
		expect(sortSelectionFromValue(SORT_TASK_NAME_VALUE)).toEqual({
			mode: ColumnOrderMode.TaskName,
		});
		expect(sortSelectionFromValue(SORT_MANUAL_VALUE)).toEqual({
			mode: ColumnOrderMode.Manual,
		});
		expect(sortSelectionFromValue(propertyOptionValue("due"))).toEqual({
			mode: ColumnOrderMode.Property,
			property: "due",
		});
	});

	it("leaves the property slot absent for non-property selections", () => {
		expect(sortSelectionFromValue(SORT_TASK_NAME_VALUE)).not.toHaveProperty("property");
	});
});
