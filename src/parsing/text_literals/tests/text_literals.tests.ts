import { describe, expect, it } from "vitest";
import { addTextLiteral, findTextLiteralMatches, removeTextLiteral, replaceTextLiteral, validateTextLiteral } from "../text_literals";

describe("text literal boundaries", () => {
	it.each([
		["@home", true], ["Fix sink @home", true], ["Fix sink (@home)", true],
		["Fix sink [@home]", true], ['Fix sink "@HOME"', false], ["Fix sink '@home'", true],
		["Fix sink @home.", true], ["Fix sink @home!", true], ["Fix sink @home,", true],
		["Email me@home.com", false], ["Finish @homework", false], ["Plan @home-office", false],
		["Fix sink @home/garage", false], ["@home_2", false], ["@home@work", false],
		["@homeé", false], ["é@home", false], ["x@home", false],
	])("matches %s: %s", (content, matched) => {
		expect(findTextLiteralMatches(content, "@home").length > 0).toBe(matched);
	});
	it("escapes arbitrary literal punctuation and wiki links", () => {
		expect(findTextLiteralMatches("Draft [[Project A]]", "[[Project A]]")).toEqual([{ start: 6, end: 19 }]);
		expect(findTextLiteralMatches("Draft [[Project A|alias]]", "[[Project A]]")).toEqual([]);
		expect(findTextLiteralMatches("Plan (a+b.*)", "a+b.*")).toHaveLength(1);
		expect(findTextLiteralMatches("Plan anything", "a+b.*")).toEqual([]);
		expect(findTextLiteralMatches("anything", "")).toEqual([]);
	});
	it.each(["", "  ", "#office", "@office\n", "a\rb"])("rejects %j", (value) => {
		expect(validateTextLiteral(value)).not.toBeNull();
	});
	it("rejects exact duplicates while allowing literals that differ in case", () => {
		expect(validateTextLiteral(" [[Project A]] ")).toBeNull();
		expect(validateTextLiteral(" @office ", ["@office"])).toContain("already");
		expect(validateTextLiteral(" @OFFICE ", ["@office"])).toBeNull();
	});
});

describe("surgical text writes", () => {
	it("adds before block links and treats differently cased text as distinct", () => {
		expect(addTextLiteral("\t* [/] Call  Bob ^abc123", "@office")).toBe("\t* [/] Call  Bob @office ^abc123");
		expect(addTextLiteral("- [ ] Call @Office", "@office")).toBe("- [ ] Call @Office @office");
		expect(addTextLiteral("- [ ] Call @office", "@office")).toBe("- [ ] Call @office");
	});
	it("replaces the first token in place and removes later occurrences", () => {
		expect(replaceTextLiteral("+ [ ] Call @phone about invoices @phone @PHONE ^abc123", "@phone", "@office"))
			.toBe("+ [ ] Call @office about invoices @PHONE ^abc123");
	});
	it("removes every token, preserving unrelated spacing, punctuation and metadata", () => {
		expect(removeTextLiteral("  - [ ] @home Call  Bob @home @HOME 📅 2026-11-01 ^abc123", "@home"))
			.toBe("  - [ ] Call  Bob @HOME 📅 2026-11-01 ^abc123");
		expect(removeTextLiteral("- [ ] Call (@home).", "@home")).toBe("- [ ] Call ().");
		expect(removeTextLiteral("- [ ] Call me@home.com @home-office", "@home"))
			.toBe("- [ ] Call me@home.com @home-office");
	});
	it("never edits checkbox markers even when the literal matches the marker", () => {
		expect(removeTextLiteral("- [x] x", "x")).toBe("- [x] ");
	});
});
