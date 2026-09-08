import { describe, expect, it } from "vitest";
import { UNIVERSAL_STATUS_PROPERTY_KEY } from "../../../parsing/properties/property_schema";
import { getGroupStatusMarker } from "../group_label";
import type { AxisBucket } from "../board_matrix";
import type { GroupSource } from "../../tasks/task_grouping";

function groupBucket(
	source: GroupSource,
	value: string | number | Date | null,
): AxisBucket {
	return {
		id: "group",
		label: String(value),
		kind: "group",
		collapsed: false,
		meta: { source, value },
	};
}

describe("getGroupStatusMarker", () => {
	it("returns markers for status grouping, including unchecked and emoji markers", () => {
		const statusSource = { kind: "property", key: UNIVERSAL_STATUS_PROPERTY_KEY } as const;

		expect(getGroupStatusMarker(groupBucket(statusSource, " "))).toBe(" ");
		expect(getGroupStatusMarker(groupBucket(statusSource, "/"))).toBe("/");
		expect(getGroupStatusMarker(groupBucket(statusSource, "✅"))).toBe("✅");
	});

	it("leaves other grouping values as text", () => {
		expect(getGroupStatusMarker(groupBucket({ kind: "property", key: "priority" }, "high"))).toBeUndefined();
		expect(getGroupStatusMarker(groupBucket({ kind: "file" }, "Tasks.md"))).toBeUndefined();
	});
});
