import { describe, expect, it } from "vitest";
import { PropertySchemaOption } from "../property_schema";
import { formatLocalDate, getPropertyWriteAdapter, getWritablePropertyTarget } from "../write";

const tasksAdapter = getPropertyWriteAdapter(PropertySchemaOption.TasksPlugin)!;
const dataviewAdapter = getPropertyWriteAdapter(PropertySchemaOption.Dataview)!;

describe("formatLocalDate", () => {
	it("formats local calendar dates as YYYY-MM-DD", () => {
		expect(formatLocalDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
	});
});

describe("getWritablePropertyTarget", () => {
	it("targets the editable date keys", () => {
		expect(getWritablePropertyTarget("due")).toEqual({ kind: "date", key: "due" });
		expect(getWritablePropertyTarget("scheduled")).toEqual({ kind: "date", key: "scheduled" });
		expect(getWritablePropertyTarget("start")).toEqual({ kind: "date", key: "start" });
	});

	it("targets priority", () => {
		expect(getWritablePropertyTarget("priority")).toEqual({ kind: "priority" });
	});

	it("rejects keys without a writer", () => {
		expect(getWritablePropertyTarget("completion")).toBeNull();
		expect(getWritablePropertyTarget("created")).toBeNull();
		expect(getWritablePropertyTarget("status")).toBeNull();
		expect(getWritablePropertyTarget("someInlineField")).toBeNull();
	});
});

describe("TasksPluginWriteAdapter", () => {
	it("adds completion dates before a trailing block link", () => {
		expect(tasksAdapter.addCompletionDateIfMissing("- [x] Send invoice #today ^abc123", "2026-06-15")).toBe(
			"- [x] Send invoice #today ✅ 2026-06-15 ^abc123",
		);
	});

	it("does not replace an existing completion date", () => {
		expect(tasksAdapter.addCompletionDateIfMissing("- [x] Done ✅ 2026-06-01", "2026-06-15")).toBe(
			"- [x] Done ✅ 2026-06-01",
		);
	});

	it("replaces the first existing date for a key", () => {
		expect(tasksAdapter.upsertDate("- [ ] Send invoice 📅 2026-06-01 📅 2026-06-02", "due", "2026-06-15")).toBe(
			"- [ ] Send invoice 📅 2026-06-15 📅 2026-06-02",
		);
	});

	it("preserves the legacy scheduled marker when replacing it", () => {
		expect(tasksAdapter.upsertDate("- [ ] Legacy reminder ⏰ 2026-06-01", "scheduled", "2026-06-15")).toBe(
			"- [ ] Legacy reminder ⏰ 2026-06-15",
		);
	});

	it("uses the current scheduled marker for new scheduled dates", () => {
		expect(tasksAdapter.upsertDate("- [ ] New reminder", "scheduled", "2026-06-15")).toBe(
			"- [ ] New reminder ⏳ 2026-06-15",
		);
	});

	it("removes date fields and normalizes adjacent spaces", () => {
		expect(tasksAdapter.removeDate("- [ ] Send invoice  📅 2026-06-15  #today", "due")).toBe(
			"- [ ] Send invoice #today",
		);
	});

	it("removes legacy done aliases through the completion key", () => {
		expect(tasksAdapter.removeDate("- [x] Finished 🏁 2026-06-15 ^abc123", "completion")).toBe(
			"- [x] Finished ^abc123",
		);
	});

	it("adds priority before a trailing block link", () => {
		expect(tasksAdapter.upsertPriority("- [ ] Triage #today ^abc123", "high")).toBe(
			"- [ ] Triage #today ⏫ ^abc123",
		);
	});

	it("replaces the first existing priority", () => {
		expect(tasksAdapter.upsertPriority("- [ ] Triage ⏫ #today", "low")).toBe(
			"- [ ] Triage 🔽 #today",
		);
	});

	it("removes priority and normalizes adjacent spaces", () => {
		expect(tasksAdapter.removePriority("- [ ] Triage  ⏫  #today")).toBe(
			"- [ ] Triage #today",
		);
	});
});

describe("DataviewWriteAdapter", () => {
	it("adds completion fields before a trailing block link", () => {
		expect(dataviewAdapter.addCompletionDateIfMissing("- [x] Send invoice #today ^abc123", "2026-06-15")).toBe(
			"- [x] Send invoice #today [completion:: 2026-06-15] ^abc123",
		);
	});

	it("does not add completion when a completion field already exists", () => {
		expect(dataviewAdapter.addCompletionDateIfMissing("- [x] Done [completion:: 2026-06-01]", "2026-06-15")).toBe(
			"- [x] Done [completion:: 2026-06-01]",
		);
	});

	it("does not add completion when a Dataview done alias already exists", () => {
		expect(dataviewAdapter.addCompletionDateIfMissing("- [x] Done [done:: 2026-06-01]", "2026-06-15")).toBe(
			"- [x] Done [done:: 2026-06-01]",
		);
	});

	it("replaces enclosed date fields", () => {
		expect(dataviewAdapter.upsertDate("- [ ] Send invoice [due:: 2026-06-01]", "due", "2026-06-15")).toBe(
			"- [ ] Send invoice [due:: 2026-06-15]",
		);
	});

	it("replaces bare date fields in place", () => {
		expect(dataviewAdapter.upsertDate("- [ ] Send invoice due:: 2026-06-01", "due", "2026-06-15")).toBe(
			"- [ ] Send invoice [due:: 2026-06-15]",
		);
	});

	it("writes new date fields with bracket syntax", () => {
		expect(dataviewAdapter.upsertDate("- [ ] Send invoice", "start", "2026-06-15")).toBe(
			"- [ ] Send invoice [start:: 2026-06-15]",
		);
	});

	it("removes bracket fields and preserves block links", () => {
		expect(dataviewAdapter.removeDate("- [ ] Send invoice [scheduled:: 2026-06-15] ^abc123", "scheduled")).toBe(
			"- [ ] Send invoice ^abc123",
		);
	});

	it("adds priority fields before a trailing block link", () => {
		expect(dataviewAdapter.upsertPriority("- [ ] Triage #today ^abc123", "high")).toBe(
			"- [ ] Triage #today [priority:: high] ^abc123",
		);
	});

	it("replaces existing priority fields in place", () => {
		expect(dataviewAdapter.upsertPriority("- [ ] Triage [priority:: high] #today", "low")).toBe(
			"- [ ] Triage [priority:: low] #today",
		);
	});

	it("removes priority fields and normalizes adjacent spaces", () => {
		expect(dataviewAdapter.removePriority("- [ ] Triage  [priority:: high]  #today")).toBe(
			"- [ ] Triage #today",
		);
	});
});
