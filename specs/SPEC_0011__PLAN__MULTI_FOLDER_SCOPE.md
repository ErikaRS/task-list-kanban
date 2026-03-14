# Multi-Folder Scope Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Selected folders" scope option so users can pick multiple vault folders for a kanban board to pull tasks from.

**Architecture:** The existing `ScopeOption` enum gains a third value. A new `scopeFolders: string[]` setting stores the folder list. `shouldIncludeFilePath` changes from accepting `string | null` to `string[] | null`, and all consumers are updated to pass arrays. The settings modal gains a folder list UI that shows/hides based on the scope dropdown.

**Tech Stack:** TypeScript, Svelte stores, Zod schema validation, Obsidian Setting API, Vitest

**Spec:** `specs/SPEC_0011__IN_PROGRESS__MULTI_FOLDER_SCOPE.md`

---

## Chunk 1: Data Model, Filter Logic, and View Plumbing

### Task 1: Add `SelectedFolders` enum value and `scopeFolders` to settings schema

**Files:**
- Modify: `src/ui/settings/settings_store.ts:11-14` (ScopeOption enum)
- Modify: `src/ui/settings/settings_store.ts:61-88` (Zod schema)
- Modify: `src/ui/settings/settings_store.ts:92-110` (defaultSettings)

- [ ] **Step 1: Add the new enum value**

In `src/ui/settings/settings_store.ts`, add `SelectedFolders` to the `ScopeOption` enum:

```typescript
export enum ScopeOption {
	Folder = "folder",
	Everywhere = "everywhere",
	SelectedFolders = "selectedFolders",
}
```

- [ ] **Step 2: Add `scopeFolders` to the Zod schema**

In the `settingsObject` definition, add after the `defaultTaskFile` line (line 87):

```typescript
	scopeFolders: z.array(z.string()).default([]).optional(),
```

- [ ] **Step 3: Add `scopeFolders` to `defaultSettings`**

Add after the `defaultTaskFile` entry (line 109):

```typescript
	scopeFolders: [],
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: Success (no consumers of the new field yet)

- [ ] **Step 5: Commit**

```bash
git add src/ui/settings/settings_store.ts
git commit -m "feat: add SelectedFolders scope option and scopeFolders setting"
```

### Task 2: Rewrite `shouldIncludeFilePath` to accept `string[] | null`

**Files:**
- Modify: `src/ui/tasks/scope.ts` (full rewrite)
- Modify: `src/ui/tasks/tests/scope.tests.ts` (update existing + add new tests)

- [ ] **Step 1: Write failing tests for the new array-based behavior**

Replace the entire contents of `src/ui/tasks/tests/scope.tests.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import { shouldIncludeFilePath } from "../scope";

