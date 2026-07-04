import type { DateFilterCondition, SettingValues } from "../settings/settings_store";

export interface BoardFilterState {
	contentText: string;
	tagValues: string[];
	fileText: string;
	dateConditions: DateFilterCondition[];
}

export function readBoardFilterState(settings: SettingValues): BoardFilterState {
	return {
		contentText: settings.lastContentFilter ?? "",
		tagValues: [...(settings.lastTagFilter ?? [])],
		fileText: settings.lastFileFilter?.[0] ?? "",
		dateConditions: (settings.lastDateFilter ?? []).map((condition) => ({ ...condition })),
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
		lastDateFilter: state.dateConditions.map((condition) => ({ ...condition })),
	};
}

export function serializeBoardFilterState(state: BoardFilterState): string {
	return JSON.stringify({
		contentText: state.contentText,
		tagValues: state.tagValues,
		fileText: state.fileText,
		dateConditions: state.dateConditions.map((condition) => ({
			property: condition.property,
			operator: condition.operator,
			value: condition.value,
		})),
	});
}

export function shouldApplyIncomingBoardFilterState(
	currentState: BoardFilterState,
	incomingState: BoardFilterState,
	lastPersistedStateKey: string,
	hydrated: boolean,
): boolean {
	if (!hydrated) {
		return true;
	}

	const currentStateKey = serializeBoardFilterState(currentState);
	const incomingStateKey = serializeBoardFilterState(incomingState);
	return currentStateKey === lastPersistedStateKey && incomingStateKey !== lastPersistedStateKey;
}
