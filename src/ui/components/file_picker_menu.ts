import { Menu, TFile } from "obsidian";

/**
 * State of the configured default task file shown at the top of the picker:
 * resolved, or a disabled explanation line when it is missing / out of scope.
 */
export type DefaultFileEntry = { file: TFile } | { error: string };

/**
 * Shows a cascading folder menu for choosing a markdown file. Files are
 * presented as a folder tree; submenus navigate down, the first item
 * navigates back up.
 */
export function showFilePickerMenu({
	files,
	position,
	defaultFileEntry,
	onFileSelected,
}: {
	files: TFile[];
	position: { x: number; y: number };
	defaultFileEntry: DefaultFileEntry | null;
	onFileSelected: (file: TFile) => void;
}): void {
	interface Folder {
		[label: string]: Folder | TFile;
	}
	const folder: Folder = {};

	for (const file of files) {
		const segments = file.path.split("/");

		let currFolder = folder;
		for (const [i, segment] of segments.entries()) {
			if (i === segments.length - 1) {
				currFolder[segment] = file;
			} else {
				const nextFolder = currFolder[segment] || {};
				if (nextFolder instanceof TFile) {
					continue;
				}
				currFolder[segment] = nextFolder;
				currFolder = nextFolder;
			}
		}
	}

	function createMenu(folder: Folder, parentMenu: Menu | undefined) {
		const menu = new Menu();
		menu.addItem((i) => {
			i.setTitle(parentMenu ? `← back` : "Choose a file")
				.setDisabled(!parentMenu)
				.onClick(() => {
					parentMenu?.showAtPosition(position);
				});
		});

		// Show default file as first item in root menu
		if (!parentMenu && defaultFileEntry) {
			if ("file" in defaultFileEntry) {
				const df = defaultFileEntry.file;
				menu.addItem((i) => {
					i.setTitle(`★ ${df.path}`).onClick(() => {
						onFileSelected(df);
					});
				});
			} else {
				menu.addItem((i) => {
					i.setTitle(defaultFileEntry.error).setDisabled(true);
				});
			}
			menu.addSeparator();
		}

		for (const [label, folderItem] of Object.entries(folder)) {
			menu.addItem((i) => {
				i.setTitle(
					folderItem instanceof TFile ? label : label + " →"
				).onClick(() => {
					if (folderItem instanceof TFile) {
						onFileSelected(folderItem);
					} else {
						createMenu(folderItem, menu);
					}
				});
			});
		}

		menu.showAtPosition(position);
	}

	createMenu(folder, undefined);
}
