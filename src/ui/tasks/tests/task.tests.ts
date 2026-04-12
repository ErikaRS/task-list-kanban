import { describe, expect, it } from "vitest";
import {
	isTrackedTaskString,
	Task,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
	validateDoneStatusMarkers,
	createDoneStatusMarkers,
	validateCancelledStatusMarkers,
	createCancelledStatusMarkers,
	validateIgnoredStatusMarkers,
	createIgnoredStatusMarkers,
	DEFAULT_CANCELLED_STATUS_MARKERS
} from "../task";
import { type ColumnDefinition, type ColumnTag, createColumnData } from "src/ui/columns/columns";
import { kebab } from "src/parsing/kebab/kebab";

function createNameModeColumns(labels: string[]): ColumnDefinition[] {
	return labels.map((label) => ({
		id: kebab<ColumnTag>(label),
		label,
		matchMode: "name" as const,
		matchTags: [],
	}));
}

const defaultColumns = createNameModeColumns(["column"]);
const defaultPlacementTags = createColumnData(defaultColumns).columnPlacementTagTable;

describe("Task", () => {

	it("parses a basic task string, -", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		expect(task?.content).toBe("Something #tag");
		expect(task?.tags.has("tag")).toBeTruthy();
	});

	it("parses a basic task string, *", () => {
		let task: Task | undefined;
		const taskString = "* [ ] Something #tag";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		expect(task?.content).toBe("Something #tag");
		expect(task?.tags.has("tag")).toBeTruthy();
	});

	it("parses a basic task string, +", () => {
		let task: Task | undefined;
		const taskString = "+ [ ] Something #tag";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		expect(task?.content).toBe("Something #tag");
		expect(task?.tags.has("tag")).toBeTruthy();
	});

	it("parses a basic task string with a column", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		expect(task?.content).toBe("Something #tag");
		expect(task?.column).toBe("column");
	});

	it("serialises a basic task string with a column", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
		}

		const output = task?.serialise();
		expect(taskString).toBe(output);
	});

	it("serialises a basic task string with a column and consolidate tags", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, true, "xX", "-", "");
		}

		const output = task?.serialise();
		expect(taskString).toBe(output);
	});

	it("matches a tags-mode column by explicit tag", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "doing" as ColumnTag,
				label: "Doing",
				matchMode: "tags",
				matchTags: ["status/now"],
			},
		];
		const placementTags = {
			doing: ["status/now"],
		} as const;
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #status/now";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, explicitColumns, placementTags, false, "xX", "-", "");
		}

		expect(task?.column).toBe("doing");
		expect(task?.content).toBe("Something #tag");
		expect(task?.serialise()).toBe(taskString);
	});

	it("matches a tags-mode column only when all explicit tags are present", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "active-work" as ColumnTag,
				label: "Active Work",
				matchMode: "tags",
				matchTags: ["project/alpha", "status/active"],
			},
		];
		const placementTags = {
			"active-work": ["project/alpha", "status/active"],
		} as const;
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #project/alpha #status/active";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, explicitColumns, placementTags, false, "xX", "-", "");
		}

		expect(task?.column).toBe("active-work");
		expect(task?.content).toBe("Something #tag");
		expect(task?.tags.size).toBe(1);
		expect(task?.tags.has("tag")).toBe(true);
	});

	it("treats partial tags-mode matches as uncategorized and leaves tags visible", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "active-work" as ColumnTag,
				label: "Active Work",
				matchMode: "tags",
				matchTags: ["project/alpha", "status/active"],
			},
		];
		const placementTags = {
			"active-work": ["project/alpha", "status/active"],
		} as const;
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #project/alpha";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, explicitColumns, placementTags, false, "xX", "-", "");
		}

		expect(task?.column).toBeUndefined();
		expect(task?.content).toBe("Something #tag #project/alpha");
		expect(task?.tags.has("project/alpha")).toBe(true);
		expect(task?.serialise()).toBe(taskString);
	});

	it("does not match a multi-tag column when only the second required tag is present", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "active-work" as ColumnTag,
				label: "Active Work",
				matchMode: "tags",
				matchTags: ["project/alpha", "status/active"],
			},
		];
		const placementTags = {
			"active-work": ["project/alpha", "status/active"],
		} as const;
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #status/active";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, explicitColumns, placementTags, false, "xX", "-", "");
		}

		expect(task?.column).toBeUndefined();
		expect(task?.content).toBe("Something #tag #status/active");
		expect(task?.tags.has("status/active")).toBe(true);
		expect(task?.serialise()).toBe(taskString);
	});

	it("does not match a multi-tag column from the label-derived tag alone", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "active-work" as ColumnTag,
				label: "Active Work",
				matchMode: "tags",
				matchTags: ["project/alpha", "status/active"],
			},
		];
		const placementTags = {
			"active-work": ["project/alpha", "status/active"],
		} as const;
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #active-work";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, explicitColumns, placementTags, false, "xX", "-", "");
		}

		expect(task?.column).toBeUndefined();
		expect(task?.content).toBe("Something #tag #active-work");
		expect(task?.tags.has("active-work")).toBe(true);
		expect(task?.serialise()).toBe(taskString);
	});

	it("writes all placement tags for a tags-mode column", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "active-work" as ColumnTag,
				label: "Active Work",
				matchMode: "tags",
				matchTags: ["project/alpha", "status/active"],
			},
		];
		const placementTags = {
			"active-work": ["project/alpha", "status/active"],
		} as const;
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, explicitColumns, placementTags, false, "xX", "-", "");
			task.column = "active-work" as ColumnTag;
		}

		expect(task?.serialise()).toBe("- [ ] Something #tag #project/alpha #status/active");
	});

	it("removes all placement tags when moving out of a multi-tag column", () => {
		const columns: ColumnDefinition[] = [
			{
				id: "active-work" as ColumnTag,
				label: "Active Work",
				matchMode: "tags",
				matchTags: ["project/alpha", "status/active"],
			},
			{
				id: "backlog" as ColumnTag,
				label: "Backlog",
				matchMode: "name",
				matchTags: [],
			},
		];
		const placementTags = createColumnData(columns).columnPlacementTagTable;
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #project/alpha #status/active";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, columns, placementTags, false, "xX", "-", "");
			task.column = "backlog" as ColumnTag;
		}

		expect(task?.serialise()).toBe("- [ ] Something #tag #backlog");
	});

	it("prefers the most specific matching column when multiple columns match", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "a" as ColumnTag,
				label: "A",
				matchMode: "tags",
				matchTags: ["A"],
			},
			{
				id: "ab" as ColumnTag,
				label: "A B",
				matchMode: "tags",
				matchTags: ["A", "B"],
			},
			{
				id: "abc" as ColumnTag,
				label: "A B C",
				matchMode: "tags",
				matchTags: ["A", "B", "C"],
			},
		];
		const placementTags = {
			a: ["A"],
			ab: ["A", "B"],
			abc: ["A", "B", "C"],
		} as const;
		let task: Task | undefined;
		const taskString = "- [ ] Something #A #B #C #tag";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, explicitColumns, placementTags, false, "xX", "-", "");
		}

		expect(task?.column).toBe("abc");
		expect(task?.content).toBe("Something #tag");
		expect(task?.tags.has("A")).toBe(false);
		expect(task?.tags.has("B")).toBe(false);
		expect(task?.tags.has("C")).toBe(false);
	});

	it("uses column order to break ties between equally specific matches", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "a" as ColumnTag,
				label: "A",
				matchMode: "tags",
				matchTags: ["A", "B"],
			},
			{
				id: "c" as ColumnTag,
				label: "C",
				matchMode: "tags",
				matchTags: ["B", "C"],
			},
		];
		const placementTags = {
			a: ["A", "B"],
			c: ["B", "C"],
		} as const;
		let task: Task | undefined;
		const taskString = "- [ ] Something #A #B #C #tag";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, explicitColumns, placementTags, false, "xX", "-", "");
		}

		expect(task?.column).toBe("a");
		expect(task?.content).toBe("Something #C #tag");
		expect(task?.tags.has("C")).toBe(true);
		expect(task?.tags.has("A")).toBe(false);
		expect(task?.tags.has("B")).toBe(false);
	});

	it("matches a multi-tag column regardless of tag order in task content", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "active-work" as ColumnTag,
				label: "Active Work",
				matchMode: "tags",
				matchTags: ["project/alpha", "status/active"],
			},
		];
		const placementTags = {
			"active-work": ["project/alpha", "status/active"],
		} as const;
		let orderedTask: Task | undefined;
		let reversedTask: Task | undefined;
		const orderedTaskString = "- [ ] Ordered #project/alpha #status/active";
		const reversedTaskString = "- [ ] Reversed #status/active #project/alpha";
		if (isTrackedTaskString(orderedTaskString)) {
			orderedTask = new Task(
				orderedTaskString,
				{ path: "/" },
				0,
				explicitColumns,
				placementTags,
				false,
				"xX",
				"-",
				"",
			);
		}
		if (isTrackedTaskString(reversedTaskString)) {
			reversedTask = new Task(
				reversedTaskString,
				{ path: "/" },
				1,
				explicitColumns,
				placementTags,
				false,
				"xX",
				"-",
				"",
			);
		}

		expect(orderedTask?.column).toBe("active-work");
		expect(reversedTask?.column).toBe("active-work");
	});

	it("archives a multi-tag column by removing all placement tags and adding archived", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "active-work" as ColumnTag,
				label: "Active Work",
				matchMode: "tags",
				matchTags: ["project/alpha", "status/active"],
			},
		];
		const placementTags = {
			"active-work": ["project/alpha", "status/active"],
		} as const;
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #project/alpha #status/active";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, explicitColumns, placementTags, false, "xX", "-", "");
			task.archive();
		}

		expect(task?.serialise()).toBe("- [x] Something #tag #archived");
	});

	it("does not duplicate an explicit placement tag already present in task content", () => {
		const explicitColumns: ColumnDefinition[] = [
			{
				id: "doing" as ColumnTag,
				label: "Doing",
				matchMode: "tags",
				matchTags: ["status/now"],
			},
		];
		const placementTags = {
			doing: ["status/now"],
		} as const;
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #status/now";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, placementTags, false, "xX", "-", "");
			task.column = "doing" as ColumnTag;
		}

		expect(task?.serialise()).toBe(taskString);
	});
	it("parses a task string with a block link", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag #column ^link-link";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		expect(task?.content).toBe("Something #tag");
		expect(task?.blockLink).toBe("link-link");
	});

	it("serialises a basic task string with a block link", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Something #tag ^link-link";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			task.column = "column" as ColumnTag;
		}

		const output = task?.serialise();
		expect("- [ ] Something #tag #column ^link-link").toBe(output);
	});

	describe("indented tasks", () => {
		it("parses a task string with space indentation", () => {
			let task: Task | undefined;
			const taskString = "  - [ ] Indented with 2 spaces #tag";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			}

			expect(task).toBeTruthy();
			expect(task?.indentation).toBe("  ");
			expect(task?.content).toBe("Indented with 2 spaces #tag");
		});

		it("parses a task string with tab indentation", () => {
			let task: Task | undefined;
			const taskString = "\t- [ ] Indented with tab #tag";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			}

			expect(task).toBeTruthy();
			expect(task?.indentation).toBe("\t");
			expect(task?.content).toBe("Indented with tab #tag");
		});

		it("parses a task string with mixed space and tab indentation", () => {
			let task: Task | undefined;
			const taskString = " \t - [ ] Mixed spaces and tabs #tag";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			}

			expect(task).toBeTruthy();
			expect(task?.indentation).toBe(" \t ");
			expect(task?.content).toBe("Mixed spaces and tabs #tag");
		});

		it("parses a completed indented task string", () => {
			let task: Task | undefined;
			const taskString = "  - [x] Completed indented task #tag";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			}

			expect(task).toBeTruthy();
			expect(task?.indentation).toBe("  ");
			expect(task?.done).toBe(true);
			expect(task?.content).toBe("Completed indented task #tag");
		});

		it("parses an indented task string with a block link", () => {
			let task: Task | undefined;
			const taskString = "\t- [ ] Indented with block link #tag ^block123";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			}

			expect(task).toBeTruthy();
			expect(task?.indentation).toBe("\t");
			expect(task?.blockLink).toBe("block123");
			expect(task?.content).toBe("Indented with block link #tag");
		});

		it("serialises an indented task string with spaces", () => {
			let task: Task | undefined;
			const taskString = "    - [ ] Four spaces #tag #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			}

			const output = task?.serialise();
			expect(taskString).toBe(output);
		});

		it("serialises an indented task string with tabs", () => {
			let task: Task | undefined;
			const taskString = "\t\t- [ ] Two tabs #tag #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			}

			const output = task?.serialise();
			expect(taskString).toBe(output);
		});

		it("serialises an indented task string with mixed indentation", () => {
			let task: Task | undefined;
			const taskString = "\t  \t- [ ] Tab space tab #tag #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			}

			const output = task?.serialise();
			expect(taskString).toBe(output);
		});
	});

	describe("customizable done status markers", () => {
		it("recognizes custom done status markers", () => {
			let task: Task | undefined;
			const taskString = "- [✓] Custom done marker #tag";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX✓", "-", "");
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.content).toBe("Custom done marker #tag");
		});

		it("does not recognize non-configured done status markers", () => {
			let task: Task | undefined;
			const taskString = "- [✓] Custom done marker #tag";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, DEFAULT_DONE_STATUS_MARKERS, "-", "");
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(false);
			expect(task?.content).toBe("Custom done marker #tag");
		});

		it("handles multi-codepoint unicode characters", () => {
			let task: Task | undefined;
			const taskString = "- [👍] Multi-codepoint emoji #tag";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX👍", "-", "");
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.content).toBe("Multi-codepoint emoji #tag");
		});

		it("recognizes checkmark ✅ as done status", () => {
			let task: Task | undefined;
			const taskString = "- [✅] Task with checkmark #tag";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX✅", "-", "");
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.content).toBe("Task with checkmark #tag");
		});

		describe("invalid status markers", () => {
			it("treats multi-character status as not done", () => {
				let task: Task | undefined;
				const taskString = "- [abc] Task with multi-char status #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(false);
			});

			it("treats whitespace-only status as not done", () => {
				let task: Task | undefined;
				const taskString = "- [  ] Task with spaces #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(false);
			});

			it("treats tab character as not done when not configured", () => {
				let task: Task | undefined;
				const taskString = "- [\t] Task with tab #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(false);
			});

			it("treats unknown character as not done", () => {
				let task: Task | undefined;
				const taskString = "- [z] Task with unknown char #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(false);
			});

			it("treats number as not done", () => {
				let task: Task | undefined;
				const taskString = "- [1] Task with number #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(false);
			});
		});

		describe("case sensitivity", () => {
			it("respects case sensitivity in done markers", () => {
				let task: Task | undefined;
				const taskString = "- [X] Uppercase done marker #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "x", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(false);
			});

			it("handles lowercase done markers", () => {
				let task: Task | undefined;
				const taskString = "- [x] Lowercase done marker #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "x", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(true);
			});
		});

		describe("special characters", () => {
			it("handles regex special characters in done markers", () => {
				let task: Task | undefined;
				const taskString = "- [*] Asterisk done marker #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX*", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(true);
			});

			it("handles plus character as done marker", () => {
				let task: Task | undefined;
				const taskString = "- [+] Plus done marker #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX+", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(true);
			});

			it("handles question mark as done marker", () => {
				let task: Task | undefined;
				const taskString = "- [?] Question mark done marker #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX?", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(true);
			});

			it("handles dot character as done marker", () => {
				let task: Task | undefined;
				const taskString = "- [.] Dot done marker #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX.", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(true);
			});

			it("handles backslash character as done marker", () => {
				let task: Task | undefined;
				const taskString = "- [\\] Backslash done marker #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX\\", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(true);
			});
		});

		describe("unicode edge cases", () => {
			it("handles combining characters correctly", () => {
				let task: Task | undefined;
				const taskString = "- [é] Combining accent #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xXé", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(true);
			});

			it("handles zero-width characters as invalid", () => {
				let task: Task | undefined;
				const taskString = "- [\u200B] Zero-width space #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX\u200B", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(true);
			});

			it("handles surrogate pairs correctly", () => {
				let task: Task | undefined;
				const taskString = "- [🚀] Rocket emoji #tag";
				if (isTrackedTaskString(taskString)) {
					task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX🚀", "-", "");
				}

				expect(task).toBeTruthy();
				expect(task?.done).toBe(true);
			});
		});
	});

	describe("obsidian links", () => {
		it("should not identify backlink as a task", () => {
			const backlink = "- [[x]]";
			expect(isTrackedTaskString(backlink)).toBe(false);
		});

		it("should not identify backlink with content as a task", () => {
			const backlink = "- [[x]] some content";
			expect(isTrackedTaskString(backlink)).toBe(false);
		});

		it("should not identify indented backlink as a task", () => {
			const backlink = "  - [[x]]";
			expect(isTrackedTaskString(backlink)).toBe(false);
		});

		it("should not identify a link as a task", () => {
			const notTask = "- [x](foo)";
			expect(isTrackedTaskString(notTask)).toBe(false);
		});
	});
});

