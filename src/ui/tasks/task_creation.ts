export function createTaskLine(
	content: string,
	placementTags: string[],
	additionalTags: string[] = [],
	status: string = " ",
): string {
	const seenTags = new Set<string>();
	const appendedTags: string[] = [];

	for (const tag of [...placementTags, ...additionalTags]) {
		const normalizedTag = tag.trim().replace(/^#/, "");
		if (!normalizedTag) continue;

		const key = normalizedTag.toLowerCase();
		if (seenTags.has(key)) continue;

		seenTags.add(key);
		appendedTags.push(normalizedTag);
	}

	return `- [${status}] ${content}${appendedTags.map((tag) => ` #${tag}`).join("")}`;
}
