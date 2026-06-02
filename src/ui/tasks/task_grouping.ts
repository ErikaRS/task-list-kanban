import type { Task } from "./task";

export const DEFAULT_GROUP_BUCKET_ID = "__default__";

export type GroupSource =
	| { kind: "none" }
	| { kind: "file" }
	| { kind: "tag-prefix"; prefix?: string };

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
		const prefix = normalizeTagPrefix(source.prefix);
		const excludeSet = createNormalizedTagSet(excludedTags);
		const tagMap = new Map<string, string>();

		for (const task of tasks) {
			for (const tag of task.tags) {
				if (isTagExcluded(tag, excludeSet)) continue;

				if (prefix) {
					if (tag.toLowerCase().startsWith(prefix)) {
						const suffix = tag.slice(prefix.length);
						const key = suffix.toLowerCase();
						if (suffix && !tagMap.has(key)) {
							tagMap.set(key, tag);
						}
					}
				} else {
					const key = tag.toLowerCase();
					if (!tagMap.has(key)) {
						tagMap.set(key, tag);
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
				id: createTagPrefixGroupBucketId(prefix, label.toLowerCase()),
				label: label,
				value: fullTag,
				source: { kind: "tag-prefix", prefix },
				isDefault: false,
			};
		});

		buckets.push({
			id: createTagPrefixUnassignedGroupBucketId(prefix),
			label: "Unassigned",
			value: null,
			source: { kind: "tag-prefix", prefix },
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
			const groupTag = getTaskTagGroupValue(task, bucket.source, excludedTags);
			return bucket.isDefault ? groupTag === null : groupTag?.toLowerCase() === bucket.value?.toLowerCase();
		}
		case "none":
			return true;
	}
}

export function getTaskTagGroupValue(
	task: Task,
	source: Extract<GroupSource, { kind: "tag-prefix" }>,
	excludedTags: string[] = [],
): string | null {
	return resolveTaskGroupTag(task, normalizeTagPrefix(source.prefix), createNormalizedTagSet(excludedTags));
}

function resolveTaskGroupTag(task: Task, prefix: string, excludeSet: Set<string>): string | null {
	const candidateTags = Array.from(task.tags)
		.filter((tag) => !isTagExcluded(tag, excludeSet))
		.filter((tag) => {
			if (!prefix) return true;
			return tag.toLowerCase().startsWith(prefix) && tag.slice(prefix.length).length > 0;
		});

	// Pick the alphabetically first matching tag so swimlane assignment is
	// deterministic regardless of the order tags appear in the source line.
	return candidateTags
		.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))[0] ?? null;
}

/**
 * Builds a function that maps a task to the id of the bucket it belongs to.
 *
 * The per-source setup (normalising the prefix, building the excluded-tag set
 * and the value→bucket lookup) happens once here rather than once per
 * (task × bucket) inside {@link taskBelongsToGroup}, keeping board derivation
 * linear in the number of tasks.
 */
export function createGroupAssigner(
	buckets: GroupBucket[],
	source: GroupSource,
	excludedTags: string[] = [],
): (task: Task) => string | undefined {
	const defaultBucketId = buckets.find((bucket) => bucket.isDefault)?.id;

	if (source.kind === "tag-prefix") {
		const prefix = normalizeTagPrefix(source.prefix);
		const excludeSet = createNormalizedTagSet(excludedTags);
		const idByValue = new Map<string, string>();
		for (const bucket of buckets) {
			if (!bucket.isDefault && bucket.value !== null) {
				idByValue.set(bucket.value.toLowerCase(), bucket.id);
			}
		}
		return (task) => {
			const groupTag = resolveTaskGroupTag(task, prefix, excludeSet);
			if (groupTag === null) return defaultBucketId;
			return idByValue.get(groupTag.toLowerCase()) ?? defaultBucketId;
		};
	}

	if (source.kind === "file") {
		const idByPath = new Map<string, string>();
		for (const bucket of buckets) {
			if (bucket.value !== null) idByPath.set(bucket.value, bucket.id);
		}
		return (task) => idByPath.get(task.path) ?? defaultBucketId;
	}

	return () => defaultBucketId;
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

function createTagPrefixUnassignedGroupBucketId(prefix: string): string {
	return createTagPrefixGroupBucketId(prefix, "__unassigned__");
}

export function normalizeTagPrefix(prefix: string | undefined): string {
	return prefix?.trim().replace(/^#/, "").toLowerCase() ?? "";
}

function createNormalizedTagSet(tags: string[]): Set<string> {
	return new Set(tags.map((tag) => tag.trim().replace(/^#/, "").toLowerCase()).filter(Boolean));
}

function isTagExcluded(tag: string, excludeSet: Set<string>): boolean {
	return excludeSet.has(tag.toLowerCase());
}
