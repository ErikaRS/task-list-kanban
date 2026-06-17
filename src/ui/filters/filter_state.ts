import type { SettingValues } from "../settings/settings_store";

export interface BoardFilterState {
	contentText: string;
	tagValues: string[];
	fileText: string;
}

export function readBoardFilterState(settings: SettingValues): BoardFilterState {
	return {
		contentText: settings.lastContentFilter ?? "",
		tagValues: [...(settings.lastTagFilter ?? [])],
		fileText: settings.lastFileFilter?.[0] ?? "",
	};
}

export function writeBoardFilterState(
	settings: SettingValues,
	state: BoardFilterState,
): SettingValues {
	return {
		...settings,
		lastContentFilter: state.contentText,
		lastTagFilter: [...state.tagValues],
		lastFileFilter: state.fileText ? [state.fileText] : [],
	};
}

export function serializeBoardFilterState(state: BoardFilterState): string {
	return JSON.stringify({
		contentText: state.contentText,
		tagValues: state.tagValues,
		fileText: state.fileText,
	});
}
