import { AbstractInputSuggest, App, TFolder, TAbstractFile, TFile } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, private inputEl: HTMLInputElement, private onSelectCallback?: () => void) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFolder[] {
		const folders = this.app.vault.getAllLoadedFiles().filter(
			(f): f is TFolder => f instanceof TFolder
		);
		const lowerQuery = query.toLowerCase();
		return folders.filter((folder) =>
			folder.path.toLowerCase().includes(lowerQuery) && folder.path !== "/"
		);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		this.setValue(folder.path);
		this.inputEl.dispatchEvent(new Event("input"));
		if (this.onSelectCallback) {
			this.onSelectCallback();
		}
		this.close();
	}
}

export class PathSuggest extends AbstractInputSuggest<TAbstractFile> {
	constructor(app: App, private inputEl: HTMLInputElement, private onSelectCallback?: () => void) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TAbstractFile[] {
		const files = this.app.vault.getAllLoadedFiles();
		const lowerQuery = query.toLowerCase();
		return files.filter((file) =>
			file.path.toLowerCase().includes(lowerQuery) && file.path !== "/"
		);
	}

	renderSuggestion(file: TAbstractFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TAbstractFile, evt: MouseEvent | KeyboardEvent): void {
		this.setValue(file.path);
		this.inputEl.dispatchEvent(new Event("input"));
		if (this.onSelectCallback) {
			this.onSelectCallback();
		}
		this.close();
	}
}

export class FileSuggest extends AbstractInputSuggest<TFile> {
	constructor(app: App, private inputEl: HTMLInputElement, private onSelectCallback?: () => void) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFile[] {
		const files = this.app.vault.getFiles();
		const lowerQuery = query.toLowerCase();
		return files.filter((file) =>
			file.path.toLowerCase().includes(lowerQuery)
		);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.setValue(file.path);
		this.inputEl.dispatchEvent(new Event("input"));
		if (this.onSelectCallback) {
			this.onSelectCallback();
		}
		this.close();
	}
}

export class TagSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, private inputEl: HTMLInputElement, private onSelectCallback?: () => void) {
		super(app, inputEl);
	}

	getSuggestions(query: string): string[] {
		const tags = Object.keys((this.app.metadataCache as any).getTags());
		const lowerQuery = query.toLowerCase();
		return tags
			.map(t => t.replace(/^#/, ""))
			.filter(tag => tag.toLowerCase().includes(lowerQuery));
	}

	renderSuggestion(tag: string, el: HTMLElement): void {
		el.setText(tag);
	}

	selectSuggestion(tag: string, evt: MouseEvent | KeyboardEvent): void {
		this.setValue(tag);
		this.inputEl.dispatchEvent(new Event("input"));
		if (this.onSelectCallback) {
			this.onSelectCallback();
		}
		this.close();
	}
}
