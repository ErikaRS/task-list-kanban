import { describe, expect, it } from "vitest";
import {
	deriveGroupBuckets,
	getTaskTagGroupValue,
	taskBelongsToGroup,
} from "../task_grouping";
import type { Task } from "../task";
import { parseTask } from "./task_test_helpers";
import { UNIVERSAL_STATUS_PROPERTY_KEY } from "../../../parsing/properties/property_schema";

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

	it("assigns multi-tag tasks deterministically to the alphabetically first prefixed tag", () => {
		// Tags are intentionally listed out of order to prove assignment does not
		// depend on the order they appear in the source line.
		const task = parseTask("- [ ] Cross-project #Project-Beta #Project-Alpha");
		const buckets = deriveGroupBuckets([task], { kind: "tag-prefix", prefix: "project-" });
		const alphaBucket = buckets.find((bucket) => bucket.label === "Alpha")!;
		const betaBucket = buckets.find((bucket) => bucket.label === "Beta")!;

		expect(getTaskTagGroupValue(task, { kind: "tag-prefix", prefix: "project-" })).toBe("Project-Alpha");
		expect(taskBelongsToGroup(task, alphaBucket)).toBe(true);
		expect(taskBelongsToGroup(task, betaBucket)).toBe(false);
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

	it("returns only the Unassigned bucket when no task matches the prefix", () => {
		const tasks = [
			parseTask("- [ ] No sprint here #tag"),
			parseTask("- [ ] Also none #other"),
		];

		const buckets = deriveGroupBuckets(tasks, { kind: "tag-prefix", prefix: "Sprint-" });

		expect(buckets.map((bucket) => bucket.label)).toEqual(["Unassigned"]);
		expect(buckets[0]?.isDefault).toBe(true);
	});

	// Mirrors the work performed by the `updateSwimlaneTag` action, which resolves
	// the task's current group tag and then rewrites it onto the new swimlane.
	describe("swimlane reassignment (updateSwimlaneTag path)", () => {
		function moveTaskToSwimlane(
			task: ReturnType<typeof parseTask>,
			newTag: string | null,
			prefix: string,
			excludedTags: string[] = [],
		) {
			const oldTag = getTaskTagGroupValue(task, { kind: "tag-prefix", prefix }, excludedTags);
			task.replaceTag(oldTag, newTag);
		}

		it("rewrites the prefixed tag when moving between swimlanes", () => {
			const task = parseTask("- [ ] Ship it #Sprint-1 #column");
			moveTaskToSwimlane(task, "Sprint-2", "Sprint-");

			expect(task.tags.has("Sprint-1")).toBe(false);
			expect(task.tags.has("Sprint-2")).toBe(true);
			expect(task.serialise()).toBe("- [ ] Ship it #Sprint-2 #column");
		});

		it("adds a tag when moving an unassigned task into a swimlane", () => {
			const task = parseTask("- [ ] Ship it #column");
			moveTaskToSwimlane(task, "Sprint-2", "Sprint-");

			expect(task.tags.has("Sprint-2")).toBe(true);
			expect(task.serialise()).toBe("- [ ] Ship it #Sprint-2 #column");
		});

		it("removes the prefixed tag when moving into the Unassigned swimlane", () => {
			const task = parseTask("- [ ] Ship it #Sprint-1 #column");
			moveTaskToSwimlane(task, null, "Sprint-");

			expect(task.tags.has("Sprint-1")).toBe(false);
			expect(task.serialise()).toBe("- [ ] Ship it #column");
		});

		it("ignores excluded tags when resolving the tag to replace", () => {
			const task = parseTask("- [ ] Ship it #Sprint-1 #status/active");
			moveTaskToSwimlane(task, "Sprint-2", "Sprint-", ["status/active"]);

			// The excluded tag is untouched; only the sprint tag is rewritten.
			expect(task.tags.has("status/active")).toBe(true);
			expect(task.tags.has("Sprint-2")).toBe(true);
			expect(task.tags.has("Sprint-1")).toBe(false);
		});
	});
});

describe("property grouping", () => {
	function taskWithProperty(
		value: string | number | Date | null,
		key = "priority",
		rawValue = String(value),
	): Task {
		return {
			path: "tasks.md",
			properties: new Map(value === null ? [] : [[key, {
				key,
				rawValue,
				value,
				startIndex: 0,
				endIndex: 0,
			}]]),
		} as unknown as Task;
	}

	it("derives typed property buckets without a missing-value bucket", () => {
		const early = taskWithProperty(new Date("2026-01-01"), "due");
		const late = taskWithProperty(new Date("2026-03-01"), "due");
		const missing = taskWithProperty(null, "due");

		const buckets = deriveGroupBuckets(
			[late, missing, early],
			{ kind: "property", key: "due" },
		);

		expect(buckets.map((bucket) => bucket.label)).toEqual([
			"2026-01-01",
			"2026-03-01",
		]);
		expect(taskBelongsToGroup(early, buckets[0]!)).toBe(true);
		expect(buckets.some((bucket) => taskBelongsToGroup(missing, bucket))).toBe(false);
	});

	it("orders Tasks priority buckets highest first and labels them with markers", () => {
		const buckets = deriveGroupBuckets(
			[
				taskWithProperty(5, "priority", "🔺"),
				taskWithProperty(1, "priority", "⏬"),
				taskWithProperty(3, "priority", "🔼"),
			],
			{ kind: "property", key: "priority" },
		);

		expect(buckets.map((bucket) => bucket.label)).toEqual(["🔺", "🔼", "⏬"]);
	});

	it("orders Dataview priority buckets highest first and labels them with text", () => {
		const buckets = deriveGroupBuckets(
			[
				taskWithProperty("high", "priority", "[priority:: high]"),
				taskWithProperty("low", "priority", "[priority:: low]"),
				taskWithProperty("medium", "priority", "[priority:: medium]"),
			],
			{ kind: "property", key: "priority" },
		);

		expect(buckets.map((bucket) => bucket.label)).toEqual(["high", "medium", "low"]);
	});

	it("sorts numeric non-priority buckets numerically", () => {
		const buckets = deriveGroupBuckets(
			[taskWithProperty(10, "estimate"), taskWithProperty(2, "estimate")],
			{ kind: "property", key: "estimate" },
		);

		expect(buckets.map((bucket) => bucket.label)).toEqual(["2", "10"]);
	});

	it("orders status buckets by configured ascending marker order", () => {
		const buckets = deriveGroupBuckets(
			[
				taskWithProperty("x", UNIVERSAL_STATUS_PROPERTY_KEY),
				taskWithProperty("?", UNIVERSAL_STATUS_PROPERTY_KEY),
				taskWithProperty("/", UNIVERSAL_STATUS_PROPERTY_KEY),
				taskWithProperty(" ", UNIVERSAL_STATUS_PROPERTY_KEY),
			],
			{ kind: "property", key: UNIVERSAL_STATUS_PROPERTY_KEY },
			[],
			"/x",
			"xX",
		);

		expect(buckets.map((bucket) => bucket.label)).toEqual([" ", "/", "?", "x"]);
	});

	it("uses explicit space placement for status buckets", () => {
		const buckets = deriveGroupBuckets(
			[
				taskWithProperty(" ", UNIVERSAL_STATUS_PROPERTY_KEY),
				taskWithProperty("/", UNIVERSAL_STATUS_PROPERTY_KEY),
			],
			{ kind: "property", key: UNIVERSAL_STATUS_PROPERTY_KEY },
			[],
			"/ ",
		);

		expect(buckets.map((bucket) => bucket.label)).toEqual(["/", " "]);
	});
});
