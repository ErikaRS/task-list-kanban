import type { Task } from "./task";

export const DEFAULT_GROUP_BUCKET_ID = "__default__";

export type GroupSource = 
	| { kind: "none" } 
	| { kind: "file" }
	| { kind: "tag-prefix", prefix?: string };

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
	excludedTags: string[] = [],
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

	if (source.kind === "tag-prefix") {
		const prefix = (source.prefix ?? "").toLowerCase();
		const excludeSet = new Set(excludedTags);
		const tagMap = new Map<string, string>();

		for (const task of tasks) {
			for (const tag of task.tags) {
				if (excludeSet.has(tag)) continue;

				if (prefix) {
					if (tag.toLowerCase().startsWith(prefix)) {
						const suffix = tag.slice(prefix.length);
						if (!tagMap.has(suffix.toLowerCase())) {
							tagMap.set(suffix.toLowerCase(), tag);
						}
					}
				} else {
					if (!tagMap.has(tag.toLowerCase())) {
						tagMap.set(tag.toLowerCase(), tag);
					}
				}
			}
		}

		const sortedFullTags = Array.from(tagMap.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map((entry) => entry[1]);

		const buckets: GroupBucket[] = sortedFullTags.map((fullTag) => {
			const label = prefix ? fullTag.slice(prefix.length) : fullTag;
			return {
				id: createTagPrefixGroupBucketId(prefix, label),
				label: label,
				value: fullTag,
				source,
				isDefault: false,
			};
		});

		buckets.push({
			id: "tag-prefix:unassigned",
			label: "Unassigned",
			value: null,
			source,
			isDefault: true,
		});

		return buckets;
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

export function taskBelongsToGroup(task: Task, bucket: GroupBucket, excludedTags: string[] = []): boolean {
	switch (bucket.source.kind) {
		case "file":
			return bucket.value !== null && task.path === bucket.value;
		case "tag-prefix": {
			const prefix = (bucket.source.prefix ?? "").toLowerCase();
			const excludeSet = new Set(excludedTags);

			if (bucket.id === "tag-prefix:unassigned") {
				if (prefix) {
					return !Array.from(task.tags).some(t => t.toLowerCase().startsWith(prefix));
				} else {
					return !Array.from(task.tags).some(t => !excludeSet.has(t));
				}
			}

			let candidateTags = Array.from(task.tags).filter(t => !excludeSet.has(t));
			if (prefix) {
				candidateTags = candidateTags.filter(t => t.toLowerCase().startsWith(prefix));
			}

			if (candidateTags.length === 0) return false;

			candidateTags.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
			const primaryTag = candidateTags[0]!;
			const primaryLabel = prefix ? primaryTag.slice(prefix.length) : primaryTag;

			return primaryLabel.toLowerCase() === bucket.label.toLowerCase();
		}
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

function createTagPrefixGroupBucketId(prefix: string, label: string): string {
	return `tag-prefix:${prefix}:${label}`;
}
