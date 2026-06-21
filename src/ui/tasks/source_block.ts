export type SourceBlockNode = SourceTaskNode | SourceRawNode;

export type SourceTaskNode = {
	kind: "task";
	taskVisibility: "visible" | "ignored";
	rowIndex: number;
	rawLine: string;
	indentation: string;
	status: string;
	content: string;
	sourceChildren: SourceBlockNode[];
};

export type SourceRawNode = {
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
	return node.kind === "task"
		? node.content
		: node.rawLine.slice(node.indentation.length);
}

export function getRawListItemText(node: SourceRawNode): string | null {
	const match = node.rawLine.slice(node.indentation.length).match(/^[-*+]\s+(.+)$/);
	return match?.[1] ?? null;
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

const sourceTaskLineRegex = /^(\s*)([-*+])\s\[([^\[\]]*)\]\s(.+)/;