describe("Ignored Status Markers", () => {
	describe("isTrackedTaskString with ignored status markers", () => {
		it("includes tasks with dash status by default (no ignored statuses)", () => {
			const taskString = "- [-] Task with dash status #tag";
			expect(isTrackedTaskString(taskString)).toBe(true);
		});

		it("excludes tasks with custom ignored status", () => {
			const taskString = "- [~] Custom ignored task #tag";
			expect(isTrackedTaskString(taskString, "~")).toBe(false);
		});

		it("excludes tasks when dash is configured as ignored", () => {
			const taskString = "- [-] Cancelled task #tag";
			expect(isTrackedTaskString(taskString, "-")).toBe(false);
		});

		it("includes tasks with non-ignored status", () => {
			const taskString = "- [ ] Regular task #tag";
			expect(isTrackedTaskString(taskString)).toBe(true);
		});

		it("includes tasks with done status", () => {
			const taskString = "- [x] Done task #tag";
			expect(isTrackedTaskString(taskString)).toBe(true);
		});

		it("excludes indented tasks with ignored status", () => {
			const taskString = "  - [-] Indented cancelled task #tag";
			expect(isTrackedTaskString(taskString, "-")).toBe(false);
		});

		it("excludes tasks with multiple ignored statuses", () => {
			const taskString1 = "- [-] Cancelled with dash #tag";
			const taskString2 = "- [~] Cancelled with tilde #tag";
			expect(isTrackedTaskString(taskString1, "-~")).toBe(false);
			expect(isTrackedTaskString(taskString2, "-~")).toBe(false);
		});

		it("excludes tasks with emoji ignored status", () => {
			const taskString = "- [❌] Cancelled with emoji #tag";
			expect(isTrackedTaskString(taskString, "❌")).toBe(false);
		});
	});
});

