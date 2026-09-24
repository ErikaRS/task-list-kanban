import type { TFile } from "obsidian";
import type { Writable } from "svelte/store";
import type { TaskActions } from "../tasks/actions";
import type { NewTaskColumn } from "../tasks/task_line_builder";
import type { PropertySchemaOption } from "../../parsing/properties";
export const MOBILE_CREATION = Symbol("mobile-task-creation");
export interface MobileCreationSession {
	readonly id: symbol;
	column: NewTaskColumn;
	context: string;
	file: TFile | null;
	fixedFile: boolean;
	additionalTags: string[];
	propertySchemaOption: PropertySchemaOption;
	taskActions: TaskActions;
}
export type MobileCreationStore = Writable<MobileCreationSession | null>;

/** Capture the tapped cell; later filtering/regrouping must not retarget a draft. */
export function captureMobileCreation(session: Omit<MobileCreationSession, "id">): MobileCreationSession {
	return { ...session, id: Symbol("creation-session"), additionalTags: [...session.additionalTags] };
}

export async function saveMobileCreation(
	session: MobileCreationSession,
	content: string,
	dates: Partial<Record<"due" | "scheduled" | "start", string>>,
): Promise<void> {
	if (!session.file) throw new Error("Choose a destination file before creating the task.");
	if (!content.trim()) throw new Error("Enter some task text before creating the task.");
	await session.taskActions.createTask(session.file, content.trim().replaceAll("\n", "<br />"), session.column, session.additionalTags, dates);
}
