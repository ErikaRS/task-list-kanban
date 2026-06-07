import { expect, test } from "vitest";
import { escapeRegExp, parseDateOnly, parseIsoDate, parseNumber } from "../value_parsers";

test("parseDateOnly accepts real calendar dates", () => {
	expect(parseDateOnly("2024-02-29")?.toISOString().startsWith("2024-02-29")).toBe(true);
});

test("parseDateOnly rejects invalid calendar dates", () => {
	expect(parseDateOnly("2024-02-31")).toBeNull();
	expect(parseDateOnly("2024-13-01")).toBeNull();
});

test("parseIsoDate accepts date-only and timestamp values", () => {
	expect(parseIsoDate("2024-01-20")?.toISOString().startsWith("2024-01-20")).toBe(true);
	expect(parseIsoDate("2024-01-20T12:30:00Z")?.toISOString()).toBe("2024-01-20T12:30:00.000Z");
});

test("parseNumber accepts plain integer and decimal values", () => {
	expect(parseNumber("5")).toBe(5);
	expect(parseNumber("-100.50")).toBe(-100.5);
});

test("parseNumber rejects non-plain numeric strings", () => {
	expect(parseNumber("5px")).toBeNull();
	expect(parseNumber("1,000")).toBeNull();
});

test("escapeRegExp escapes regex metacharacters", () => {
	expect(new RegExp(escapeRegExp("a+b?")).test("a+b?")).toBe(true);
});