describe("Ignored Status Markers Validation", () => {
	describe("validateIgnoredStatusMarkers", () => {
		it("accepts valid marker strings", () => {
			expect(validateIgnoredStatusMarkers("-~")).toEqual([]);
			expect(validateIgnoredStatusMarkers("❌🚫")).toEqual([]);
			expect(validateIgnoredStatusMarkers("-")).toEqual([]);
			expect(validateIgnoredStatusMarkers("~")).toEqual([]);
		});

		it("accepts empty strings (no ignored statuses)", () => {
			expect(validateIgnoredStatusMarkers("")).toEqual([]);
		});

		it("rejects whitespace characters", () => {
			const errors = validateIgnoredStatusMarkers("- ");
			expect(errors).toContain("Marker at position 2 is whitespace");
		});

		it("rejects duplicate characters", () => {
			const errors = validateIgnoredStatusMarkers("--");
			expect(errors).toContain("Duplicate marker '-' at position 2");
		});

		it("handles Unicode emoji correctly", () => {
			expect(validateIgnoredStatusMarkers("❌🚫")).toEqual([]);
		});
	});

	describe("createIgnoredStatusMarkers", () => {
		it("creates valid markers successfully", () => {
			const markers = createIgnoredStatusMarkers("-~");
			expect(markers).toBe("-~");
		});

		it("creates empty markers successfully", () => {
			const markers = createIgnoredStatusMarkers("");
			expect(markers).toBe("");
		});

		it("throws with detailed error messages for invalid characters", () => {
			expect(() => createIgnoredStatusMarkers("- ")).toThrow(
				"Invalid ignored status markers: Marker at position 2 is whitespace"
			);
		});
	});

	describe("DEFAULT_IGNORED_STATUS_MARKERS", () => {
		it("is valid according to validation rules", () => {
			expect(validateIgnoredStatusMarkers(DEFAULT_IGNORED_STATUS_MARKERS)).toEqual([]);
		});

		it("is empty by default (no tasks ignored)", () => {
			expect(DEFAULT_IGNORED_STATUS_MARKERS).toBe("");
		});

		it("can be used to create validated markers", () => {
			expect(() => createIgnoredStatusMarkers(DEFAULT_IGNORED_STATUS_MARKERS)).not.toThrow();
		});
	});
});

