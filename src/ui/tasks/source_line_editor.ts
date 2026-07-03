import type { TFile, Vault } from "obsidian";

export type PrepareFileContentsForWrite = (
	fileHandle: TFile,
	nextContents: string,
) => string;

export async function readFileRows(
	vault: Vault,
	fileHandle: TFile,
): Promise<string[]> {
	return (await vault.read(fileHandle)).split("\n");
}

export async function writeFileRows(
	vault: Vault,
	fileHandle: TFile,
	rows: string[],
	prepareFileContentsForWrite?: PrepareFileContentsForWrite,
): Promise<void> {
	const nextContents = rows.join("\n");
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
