import { describe, expect, it } from "vitest";
import {
	deriveGroupBuckets,
	getTaskTagGroupValue,
	taskBelongsToGroup,
} from "../task_grouping";
import { parseTask } from "./task_test_helpers";

describe("tag-prefix grouping", () => {
	it("derives prefix buckets case-insensitively and keeps unassigned last", () => {
		const tasks = [
			parseTask("- [ ] Alpha work #Project-Alpha #tag"),
			parseTask("- [ ] Beta work #project-beta"),
			parseTask("- [ ] Duplicate alpha #project-alpha"),
			parseTask("- [ ] No project #tag"),
		];

		const buckets = deriveGroupBuckets(tasks, { kind: "tag-prefix", prefix: "Project-" });

		expect(buckets.map((bucket) => bucket.label)).toEqual(["Alpha", "beta", "Unassigned"]);
		expect(buckets.map((bucket) => bucket.value)).toEqual(["Project-Alpha", "project-beta", null]);
		expect(buckets.at(-1)?.isDefault).toBe(true);
	});

	it("assigns tasks to their first matching prefixed tag", () => {
		const task = parseTask("- [ ] Cross-project #Project-Beta #Project-Alpha");
		const buckets = deriveGroupBuckets([task], { kind: "tag-prefix", prefix: "project-" });
		const alphaBucket = buckets.find((bucket) => bucket.label === "Alpha")!;
		const betaBucket = buckets.find((bucket) => bucket.label === "Beta")!;

		expect(getTaskTagGroupValue(task, { kind: "tag-prefix", prefix: "project-" })).toBe("Project-Beta");
		expect(taskBelongsToGroup(task, betaBucket)).toBe(true);
		expect(taskBelongsToGroup(task, alphaBucket)).toBe(false);
	});

	it("groups by all non-excluded tags when prefix is empty", () => {
		const alpha = parseTask("- [ ] Alpha #status/active #Project-Alpha");
		const unassigned = parseTask("- [ ] Only excluded #status/active");
		const buckets = deriveGroupBuckets(
			[alpha, unassigned],
			{ kind: "tag-prefix", prefix: "" },
			["Status/Active"],
		);

		expect(buckets.map((bucket) => bucket.label)).toEqual(["Project-Alpha", "Unassigned"]);
		expect(taskBelongsToGroup(alpha, buckets[0]!, ["status/active"])).toBe(true);
		expect(taskBelongsToGroup(unassigned, buckets[1]!, ["status/active"])).toBe(true);
	});

	it("uses the alphabetically first non-excluded tag for empty-prefix grouping", () => {
		const task = parseTask("- [ ] Many tags #zeta #alpha #middle");

		expect(getTaskTagGroupValue(task, { kind: "tag-prefix", prefix: "" })).toBe("alpha");
	});
});
