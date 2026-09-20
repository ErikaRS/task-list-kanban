import { readable, type Readable } from "svelte/store";
import { getToday } from "./date_filter";

// Fire a beat after midnight so a timer that runs fractionally early never
// reads the old day and stalls until the next rollover.
const ROLLOVER_SLACK_MS = 1_000;

// Node-based unit tests have no Window, while an Obsidian view may belong to
// a popout window. Prefer that view's window whenever one is available.
type TimerHost = Pick<Window, "setTimeout" | "clearTimeout">;
const timerHost: TimerHost = typeof window === "undefined"
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- Node test timers do not share Window's timer signatures.
	? globalThis as unknown as TimerHost
	: window;

export function millisUntilNextLocalMidnight(now: Date): number {
	const nextMidnight = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() + 1,
	);
	return nextMidnight.getTime() - now.getTime() + ROLLOVER_SLACK_MS;
}

/**
 * Registers `onWake` for moments when a sleeping timer may have been missed:
 * the tab becoming visible again or the window regaining focus (OS sleep
 * suspends timers). Returns a cleanup function. Guarded for environments
 * without a DOM (unit tests).
 */
function registerDefaultWakeListeners(onWake: () => void): () => void {
	if (typeof document === "undefined" || typeof window === "undefined") {
		return () => {};
	}
	document.addEventListener("visibilitychange", onWake);
	window.addEventListener("focus", onWake);
	return () => {
		document.removeEventListener("visibilitychange", onWake);
		window.removeEventListener("focus", onWake);
	};
}

/**
 * A readable store holding getToday(), refreshed by a timer armed for the
 * next local midnight (re-armed after each fire) and defensively re-checked
 * on visibility/focus. Subscribers are only notified when the calendar day
 * actually changes, so wake re-checks don't cause spurious re-renders.
 *
 * The timer runs only while the store has subscribers; Svelte's readable
 * stops it when the last subscriber (e.g. an unmounting board) leaves.
 */
export function createTodayStore(
	registerWakeListeners: (
		onWake: () => void,
	) => () => void = registerDefaultWakeListeners,
): Readable<Date> {
	let current = getToday();

	return readable(current, (set) => {
		let timer: number | undefined;

		// Re-read in case the day rolled over between store creation and the
		// first subscription.
		const check = () => {
			const next = getToday();
			if (next.getTime() !== current.getTime()) {
				current = next;
				set(next);
			}
		};

		const arm = () => {
			timer = timerHost.setTimeout(() => {
				check();
				arm();
			}, millisUntilNextLocalMidnight(new Date()));
		};

		check();
		arm();
		const removeWakeListeners = registerWakeListeners(check);

		return () => {
			if (timer !== undefined) {
				timerHost.clearTimeout(timer);
			}
			removeWakeListeners();
		};
	});
}
