import { describe, expect, it, vi } from "vitest";
import moment from "moment";
import {
	dailyNoteSourceFrom,
	getDailyNotePathIssue,
	readCoreDailyNoteOptions,
	resolveDailyNotePath,
} from "../daily_note";

vi.mock("obsidian", () => ({ moment }));

const NOV_1 = new Date(2026, 10, 1, 12);

function appWithDailyNotes(plugin: unknown) {
	return { internalPlugins: { getPluginById: (id: string) => (id === "daily-notes" ? plugin : undefined) } } as never;
}

describe("daily note source", () => {
	it("prefers a non-blank override over core settings", () => {
		const source = dailyNoteSourceFrom(" daily/{{YYYY-MM-DD}} ", {
			folder: "Journal",
			format: "",
			template: "",
		});
		expect(source).toEqual({ kind: "override", pattern: "daily/{{YYYY-MM-DD}}" });
		expect(resolveDailyNotePath(source, NOV_1)).toBe("daily/2026-11-01.md");
	});

	it("builds the core pattern from folder and format, defaulting a blank format", () => {
		const source = dailyNoteSourceFrom("", { folder: "/Journal/", format: "", template: "Templates/Daily" });
		expect(source).toEqual({
			kind: "core",
			pattern: "Journal/{{YYYY-MM-DD}}.md",
			templatePath: "Templates/Daily.md",
		});
		expect(resolveDailyNotePath(source, NOV_1)).toBe("Journal/2026-11-01.md");
	});

	it("resolves nested core formats and a vault-root folder", () => {
		const source = dailyNoteSourceFrom("", { folder: "", format: "YYYY/MM/YYYY-MM-DD", template: "" });
		expect(resolveDailyNotePath(source, NOV_1)).toBe("2026/11/2026-11-01.md");
	});

	it("is unconfigured without an override or core plugin", () => {
		const source = dailyNoteSourceFrom("  ", null);
		expect(source).toEqual({ kind: "unconfigured" });
		expect(resolveDailyNotePath(source, NOV_1)).toBeNull();
	});

	it("appends .md unless the path already ends with it, including dotted dates", () => {
		expect(resolveDailyNotePath({ kind: "override", pattern: "d/{{YYYY.MM.DD}}" }, NOV_1)).toBe("d/2026.11.01.md");
		expect(resolveDailyNotePath({ kind: "override", pattern: "d/{{YYYY-MM-DD}}.MD" }, NOV_1)).toBe("d/2026-11-01.MD");
	});
});

describe("core daily notes options", () => {
	it("reads options from the enabled core plugin", () => {
		const app = appWithDailyNotes({
			enabled: true,
			instance: { options: { folder: "Journal", format: "YYYY/MM/DD", template: 3 } },
		});
		expect(readCoreDailyNoteOptions(app)).toEqual({ folder: "Journal", format: "YYYY/MM/DD", template: "" });
	});

	it("treats a plugin with no saved options as core defaults", () => {
		const app = appWithDailyNotes({ enabled: true, instance: {} });
		expect(readCoreDailyNoteOptions(app)).toEqual({ folder: "", format: "", template: "" });
	});

	it("returns null for a disabled, missing, or unexpectedly shaped plugin", () => {
		expect(readCoreDailyNoteOptions(appWithDailyNotes({ enabled: false, instance: { options: {} } }))).toBeNull();
		expect(readCoreDailyNoteOptions(appWithDailyNotes(undefined))).toBeNull();
		expect(readCoreDailyNoteOptions(appWithDailyNotes({ enabled: true, instance: { options: "x" } }))).toBeNull();
		expect(readCoreDailyNoteOptions({} as never)).toBeNull();
		expect(readCoreDailyNoteOptions({
			internalPlugins: { getPluginById: () => { throw new Error("boom"); } },
		} as never)).toBeNull();
	});
});

describe("daily note path validation", () => {
	it("accepts blank and dated paths, warns on undated, rejects invalid templates", () => {
		expect(getDailyNotePathIssue("")).toBeNull();
		expect(getDailyNotePathIssue("daily/{{YYYY-MM-DD}}.md")).toBeNull();
		expect(getDailyNotePathIssue("daily/today.md")?.level).toBe("warning");
		expect(getDailyNotePathIssue("daily/{{}}.md")?.level).toBe("error");
		expect(getDailyNotePathIssue("../{{YYYY}}.md")?.level).toBe("error");
	});
});
