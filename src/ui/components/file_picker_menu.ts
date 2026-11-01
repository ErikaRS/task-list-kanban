import { Menu, TFile } from "obsidian";

/**
 * A row pinned above the folder tree: the default task file, Today's daily
 * note, or a disabled line explaining why one is unavailable.
 */
export interface PinnedPickerEntry {
	title: string;
	/** Absent for disabled explanation rows. */
	onSelect?: () => void;
}

/**
 * Shows a cascading folder menu for choosing a markdown file. Files are
 * presented as a folder tree; submenus navigate down, the first item
 * navigates back up.
 */
export function showFilePickerMenu({
	files,
	position,
	pinnedEntries,
	onFileSelected,
}: {
	files: TFile[];
	position: { x: number; y: number };
	pinnedEntries: PinnedPickerEntry[];
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

		if (!parentMenu && pinnedEntries.length > 0) {
			for (const entry of pinnedEntries) {
				menu.addItem((i) => {
					i.setTitle(entry.title);
					if (entry.onSelect) {
						i.onClick(entry.onSelect);
					} else {
						i.setDisabled(true);
					}
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
