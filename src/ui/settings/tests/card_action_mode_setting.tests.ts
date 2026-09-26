import { expect, it } from "vitest";
import { get } from "svelte/store";
import { createSettingsStore, parseSettingsOverrides } from "../settings_store";

it("keeps a board's saved card action mode", () => {
	expect(parseSettingsOverrides('{"cardActionMode":"advance"}').cardActionMode).toBe("advance");
	expect(parseSettingsOverrides('{"cardActionMode":"select"}').cardActionMode).toBe("select");
});

it("falls back safely for an unrecognized saved mode", () => {
	expect(parseSettingsOverrides('{"cardActionMode":"unknown"}').cardActionMode).toBe("done");
	expect(parseSettingsOverrides("{}").cardActionMode).toBeUndefined();
});

it("restores each board's mode from its own saved overrides", () => {
	const firstBoard = createSettingsStore();
	firstBoard.update((settings) => ({ ...settings, cardActionMode: "advance" }));
	const saved = firstBoard.getOverrides();
	expect(saved.cardActionMode).toBe("advance");
	const reopened = createSettingsStore();
	reopened.load(saved);
	expect(get(reopened).cardActionMode).toBe("advance");
	const secondBoard = createSettingsStore();
	expect(get(secondBoard).cardActionMode).toBeUndefined();
	firstBoard.destroy();
	reopened.destroy();
	secondBoard.destroy();
});
