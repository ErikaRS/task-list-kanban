import { cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";

/** One duration shared by the panel slide and scrim fade so they stay in step. */
export const PANEL_TRANSITION_DURATION_MS = 350;

export function panelTransitionDuration(reducedMotion: boolean): number {
	return reducedMotion ? 0 : PANEL_TRANSITION_DURATION_MS;
}

/**
 * Svelte transition: the panel slides in from the left edge. Without an
 * explicit easing Svelte animates linearly, which reads as abrupt; ease-out
 * gives the slide a settle.
 */
export function panelSlide(
	_node: Element,
	options: { duration: number },
): TransitionConfig {
	return {
		duration: options.duration,
		easing: cubicOut,
		css: (t) => `transform: translateX(${(t - 1) * 100}%)`,
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
