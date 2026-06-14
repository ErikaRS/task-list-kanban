export interface TaskMarkdownSourceInput {
	content: string;
	displayStatus: string;
	blockLink?: string;
	excludedTags?: readonly string[];
}

export function renderTaskMarkdownSource({
	content,
	displayStatus,
	blockLink,
	excludedTags = [],
}: TaskMarkdownSourceInput): string {
	let contentWithBlockLink = (content + (blockLink ? ` ^${blockLink}` : ""))
		.replaceAll("<br />", "\n");

	for (const tag of excludedTags) {
		contentWithBlockLink = stripTagFromRenderedContent(contentWithBlockLink, tag);
	}

	const indentedContinuationLines = contentWithBlockLink.replaceAll("\n", "\n  ");
	return `- [${displayStatus || " "}] ${indentedContinuationLines}`;
}

function stripTagFromRenderedContent(content: string, tag: string): string {
	const normalizedTag = tag.trim().replace(/^#/, "");
	if (!normalizedTag) return content;

	const escapedTag = normalizedTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return content
		.replace(new RegExp(`(^|\\s)#${escapedTag}(?=$|\\s|[^-_\/\\p{L}\\p{N}])`, "giu"), "$1")
		.trim();
}
