import type { TFile, Vault } from "obsidian";

export interface SourceRangeEdit {
	start: number;
	end: number;
	expected: string;
	replacement: string;
}

/** Validate all spans before changing any bytes. Vault.process makes the read/write atomic in Obsidian. */
export async function replaceSourceRanges(vault: Vault, file: TFile, edits: SourceRangeEdit[], prepare?: PrepareFileContentsForWrite): Promise<void> {
	const apply = (contents: string) => {
		const ordered = [...edits].sort((a, b) => b.start - a.start);
		let boundary = contents.length;
		for (const edit of ordered) {
			if (edit.start < 0 || edit.end < edit.start || edit.end > boundary || contents.slice(edit.start, edit.end) !== edit.expected) {
				throw new Error("Task changed in the source file. Reopen the editor and try again; your draft has been kept.");
			}
			boundary = edit.start;
		}
		const eol = contents.match(/\r\n|\n|\r/)?.[0] ?? "\n";
		let next = contents;
		for (const edit of ordered) {
			const replacement = edit.replacement === edit.expected ? edit.expected : edit.replacement.replace(/\r\n|\n|\r/g, eol);
			next = next.slice(0, edit.start) + replacement + next.slice(edit.end);
		}
		return next === contents ? contents : prepare ? prepare(file, next) : next;
	};
	// Skip a no-op before entering process (which can emit a modify event even for equal text).
	const current = await vault.read(file);
	if (apply(current) === current) return;
	if (vault.process) await vault.process(file, apply);
	else await vault.modify(file, apply(await vault.read(file)));
}

export type PrepareFileContentsForWrite = (
	fileHandle: TFile,
	nextContents: string,
) => string;

const rowFormats = new WeakMap<string[], { eol: string; bom: string }>();

export function serializeFileRows(rows: string[]): string {
	const format = rowFormats.get(rows);
	return (format?.bom ?? "") + rows.join(format?.eol ?? "\n");
}

export async function readFileRows(
	vault: Vault,
	fileHandle: TFile,
): Promise<string[]> {
	const contents = await vault.read(fileHandle);
	const bom = contents.startsWith("\uFEFF") ? "\uFEFF" : "";
	const rows = contents.slice(bom.length).split(/\r\n|\n|\r/);
	rowFormats.set(rows, { eol: contents.match(/\r\n|\n|\r/)?.[0] ?? "\n", bom });
	return rows;
}

export async function writeFileRows(
	vault: Vault,
	fileHandle: TFile,
	rows: string[],
	prepareFileContentsForWrite?: PrepareFileContentsForWrite,
): Promise<void> {
	const nextContents = serializeFileRows(rows);
	await vault.modify(
		fileHandle,
		prepareFileContentsForWrite
			? prepareFileContentsForWrite(fileHandle, nextContents)
			: nextContents,
	);
}

export type RowEdit = {
	rowIndex: number;
	transform: (row: string) => string;
};

/**
 * Applies several single-row transforms to a file with one read and at most
 * one write (skipped when no row changes). All row indexes refer to the same
 * revision of the file; that stays valid because edits replace lines in place
 * and never add or remove rows.
 */
export async function transformSourceRows(
	vault: Vault,
	fileHandle: TFile,
	edits: RowEdit[],
	prepareFileContentsForWrite?: PrepareFileContentsForWrite,
): Promise<boolean> {
	const rows = await readFileRows(vault, fileHandle);

	let changed = false;
	for (const { rowIndex, transform } of edits) {
		const row = rows[rowIndex];
		if (row == null) {
			continue;
		}
		const nextRow = transform(row);
		if (nextRow !== row) {
			rows[rowIndex] = nextRow;
			changed = true;
		}
	}

	if (changed) {
		await writeFileRows(vault, fileHandle, rows, prepareFileContentsForWrite);
	}
	return changed;
}

export async function transformSourceRow(
	vault: Vault,
	fileHandle: TFile,
	rowIndex: number,
	transform: (row: string) => string,
	prepareFileContentsForWrite?: PrepareFileContentsForWrite,
): Promise<boolean> {
	return transformSourceRows(
		vault,
		fileHandle,
		[{ rowIndex, transform }],
		prepareFileContentsForWrite,
	);
}

export async function updateRow(
	vault: Vault,
	fileHandle: TFile,
	row: number | undefined,
	newText: string,
	prepareFileContentsForWrite?: PrepareFileContentsForWrite,
): Promise<boolean> {
	const rows = await readFileRows(vault, fileHandle);

	const rowIndex = row ?? rows.length;
	if (rows.length < rowIndex) {
		return false;
	}

	if (newText === "") {
		rows.splice(rowIndex, 1);
	} else {
		rows[rowIndex] = newText;
	}
	await writeFileRows(vault, fileHandle, rows, prepareFileContentsForWrite);
	return true;
}

export async function deleteRows(
	vault: Vault,
	fileHandle: TFile,
	rowIndexes: number[],
	prepareFileContentsForWrite?: PrepareFileContentsForWrite,
): Promise<void> {
	const rows = await readFileRows(vault, fileHandle);
	for (const rowIndex of [...rowIndexes].sort((a, b) => b - a)) {
		if (rowIndex < rows.length) {
			rows.splice(rowIndex, 1);
		}
	}
	await writeFileRows(vault, fileHandle, rows, prepareFileContentsForWrite);
}

export async function deleteRowBlocks(
	vault: Vault,
	fileHandle: TFile,
	blocks: Array<{ rowIndex: number; lineCount: number }>,
	prepareFileContentsForWrite?: PrepareFileContentsForWrite,
): Promise<void> {
	const rows = await readFileRows(vault, fileHandle);
	for (const block of [...blocks].sort((a, b) => b.rowIndex - a.rowIndex)) {
		if (block.rowIndex < rows.length && block.lineCount > 0) {
			rows.splice(block.rowIndex, block.lineCount);
		}
	}
	await writeFileRows(vault, fileHandle, rows, prepareFileContentsForWrite);
}