describe("Done Status Markers Validation", () => {
	describe("validateDoneStatusMarkers", () => {
		it("accepts valid marker strings", () => {
			expect(validateDoneStatusMarkers("xX")).toEqual([]);
			expect(validateDoneStatusMarkers("✓✅👍")).toEqual([]);
			expect(validateDoneStatusMarkers("x")).toEqual([]);
			expect(validateDoneStatusMarkers("*+?")).toEqual([]);
		});

		it("rejects empty strings", () => {
			expect(validateDoneStatusMarkers("")).toEqual([
				"Done status markers cannot be empty"
			]);
			expect(validateDoneStatusMarkers("   ")).not.toEqual([]);
		});

		it("rejects whitespace characters", () => {
			const errors = validateDoneStatusMarkers("x X");
			expect(errors).toContain("Marker at position 2 is whitespace");
		});

		it("rejects newline characters", () => {
			const errors = validateDoneStatusMarkers("x\nX");
			expect(errors).toContain("Marker at position 2 is whitespace");
		});

		it("rejects tab characters", () => {
			const errors = validateDoneStatusMarkers("x\tX");
			expect(errors).toContain("Marker at position 2 is whitespace");
		});

		it("rejects control characters", () => {
			const errors = validateDoneStatusMarkers("x\u0001X");
			expect(errors).toContain("Marker at position 2 is a control character");
		});

		it("rejects duplicate characters", () => {
			const errors = validateDoneStatusMarkers("xXx");
			expect(errors).toContain("Duplicate marker 'x' at position 3");
		});

		it("handles Unicode emoji correctly", () => {
			expect(validateDoneStatusMarkers("🚀👍✅")).toEqual([]);
		});

		it("handles accented characters correctly", () => {
			expect(validateDoneStatusMarkers("éñü")).toEqual([]);
		});

		it("accumulates multiple errors", () => {
			const errors = validateDoneStatusMarkers("x x\tx");
			// Should find: space, duplicate 'x', tab (whitespace), tab (control char), final duplicate 'x'
			expect(errors.length).toBe(5);
			expect(errors).toContain("Marker at position 2 is whitespace");
			expect(errors).toContain("Duplicate marker 'x' at position 3");
		});
	});

	describe("createDoneStatusMarkers", () => {
		it("creates valid markers successfully", () => {
			const markers = createDoneStatusMarkers("xX✓");
			expect(markers).toBe("xX✓");
		});

		it("throws for invalid markers", () => {
			expect(() => createDoneStatusMarkers("")).toThrow(
				"Invalid done status markers: Done status markers cannot be empty"
			);
		});

		it("throws with detailed error messages", () => {
			expect(() => createDoneStatusMarkers("x x")).toThrow(
				"Invalid done status markers: Marker at position 2 is whitespace"
			);
		});

		it("throws with multiple error messages", () => {
			expect(() => createDoneStatusMarkers("x xx")).toThrow(/Multiple|whitespace|Duplicate/);
		});
	});

	describe("DEFAULT_DONE_STATUS_MARKERS", () => {
		it("is valid according to validation rules", () => {
			expect(validateDoneStatusMarkers(DEFAULT_DONE_STATUS_MARKERS)).toEqual([]);
		});

		it("contains expected default characters", () => {
			expect(DEFAULT_DONE_STATUS_MARKERS).toBe("xX");
		});

		it("can be used to create validated markers", () => {
			expect(() => createDoneStatusMarkers(DEFAULT_DONE_STATUS_MARKERS)).not.toThrow();
		});
	});
});

