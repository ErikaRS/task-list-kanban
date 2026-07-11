import { describe, expect, it } from "vitest";
import { cubicOut } from "svelte/easing";
import {
	PANEL_TRANSITION_DURATION_MS,
	panelSlide,
	panelTransitionDuration,
	scrimFade,
	shouldSwitchBoard,
} from "../dashboard_panel_state";

// The transitions never touch the node, so a bare object stands in for it.
const node = {} as Element;

describe("panelTransitionDuration", () => {
	it("uses the shared duration normally", () => {
		expect(panelTransitionDuration(false)).toBe(PANEL_TRANSITION_DURATION_MS);
	});

	it("renders instantly under prefers-reduced-motion", () => {
		expect(panelTransitionDuration(true)).toBe(0);
	});
});

describe("panelSlide", () => {
	it("slides from fully off-screen left into place with ease-out", () => {
		const config = panelSlide(node, { duration: 200 });

		expect(config.duration).toBe(200);
		expect(config.easing).toBe(cubicOut);
		expect(config.css?.(0, 1)).toBe("transform: translateX(-100%)");
		expect(config.css?.(0.5, 0.5)).toBe("transform: translateX(-50%)");
		expect(config.css?.(1, 0)).toBe("transform: translateX(0%)");
	});
});

describe("scrimFade", () => {
	it("fades the scrim in step with the slide", () => {
		const config = scrimFade(node, { duration: 200 });

		expect(config.duration).toBe(200);
		expect(config.easing).toBe(cubicOut);
		expect(config.css?.(0, 1)).toBe("opacity: 0");
		expect(config.css?.(1, 0)).toBe("opacity: 1");
	});
});

describe("shouldSwitchBoard", () => {
	it("switches to a different board", () => {
		expect(shouldSwitchBoard("projects/Work.md", "Home.md")).toBe(true);
	});

	it("only closes when the current board is selected", () => {
		expect(shouldSwitchBoard("Home.md", "Home.md")).toBe(false);
	});

	it("switches when no current board is known", () => {
		expect(shouldSwitchBoard("Home.md", null)).toBe(true);
	});
});
