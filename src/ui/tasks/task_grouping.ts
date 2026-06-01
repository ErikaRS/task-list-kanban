import type { Task } from "./task";

export const DEFAULT_GROUP_BUCKET_ID = "__default__";

export type GroupSource = { kind: "none" } | { kind: "file" };

export interface GroupBucket {
	id: string; // stable internal id
	label: string; // user-facing label
	value: string | null;
	source: GroupSource;
	isDefault: boolean;
}

export function deriveGroupBuckets(
	tasks: Task[],
	source: GroupSource,
): GroupBucket[] {
	if (source.kind === "file") {
		const paths = [...new Set(tasks.map((task) => task.path))].sort((a, b) =>
			a.localeCompare(b),
		);

		if (paths.length === 0) {
			return [
				{
					id: DEFAULT_GROUP_BUCKET_ID,
					label: "No files",
					value: null,
					source,
					isDefault: true,
				},
			];
		}

		return paths.map((path) => ({
			id: createFileGroupBucketId(path),
			label: path,
			value: path,
			source,
			isDefault: false,
		}));
	}

	return [
		{
			id: DEFAULT_GROUP_BUCKET_ID,
			label: "Default",
			value: null,
			source,
			isDefault: true,
		},
	];
}

export function taskBelongsToGroup(task: Task, bucket: GroupBucket): boolean {
	switch (bucket.source.kind) {
		case "file":
			return bucket.value !== null && task.path === bucket.value;
		case "none":
			return true;
	}
}

export function getFileGroupPath(bucket: GroupBucket): string | null {
	return bucket.source.kind === "file" && bucket.value !== null
		? bucket.value
		: null;
}

function createFileGroupBucketId(path: string): string {
	return `file:${path}`;
}