describe("Cancelled Status Markers Validation", () => {
	describe("validateCancelledStatusMarkers", () => {
		it("accepts valid marker strings", () => {
			expect(validateCancelledStatusMarkers("-")).toEqual([]);
			expect(validateCancelledStatusMarkers("CX")).toEqual([]);
			expect(validateCancelledStatusMarkers("c")).toEqual([]);
			expect(validateCancelledStatusMarkers("*+?")).toEqual([]);
		});

		it("rejects empty strings", () => {
			expect(validateCancelledStatusMarkers("")).toEqual([
				"Cancelled status markers cannot be empty"
			]);
			expect(validateCancelledStatusMarkers("   ")).not.toEqual([]);
		});

		it("rejects whitespace characters", () => {
			const errors = validateCancelledStatusMarkers("c C");
			expect(errors).toContain("Marker at position 2 is whitespace");
		});

		it("rejects newline characters", () => {
			const errors = validateCancelledStatusMarkers("c\nC");
			expect(errors).toContain("Marker at position 2 is whitespace");
		});

		it("rejects tab characters", () => {
			const errors = validateCancelledStatusMarkers("c\tC");
			expect(errors).toContain("Marker at position 2 is whitespace");
		});

		it("rejects control characters", () => {
			const errors = validateCancelledStatusMarkers("c\u0001C");
			expect(errors).toContain("Marker at position 2 is a control character");
		});

		it("rejects duplicate characters", () => {
			const errors = validateCancelledStatusMarkers("cCc");
			expect(errors).toContain("Duplicate marker 'c' at position 3");
		});

		it("handles Unicode emoji correctly", () => {
			expect(validateCancelledStatusMarkers("🚀👍✅")).toEqual([]);
		});

		it("handles accented characters correctly", () => {
			expect(validateCancelledStatusMarkers("éñü")).toEqual([]);
		});

		it("accumulates multiple errors", () => {
			const errors = validateCancelledStatusMarkers("c c\tc");
			// Should find: space, duplicate 'c', tab (whitespace), tab (control char), final duplicate 'c'
			expect(errors.length).toBe(5);
			expect(errors).toContain("Marker at position 2 is whitespace");
			expect(errors).toContain("Duplicate marker 'c' at position 3");
		});
	});

	describe("createCancelledStatusMarkers", () => {
		it("creates valid markers successfully", () => {
			const markers = createCancelledStatusMarkers("cx✓");
			expect(markers).toBe("cx✓");
		});

		it("throws for invalid markers", () => {
			expect(() => createCancelledStatusMarkers("")).toThrow(
				"Invalid cancelled status markers: Cancelled status markers cannot be empty"
			);
		});

		it("throws with detailed error messages", () => {
			expect(() => createCancelledStatusMarkers("c c")).toThrow(
				"Invalid cancelled status markers: Marker at position 2 is whitespace"
			);
		});

		it("throws with multiple error messages", () => {
			expect(() => createCancelledStatusMarkers("c cc")).toThrow(/Multiple|whitespace|Duplicate/);
		});
	});

	describe("DEFAULT_CANCELLED_STATUS_MARKERS", () => {
		it("is valid according to validation rules", () => {
			expect(validateCancelledStatusMarkers(DEFAULT_CANCELLED_STATUS_MARKERS)).toEqual([]);
		});

		it("contains expected default characters", () => {
			expect(DEFAULT_CANCELLED_STATUS_MARKERS).toBe("-");
		});

		it("can be used to create validated markers", () => {
			expect(() => createCancelledStatusMarkers(DEFAULT_CANCELLED_STATUS_MARKERS)).not.toThrow();
		});
	});
});

