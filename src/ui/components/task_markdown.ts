export interface TaskMarkdownSourceInput {
	content: string;
	displayStatus: string;
	blockLink?: string;
	excludedTags?: readonly string[];
	referenceDefinitions?: string;
}

export function renderTaskMarkdownSource({
	content,
	displayStatus,
	blockLink,
	excludedTags = [],
	referenceDefinitions = "",
}: TaskMarkdownSourceInput): string {
	const [first = "", ...rest] = content.split("\n");
	const trailing = first.match(/[ \t]+$/)?.[0] ?? "";
	let contentWithBlockLink = blockLink ? (trailing ? first.slice(0, -trailing.length) : first) + ` ^${blockLink}` + trailing : first;

	for (const tag of excludedTags) {
		contentWithBlockLink = stripTagFromRenderedContent(contentWithBlockLink, tag);
	}

	const indentedContinuationLines = [contentWithBlockLink, ...rest.map(line => line ? "  " + line : line)].join("\n");
	return `- [${displayStatus || " "}] ${indentedContinuationLines}` + (referenceDefinitions ? "\n\n" + referenceDefinitions : "");
}

function stripTagFromRenderedContent(content: string, tag: string): string {
	const normalizedTag = tag.trim().replace(/^#/, "");
	if (!normalizedTag) return content;

	const escapedTag = normalizedTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return content
		.replace(new RegExp(`(^|\\s)#${escapedTag}(?=$|\\s|[^-_/\\p{L}\\p{N}])`, "giu"),
			(match, leading: string, offset: number) => offset + match.length === content.length ? "" : leading);
}
