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

export async function transformSourceRow(
	vault: Vault,
	fileHandle: TFile,
	rowIndex: number,
	transform: (row: string) => string,
	prepareFileContentsForWrite?: PrepareFileContentsForWrite,
): Promise<boolean> {
	const rows = await readFileRows(vault, fileHandle);
	const row = rows[rowIndex];
	if (row == null) {
		return false;
	}

	const nextRow = transform(row);
	if (nextRow === row) {
		return false;
	}

	rows[rowIndex] = nextRow;
	await writeFileRows(vault, fileHandle, rows, prepareFileContentsForWrite);
	return true;
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