describe("Task archiving", () => {
	describe("retains original done markers when archiving", () => {
		it("retains uppercase X marker when archiving", () => {
			let task: Task | undefined;
			const taskString = "- [X] Already done task #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
				task.archive();
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.column).toBe("archived");
			expect(task?.serialise()).toBe("- [X] Already done task #archived");
		});

		it("retains lowercase x marker when archiving", () => {
			let task: Task | undefined;
			const taskString = "- [x] Already done task #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
				task.archive();
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.column).toBe("archived");
			expect(task?.serialise()).toBe("- [x] Already done task #archived");
		});

		it("retains custom Unicode done marker when archiving", () => {
			let task: Task | undefined;
			const taskString = "- [✓] Custom done marker task #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX✓", "-", "");
				task.archive();
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.column).toBe("archived");
			expect(task?.serialise()).toBe("- [✓] Custom done marker task #archived");
		});

		it("retains emoji done marker when archiving", () => {
			let task: Task | undefined;
			const taskString = "- [✅] Emoji done marker task #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX✅", "-", "");
				task.archive();
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.column).toBe("archived");
			expect(task?.serialise()).toBe("- [✅] Emoji done marker task #archived");
		});
	});

	describe("applies default done marker when archiving incomplete tasks", () => {
		it("uses default 'x' marker when archiving incomplete task", () => {
			let task: Task | undefined;
			const taskString = "- [ ] Incomplete task #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
				task.archive();
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.column).toBe("archived");
			expect(task?.serialise()).toBe("- [x] Incomplete task #archived");
		});

		it("uses default 'x' marker when archiving task with unknown status", () => {
			let task: Task | undefined;
			const taskString = "- [?] Unknown status task #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
				task.archive();
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.column).toBe("archived");
			expect(task?.serialise()).toBe("- [x] Unknown status task #archived");
		});
	});
});

