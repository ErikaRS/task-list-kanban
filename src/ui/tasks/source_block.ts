import { editableMarkdownSource, markdownBlock, markdownBody, type MarkdownSource } from "./markdown_source";

export type SourceBlockNode = SourceTaskNode | SourceRawNode;

export type SourceTaskNode = {
	source?: MarkdownSource;
	kind: "task";
	taskVisibility: "visible" | "ignored" | "archived";
	rowIndex: number;
	rawLine: string;
	indentation: string;
	status: string;
	content: string;
	sourceChildren: SourceBlockNode[];
};

export type SourceRawNode = {
	source?: MarkdownSource;
	kind: "raw";
	rowIndex: number;
	rawLine: string;
	indentation: string;
	sourceChildren: SourceBlockNode[];
};

export type ParsedTaskLine = {
	indentation: string;
	bullet: string;
	status: string;
	content: string;
};

export function parseSourceTaskLine(input: string): ParsedTaskLine | null {
	const match = input.match(sourceTaskLineRegex);
	if (!match) {
		return null;
	}

	const [, indentation, bullet, status, content] = match;
	if (indentation == null || bullet == null || status == null || content == null) {
		return null;
	}

	return { indentation, bullet, status, content };
}

export function getSourceNodeText(node: SourceBlockNode): string {
	if (node.source) return markdownBody(node.source);
	return node.kind === "task"
		? node.content
		: node.rawLine.slice(node.indentation.length);
}

export function getRawListItemText(node: SourceRawNode): string | null {
	if (node.source?.listPrefix) return markdownBody(node.source);
	const match = node.rawLine.slice(node.indentation.length).match(/^[-*+]\s+(.+)$/);
	return match?.[1] ?? null;
}

export function getSourceNodePreview(node: SourceBlockNode): string {
	if (!node.source) return getRawListItemTextIfRaw(node) ?? getSourceNodeText(node);
	const definitions = node.source.referenceDefinitions ? "\n\n" + node.source.referenceDefinitions : "";
	return markdownBlock(editableMarkdownSource(node.source)) + definitions;
}

function getRawListItemTextIfRaw(node: SourceBlockNode): string | null {
	return node.kind === "raw" ? getRawListItemText(node) : null;
}

export function getVisibleSourceTaskDescendants(nodes: SourceBlockNode[]): SourceTaskNode[] {
	return flattenSourceBlockNodes(nodes).filter(
		(node): node is SourceTaskNode => node.kind === "task" && node.taskVisibility === "visible",
	);
}

export function flattenSourceBlockNodes(nodes: SourceBlockNode[]): SourceBlockNode[] {
	return nodes.flatMap((node) => [
		node,
		...flattenSourceBlockNodes(node.sourceChildren),
	]);
}

const sourceTaskLineRegex = /^(\s*)([-*+])\s\[([^[\]]*)\]\s(.+)/;
