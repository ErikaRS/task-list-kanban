import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import {
	createTodayStore,
	millisUntilNextLocalMidnight,
} from "../today_store";

const HOUR = 60 * 60 * 1000;
const SLACK = 1_000;

const noWakeListeners = () => () => {};

describe("millisUntilNextLocalMidnight", () => {
	it("measures to the next local midnight plus slack", () => {
		expect(millisUntilNextLocalMidnight(new Date(2026, 6, 3, 23, 0, 0))).toBe(
			HOUR + SLACK,
		);
	});

	it("spans a full day from exactly midnight", () => {
		expect(millisUntilNextLocalMidnight(new Date(2026, 6, 3, 0, 0, 0))).toBe(
			24 * HOUR + SLACK,
		);
	});
});

describe("createTodayStore", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("holds the local calendar day as UTC midnight", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 6, 3, 9, 30));

		const store = createTodayStore(noWakeListeners);

		expect(get(store).getTime()).toBe(Date.UTC(2026, 6, 3));
	});

	it("rolls over at local midnight and re-arms for the next one", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 6, 3, 23, 59, 0));

		const store = createTodayStore(noWakeListeners);
		const seen: number[] = [];
		const unsubscribe = store.subscribe((today) => seen.push(today.getTime()));

		vi.advanceTimersByTime(60 * 1000 + SLACK);
		expect(seen).toEqual([Date.UTC(2026, 6, 3), Date.UTC(2026, 6, 4)]);

		vi.advanceTimersByTime(24 * HOUR);
		expect(seen).toEqual([
			Date.UTC(2026, 6, 3),
			Date.UTC(2026, 6, 4),
			Date.UTC(2026, 6, 5),
		]);

		unsubscribe();
	});

	it("re-checks on wake and only notifies when the day changed", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 6, 3, 12, 0));

		let wake = () => {};
		const store = createTodayStore((onWake) => {
			wake = onWake;
			return () => {};
		});
		const seen: number[] = [];
		const unsubscribe = store.subscribe((today) => seen.push(today.getTime()));

		// Same day: a focus/visibility event must not re-notify subscribers.
		wake();
		expect(seen).toEqual([Date.UTC(2026, 6, 3)]);

		// Jump past midnight without firing timers, as after OS sleep.
		vi.setSystemTime(new Date(2026, 6, 4, 0, 5));
		wake();
		expect(seen).toEqual([Date.UTC(2026, 6, 3), Date.UTC(2026, 6, 4)]);

		unsubscribe();
	});

	it("stops the timer and removes wake listeners when unused", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 6, 3, 12, 0));

		let removed = false;
		const store = createTodayStore(() => () => {
			removed = true;
		});
		const unsubscribe = store.subscribe(() => {});

		expect(vi.getTimerCount()).toBe(1);
		unsubscribe();
		expect(vi.getTimerCount()).toBe(0);
		expect(removed).toBe(true);
	});
});