describe("Task marking as done", () => {
	describe("done setter updates display status", () => {
		it("uses first done marker with default markers (xX)", () => {
			let task: Task | undefined;
			const taskString = "- [ ] Incomplete task #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
				task.done = true;
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.column).toBe(undefined);
			expect(task?.serialise()).toBe("- [x] Incomplete task");
		});

		it("uses first done marker with custom markers (✓✅)", () => {
			let task: Task | undefined;
			const taskString = "- [ ] Incomplete task #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "✓✅", "-", "");
				task.done = true;
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.column).toBe(undefined);
			expect(task?.serialise()).toBe("- [✓] Incomplete task");
		});

		it("uses first done marker with single custom marker", () => {
			let task: Task | undefined;
			const taskString = "- [ ] Incomplete task #column";
			if (isTrackedTaskString(taskString)) {
				task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "✅", "-", "");
				task.done = true;
			}

			expect(task).toBeTruthy();
			expect(task?.done).toBe(true);
			expect(task?.column).toBe(undefined);
			expect(task?.serialise()).toBe("- [✅] Incomplete task");
		});
	});

	it("clears column when marking as done", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Task in column #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			task.done = true;
		}

		expect(task?.column).toBe(undefined);
		expect(task?.serialise()).not.toContain("#column");
	});

	it("preserves task content when marking as done", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Important task with #tags #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			task.done = true;
		}

		expect(task?.content).toBe("Important task with #tags");
		expect(task?.serialise()).toBe("- [x] Important task with #tags");
	});
});

