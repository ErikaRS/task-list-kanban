import { describe, expect, it } from "vitest";
import {
	buildBoardCards,
	formatLastModified,
	type BoardStatLookup,
} from "../dashboard_cards";
import type { BoardIndexEntry } from "../../boards/board_index";

const work: BoardIndexEntry = {
	path: "projects/Work.md",
	name: "Work",
	folder: "projects",
};
const rootBoard: BoardIndexEntry = { path: "Home.md", name: "Home", folder: "/" };

describe("buildBoardCards", () => {
	it("derives cards with folder and last-modified from the stat lookup", () => {
		const getStat: BoardStatLookup = (path) =>
			path === work.path ? { mtime: 1234 } : null;

		expect(buildBoardCards([work], getStat)).toEqual([
			{
				path: "projects/Work.md",
				name: "Work",
				folder: "projects",
				lastModified: 1234,
			},
		]);
	});

	it("normalizes the vault-root folder spellings to no folder", () => {
		const emptyFolder: BoardIndexEntry = { ...rootBoard, folder: "" };
		const cards = buildBoardCards([rootBoard, emptyFolder], () => ({ mtime: 1 }));

		expect(cards.map((card) => card.folder)).toEqual(["", ""]);
	});

	it("leaves last-modified unset when the stat lookup misses", () => {
		const [card] = buildBoardCards([work], () => null);

		expect(card?.lastModified).toBeUndefined();
	});

	it("carries last-opened from the stamp map, unset for never-opened boards", () => {
		const cards = buildBoardCards([work, rootBoard], () => null, {
			[work.path]: 5678,
		});

		expect(cards.map((card) => card.lastOpened)).toEqual([5678, undefined]);
	});
});

describe("formatLastModified", () => {
	const now = Date.UTC(2026, 6, 10, 12, 0, 0);
	const minutes = (count: number) => count * 60_000;
	const hours = (count: number) => count * 3_600_000;
	const days = (count: number) => count * 86_400_000;

	it("treats under a minute (including future mtimes) as just now", () => {
		expect(formatLastModified(now, now)).toBe("just now");
		expect(formatLastModified(now - minutes(1) + 1, now)).toBe("just now");
		expect(formatLastModified(now + minutes(5), now)).toBe("just now");
	});

	it("formats minutes with singular/plural boundaries", () => {
		expect(formatLastModified(now - minutes(1), now)).toBe("1 minute ago");
		expect(formatLastModified(now - minutes(59), now)).toBe("59 minutes ago");
	});

	it("formats hours up to a day", () => {
		expect(formatLastModified(now - hours(1), now)).toBe("1 hour ago");
		expect(formatLastModified(now - hours(23), now)).toBe("23 hours ago");
	});

	it("formats days up to a week", () => {
		expect(formatLastModified(now - days(1), now)).toBe("1 day ago");
		expect(formatLastModified(now - days(6), now)).toBe("6 days ago");
	});

	it("falls back to an absolute date at a week and beyond", () => {
		const mtime = now - days(7);
		const expected = new Date(mtime).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});

		expect(formatLastModified(mtime, now)).toBe(expected);
		expect(formatLastModified(mtime, now)).toContain("2026");
	});
});
