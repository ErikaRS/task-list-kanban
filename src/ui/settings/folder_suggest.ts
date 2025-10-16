import { App, FuzzySuggestModal, TFolder } from "obsidian";

export class FolderSuggest extends FuzzySuggestModal<TFolder> {
        private readonly onChooseFolder: (folder: TFolder) => void;
        private readonly folders: TFolder[];

        constructor(app: App, onChoose: (folder: TFolder) => void) {
                super(app);
                this.onChooseFolder = onChoose;
                this.folders = this.getAllFolders();
                this.setPlaceholder("Type to search folders…");
        }

        getItems(): TFolder[] {
                return this.folders;
        }

        getItemText(item: TFolder): string {
                return item.path;
        }

        onChooseItem(item: TFolder): void {
                this.onChooseFolder(item);
        }

        private getAllFolders(): TFolder[] {
                const files = this.app.vault.getAllLoadedFiles();
                const seen = new Set<string>();
                const folders: TFolder[] = [];

                for (const file of files) {
                        if (file instanceof TFolder && !seen.has(file.path)) {
                                seen.add(file.path);
                                folders.push(file);
                        }
                }

                folders.sort((a, b) => a.path.localeCompare(b.path));
                return folders;
        }
}