describe("Task display status", () => {
	it("exposes default unchecked status as a space", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Incomplete task #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		expect(task?.displayStatus).toBe(" ");
	});

	it("preserves parsed custom status marker", () => {
		let task: Task | undefined;
		const taskString = "- [/] In progress task #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		expect(task?.displayStatus).toBe("/");
	});

	it("updates to first done marker when marked done", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Incomplete task #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "✓✅", "-", "");
			task.done = true;
		}

		expect(task).toBeTruthy();
		expect(task?.displayStatus).toBe("✓");
	});

	it("updates to cancel marker and then resets on restore", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Incomplete task #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "CA", "");
			task.cancel();
		}

		expect(task).toBeTruthy();
		expect(task?.displayStatus).toBe("C");

		task?.restore();
		expect(task?.displayStatus).toBe(" ");
	});
});

describe("Task cancelling", () => {
	it("cancelling a task updates the status to '-'", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Incomplete task #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			task.cancel();
		}

		expect(task).toBeTruthy();
		expect(task?.isCancelled).toBe(true);
		expect(task?.serialise()).toBe("- [-] Incomplete task #column");
	});

	it("restoring a task updates the status to ' '", () => {
		let task: Task | undefined;
		const taskString = "- [-] Cancelled task #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "-", "");
			task.restore();
		}

		expect(task).toBeTruthy();
		expect(task?.isCancelled).toBe(false);
		expect(task?.serialise()).toBe("- [ ] Cancelled task #column");
	});

	it("returns true for isCancelled when using custom marker", () => {
		let task: Task | undefined;
		const taskString = "- [c] Cancelled task #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "c", "");
		}

		expect(task).toBeTruthy();
		expect(task?.isCancelled).toBe(true);
	});

	it("outputs first configured cancel marker on cancel()", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Incomplete task #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "CA", "");
			task.cancel();
		}

		expect(task).toBeTruthy();
		expect(task?.isCancelled).toBe(true);
		expect(task?.serialise()).toBe("- [C] Incomplete task #column");
	});

	it("matches isCancelled against the second custom marker", () => {
		let task: Task | undefined;
		const taskString = "- [A] Parsed as cancelled #column";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, defaultColumns, defaultPlacementTags, false, "xX", "CA", "");
		}

		expect(task).toBeTruthy();
		expect(task?.isCancelled).toBe(true);
	});
});

describe("Columns with spaces and special characters", () => {
	const specialColumns = createNameModeColumns(["In Progress", "Waiting for review", "Done!", "My-Tag"]);
	const specialPlacementTags = createColumnData(specialColumns).columnPlacementTagTable;
	// kebab("In Progress") -> "in-progress"
	// kebab("Waiting for review") -> "waiting-for-review"
	// kebab("Done!") -> "done" (special chars removed)
	// kebab("My-Tag") -> "my-tag"

	it("serialises a task in 'In Progress' column using kebab-case tag", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Something #in-progress";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, specialColumns, specialPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		expect(task?.column).toBe("in-progress");

		const output = task?.serialise();
		expect(output).toBe("- [ ] Something #in-progress");
	});

	it("serialises a task in 'Waiting for review' column using kebab-case tag", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Something #waiting-for-review";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, specialColumns, specialPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		expect(task?.column).toBe("waiting-for-review");

		const output = task?.serialise();
		expect(output).toBe("- [ ] Something #waiting-for-review");
	});

	it("serialises a task in 'Done!' column using kebab-case tag", () => {
		let task: Task | undefined;
		// kebab("Done!") -> "done". But wait, "done" is usually reserved? 
		// In Task.ts constructor: if (kebabTag in columnTagTable || tag === "done")
		// If "done" is in columnTagTable, it's treated as a column.

		const taskString = "- [ ] Something #done";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, specialColumns, specialPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		// "done" maps to "Done!" which has '!' which might be invalid in tags?
		// Obsidian tags: alphabetical letters, numbers, underscore (_), hyphen (-), forward slash (/)
		// '!' is not allowed.

		const output = task?.serialise();
		// Should fall back to "done"
		expect(output).toBe("- [ ] Something #done");
	});

	it("serialises a task in 'My-Tag' column using the original casing because it is valid", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Something #my-tag";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, specialColumns, specialPlacementTags, false, "xX", "-", "");
		}

		expect(task).toBeTruthy();
		expect(task?.column).toBe("my-tag");

		const output = task?.serialise();
		expect(output).toBe("- [ ] Something #my-tag");
	});

	it("serialises a task after moving to 'In Progress' column", () => {
		let task: Task | undefined;
		const taskString = "- [ ] Something";
		if (isTrackedTaskString(taskString)) {
			task = new Task(taskString, { path: "/" }, 0, specialColumns, specialPlacementTags, false, "xX", "-", "");
			task.column = kebab<ColumnTag>("In Progress"); // "in-progress"
		}

		const output = task?.serialise();
		expect(output).toBe("- [ ] Something #in-progress");
	});
});
