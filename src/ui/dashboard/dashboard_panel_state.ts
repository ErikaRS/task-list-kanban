import { cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";

/** One duration shared by the panel slide and scrim fade so they stay in step. */
export const PANEL_TRANSITION_DURATION_MS = 350;

export function panelTransitionDuration(reducedMotion: boolean): number {
	return reducedMotion ? 0 : PANEL_TRANSITION_DURATION_MS;
}

/**
 * Svelte transition: the panel slides in from the left edge — or from the
 * top when the rail is top-docked (SPEC 0034 phase 2), so it reads as
 * coming out of the rail in both layouts. Without an explicit easing Svelte
 * animates linearly, which reads as abrupt; ease-out gives the slide a
 * settle.
 */
export function panelSlide(
	_node: Element,
	options: { duration: number; axis?: "x" | "y" },
): TransitionConfig {
	const translate = options.axis === "y" ? "translateY" : "translateX";
	return {
		duration: options.duration,
		easing: cubicOut,
		css: (t) => `transform: ${translate}(${(t - 1) * 100}%)`,
	};
}

/** Svelte transition: the scrim fades in step with the slide. */
export function scrimFade(
	_node: Element,
	options: { duration: number },
): TransitionConfig {
	return {
		duration: options.duration,
		easing: cubicOut,
		css: (t) => `opacity: ${t}`,
	};
}

/**
 * Selecting the current board just closes the panel; any other board also
 * switches the leaf.
 */
export function shouldSwitchBoard(
	selectedPath: string,
	currentPath: string | null,
): boolean {
	return selectedPath !== currentPath;
}