describe("shouldIncludeFilePath", () => {
	// --- null filter (include everything) ---
	it("includes all files when filter is null", () => {
		expect(shouldIncludeFilePath("work/todo.md", null)).toBe(true);
	});

	// --- single-element array (same as old "This folder" behavior) ---
	it("includes files directly in the scoped folder", () => {
		expect(shouldIncludeFilePath("projects/kanban.md", ["projects"])).toBe(
			true
		);
	});

	it("includes files in subfolders of the scoped folder", () => {
		expect(
			shouldIncludeFilePath("projects/roadmap/plan.md", ["projects"])
		).toBe(true);
	});

	it("excludes files outside the scoped folder", () => {
		expect(shouldIncludeFilePath("notes/today.md", ["projects"])).toBe(
			false
		);
	});

	it("does not match sibling folder names by prefix", () => {
		expect(
			shouldIncludeFilePath("project-archive/todo.md", ["project"])
		).toBe(false);
	});

	it("supports filters with a leading slash", () => {
		expect(
			shouldIncludeFilePath("projects/kanban.md", ["/projects"])
		).toBe(true);
	});

	// --- multi-element array (new "Selected folders" behavior) ---
	it("includes files matching any folder in a multi-folder filter", () => {
		expect(
			shouldIncludeFilePath("work/todo.md", ["projects", "work"])
		).toBe(true);
	});

	it("includes files in subfolders of any folder in a multi-folder filter", () => {
		expect(
			shouldIncludeFilePath("work/active/plan.md", ["projects", "work"])
		).toBe(true);
	});

	it("excludes files not matching any folder in a multi-folder filter", () => {
		expect(
			shouldIncludeFilePath("notes/today.md", ["projects", "work"])
		).toBe(false);
	});

	it("handles trailing slashes in folder paths", () => {
		expect(
			shouldIncludeFilePath("work/todo.md", ["work/"])
		).toBe(true);
	});

	it("handles overlapping folders without issues", () => {
		expect(
			shouldIncludeFilePath("projects/active/todo.md", [
				"projects",
				"projects/active",
			])
		).toBe(true);
	});

	// --- empty array (include nothing) ---
	it("excludes all files when filter is an empty array", () => {
		expect(shouldIncludeFilePath("work/todo.md", [])).toBe(false);
	});

	it("excludes root files when filter is an empty array", () => {
		expect(shouldIncludeFilePath("todo.md", [])).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `shouldIncludeFilePath` currently expects `string | null`, not `string[] | null`

- [ ] **Step 3: Rewrite `shouldIncludeFilePath`**

Replace the entire contents of `src/ui/tasks/scope.ts` with:

```typescript
export function shouldIncludeFilePath(
	filePath: string,
	filenameFilter: string[] | null
): boolean {
	if (filenameFilter === null) {
		return true;
	}

	return filenameFilter.some((folder) => {
		const filter = folder.replace(/^\//, "").replace(/\/$/, "");
		return filePath === filter || filePath.startsWith(`${filter}/`);
	});
}
```

Key points:
- Uses `=== null` (not `!filter`) so empty array `[]` returns `false` via `[].some()` being `false`
- Each folder in the array gets leading-slash and trailing-slash stripped, preventing user input errors
- `Array.some()` short-circuits on first match

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/tasks/scope.ts src/ui/tasks/tests/scope.tests.ts
git commit -m "feat: update shouldIncludeFilePath to accept string[] | null for multi-folder filtering"
```

### Task 3: Update view plumbing to pass `string[] | null`

**Files:**
- Modify: `src/ui/text_view.ts:32` (filenameFilter type)
- Modify: `src/ui/text_view.ts:45-57` (settings subscriber)
- Modify: `src/ui/tasks/store.ts:24` (getFilenameFilter type)
- Modify: `src/ui/tasks/actions.ts:38` (getFilenameFilter type)

- [ ] **Step 1: Update `text_view.ts` — change filter type and add `SelectedFolders` case**

In `src/ui/text_view.ts`, change line 32 from:

```typescript
	private filenameFilter: string | null = null;
```

to:

```typescript
	private filenameFilter: string[] | null = null;
```

Then update the settings subscriber (lines 46-56) from:

```typescript
		this.destroySettingsStore = this.settingsStore.subscribe((settings) => {
			switch (settings.scope) {
				case ScopeOption.Everywhere:
					this.filenameFilter = null;
					break;
				case ScopeOption.Folder:
					this.filenameFilter = this.file?.parent?.path ?? null;
					break;
				default:
					this.filenameFilter = null;
					break;
			}
		});
```

to:

```typescript
		this.destroySettingsStore = this.settingsStore.subscribe((settings) => {
			switch (settings.scope) {
				case ScopeOption.Everywhere:
					this.filenameFilter = null;
					break;
				case ScopeOption.Folder: {
					const folderPath = this.file?.parent?.path;
					this.filenameFilter = folderPath ? [folderPath] : null;
					break;
				}
				case ScopeOption.SelectedFolders:
					this.filenameFilter = settings.scopeFolders ?? [];
					break;
				default:
					this.filenameFilter = null;
					break;
			}
		});
```

- [ ] **Step 2: Update `store.ts` — change `getFilenameFilter` type**

In `src/ui/tasks/store.ts`, change line 24 from:

```typescript
	getFilenameFilter: () => string | null,
```

to:

```typescript
	getFilenameFilter: () => string[] | null,
```

- [ ] **Step 3: Update `actions.ts` — change `getFilenameFilter` type**

In `src/ui/tasks/actions.ts`, change line 38 from:

```typescript
	getFilenameFilter: () => string | null;
```

to:

```typescript
	getFilenameFilter: () => string[] | null;
```

- [ ] **Step 4: Build and test**

Run: `npm run build && npm test`
Expected: Both pass. The type change propagates cleanly since `shouldIncludeFilePath` now expects `string[] | null` and all callers pass the result of `getFilenameFilter()`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/text_view.ts src/ui/tasks/store.ts src/ui/tasks/actions.ts
git commit -m "feat: plumb string[] | null filter through view, store, and actions"
```

---

## Chunk 2: Settings UI

### Task 4: Add "Selected folders" to the scope dropdown and build the folder list UI

**Files:**
- Modify: `src/ui/settings/settings.ts:125-139` (scope dropdown)
- Modify: `src/ui/settings/settings.ts:100-123` (validateDefaultTaskFile)

This is the largest task. It modifies the settings modal to:
1. Add the third dropdown option
2. Show/hide a folder list container
3. Handle add/remove of folders
4. Validate folder existence
5. Update `validateDefaultTaskFile` for the new scope type

- [ ] **Step 1: Update `validateDefaultTaskFile` to handle the new scope type**

In `src/ui/settings/settings.ts`, replace the `scopeFilter` computation (lines 112-115):

```typescript
		const scopeFilter =
			this.settings.scope === ScopeOption.Folder
				? this.boardFolderPath
				: null;
		if (!shouldIncludeFilePath(value, scopeFilter)) {
```

with:

```typescript
		let scopeFilter: string[] | null;
		switch (this.settings.scope) {
			case ScopeOption.Folder:
				scopeFilter = this.boardFolderPath
					? [this.boardFolderPath]
					: null;
				break;
			case ScopeOption.SelectedFolders:
				scopeFilter = this.settings.scopeFolders ?? [];
				break;
			default:
				scopeFilter = null;
				break;
		}
		if (!shouldIncludeFilePath(value, scopeFilter)) {
```

- [ ] **Step 2: Build and test to confirm the validation refactor works**

Run: `npm run build && npm test`
Expected: Both pass. No UI change yet, just the validation logic update.

- [ ] **Step 3: Commit the validation update**

```bash
git add src/ui/settings/settings.ts
git commit -m "refactor: update validateDefaultTaskFile for string[] | null scope filter"
```

- [ ] **Step 4: Add the "Selected folders" dropdown option and folder list UI**

In `src/ui/settings/settings.ts`, replace the scope dropdown Setting (lines 125-139) with the following. This adds the third option and a folder list container that shows/hides based on the selected scope.

Note: `folderListContainer` and `folderListEl` are declared with `let` before the functions that reference them, then assigned after the dropdown, to avoid temporal dead zone errors.

```typescript
		// --- Folder scope dropdown + selected folders UI ---
		const scopeContainer = this.contentEl.createDiv();

		let folderListContainer: HTMLDivElement;
		let folderListEl: HTMLDivElement;

		const renderFolderList = () => {
			folderListEl.empty();
			const folders = this.settings.scopeFolders ?? [];
			for (const folder of folders) {
				const row = folderListEl.createDiv();
				row.style.display = "flex";
				row.style.alignItems = "center";
				row.style.justifyContent = "space-between";
				row.style.padding = "4px 8px";
				row.style.borderBottom =
					"1px solid var(--background-modifier-border)";

				const label = row.createSpan();
				label.setText(folder);
				label.style.flexGrow = "1";

				// Check if folder exists in vault
				const abstractFolder =
					this.app.vault.getAbstractFileByPath(folder);
				if (!abstractFolder) {
					const warning = row.createSpan();
					warning.setText(" (not found)");
					warning.style.color = "var(--text-error)";
					warning.style.fontStyle = "italic";
					warning.style.fontSize = "var(--font-smallest)";
				}

				const removeBtn = row.createEl("button");
				removeBtn.setText("✕");
				removeBtn.style.marginLeft = "8px";
				removeBtn.style.cursor = "pointer";
				removeBtn.style.background = "none";
				removeBtn.style.border = "none";
				removeBtn.style.color = "var(--text-muted)";
				removeBtn.style.padding = "2px 6px";
				removeBtn.addEventListener("click", () => {
					this.settings.scopeFolders = (
						this.settings.scopeFolders ?? []
					).filter((f) => f !== folder);
					renderFolderList();
					validateDefaultTaskFile();
				});
			}
		};

		const updateFolderListVisibility = () => {
			folderListContainer.style.display =
				this.settings.scope === ScopeOption.SelectedFolders
					? "block"
					: "none";
		};

		new Setting(scopeContainer)
			.setName("Folder scope")
			.setDesc("Where should we try to find tasks for this Kanban?")
			.addDropdown((dropdown) => {
				dropdown.addOption(ScopeOption.Folder, "This folder");
				dropdown.addOption(ScopeOption.Everywhere, "Every folder");
				dropdown.addOption(
					ScopeOption.SelectedFolders,
					"Selected folders"
				);
				dropdown.setValue(this.settings.scope);
				dropdown.onChange((value) => {
					const validatedValue = ScopeOptionSchema.safeParse(value);
					this.settings.scope = validatedValue.success
						? validatedValue.data
						: defaultSettings.scope;
					updateFolderListVisibility();
					validateDefaultTaskFile();
				});
			});

		// Selected folders list UI
		folderListContainer = scopeContainer.createDiv();
		folderListContainer.style.marginLeft = "16px";
		folderListContainer.style.marginBottom = "12px";

		const addFolderRow = folderListContainer.createDiv();
		addFolderRow.style.display = "flex";
		addFolderRow.style.gap = "8px";
		addFolderRow.style.marginBottom = "8px";

		const folderInput = addFolderRow.createEl("input", {
			type: "text",
			placeholder: "e.g., projects/active",
		});
		folderInput.style.flexGrow = "1";
		folderInput.addClass("setting-input");

		const addFolder = () => {
			const raw = folderInput.value.trim().replace(/^\//, "").replace(/\/$/, "");
			if (!raw) return;
			const folders = this.settings.scopeFolders ?? [];
			if (folders.includes(raw)) return;
			this.settings.scopeFolders = [...folders, raw];
			folderInput.value = "";
			renderFolderList();
			validateDefaultTaskFile();
		};

		const addBtn = addFolderRow.createEl("button", { text: "Add" });
		addBtn.addEventListener("click", addFolder);

		folderInput.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addFolder();
			}
		});

		folderListEl = folderListContainer.createDiv();
		renderFolderList();
		updateFolderListVisibility();
```

- [ ] **Step 5: Build and test**

Run: `npm run build && npm test`
Expected: Both pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/settings/settings.ts
git commit -m "feat: add Selected folders UI to settings modal with add/remove and validation"
```

### Task 5: Final verification

- [ ] **Step 1: Run full build and test suite**

Run: `npm run build && npm test`
Expected: Both pass with zero errors.

- [ ] **Step 2: Verify no type errors remain**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors.

---

## File Change Summary

| File | Task | Change |
|------|------|--------|
| `src/ui/settings/settings_store.ts` | 1 | Add `SelectedFolders` enum, `scopeFolders` to schema + defaults |
| `src/ui/tasks/scope.ts` | 2 | Rewrite to accept `string[] \| null`, use `=== null` check |
| `src/ui/tasks/tests/scope.tests.ts` | 2 | Replace with comprehensive array-based tests |
| `src/ui/text_view.ts` | 3 | Change `filenameFilter` to `string[] \| null`, add `SelectedFolders` case |
| `src/ui/tasks/store.ts` | 3 | Update `getFilenameFilter` type to `() => string[] \| null` |
| `src/ui/tasks/actions.ts` | 3 | Update `getFilenameFilter` type to `() => string[] \| null` |
| `src/ui/settings/settings.ts` | 4 | Add third dropdown option, folder list UI, update `validateDefaultTaskFile` |
