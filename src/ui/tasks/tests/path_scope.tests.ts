import { describe, expect, it } from "vitest";
import {
	createPathScope,
	normalizeVaultRelativePath,
	pathScopeMatchesLegacy,
	resolveDateTemplate,
	resolvePathScopePaths,
	setPathScopeActive,
} from "../path_scope";

describe("path scope", () => {
	it("accepts vault-relative paths and rejects traversal", () => {
		expect(normalizeVaultRelativePath(" /daily/today.md/ ")).toBe("daily/today.md");
		expect(normalizeVaultRelativePath("../daily/today.md")).toBeNull();
		expect(normalizeVaultRelativePath("daily/./today.md")).toBeNull();
		expect(createPathScope(["daily/../today.md"])).toBeNull();
	});

	it("resolves local date templates without persisting the resolved path", () => {
		expect(resolveDateTemplate("daily/{{YYYY-MM-DD}}.md", new Date(2026, 8, 19))).toBe(
			"daily/2026-09-19.md",
		);
		expect(
			resolveDateTemplate("journal/{{YYYY}}/{{YYYY-MM-DD}}.md", new Date(2026, 8, 19)),
		).toBe("journal/2026/2026-09-19.md");
		expect(resolveDateTemplate("daily/{{}}.md", new Date())).toBeNull();
		expect(resolveDateTemplate("daily/{{   }}.md", new Date())).toBeNull();
		expect(resolveDateTemplate("daily/{{YYYY-MM-DD.md", new Date())).toBeNull();
		expect(resolveDateTemplate("daily/YYYY-MM-DD}}.md", new Date())).toBeNull();
		expect(createPathScope(["daily/{{}}.md"])).toBeNull();
		expect(createPathScope(["daily/{{unclosed.md"])).toBeNull();
	});

	it("resolves across date rollovers without modifying the stored template", () => {
		const scope = createPathScope(["daily/{{YYYY-MM-DD}}.md"])!;
		const day1 = resolvePathScopePaths(scope, new Date(2026, 8, 19));
		const day2 = resolvePathScopePaths(scope, new Date(2026, 8, 20));

		expect(day1).toEqual(["daily/2026-09-19.md"]);
		expect(day2).toEqual(["daily/2026-09-20.md"]);
		expect(scope.paths).toEqual(["daily/{{YYYY-MM-DD}}.md"]);
	});

	it("uses a compatibility projection only while it matches legacy scope", () => {
		const scope = createPathScope(["projects/alpha", "daily/{{YYYY-MM-DD}}.md"]);
		expect(scope).toBeDefined();
		expect(pathScopeMatchesLegacy(scope!, "selectedFolders", ["daily/{{YYYY-MM-DD}}.md", "projects/alpha"])).toBe(true);
		expect(pathScopeMatchesLegacy(scope!, "everywhere", ["daily/{{YYYY-MM-DD}}.md", "projects/alpha"])).toBe(false);
	});

	it("resolves an exact file and a folder source", () => {
		const scope = createPathScope(["daily/{{YYYY-MM-DD}}.md", "projects/alpha"])!;
		expect(resolvePathScopePaths(scope, new Date(2026, 8, 19))).toEqual([
			"daily/2026-09-19.md",
			"projects/alpha",
		]);
	});

	it("de-duplicates overlapping paths without collapsing distinct templates", () => {
		const scope = createPathScope([
			"projects",
			"projects",
			"daily/{{YYYY-MM-DD}}.md",
			"daily/{{YYYY-MM-DD}}.md",
			"daily/{{YYYY-DD-MM}}.md",
		])!;
		expect(scope.paths).toEqual([
			"daily/{{YYYY-DD-MM}}.md",
			"daily/{{YYYY-MM-DD}}.md",
			"projects",
		]);
	});

	it("keeps an empty selected-path set invalid until the board folder is selected", () => {
		expect(resolvePathScopePaths(createPathScope([])!, new Date(2026, 8, 19))).toEqual([]);
		expect(createPathScope([], true)?.includeBoardFolder).toBe(true);
	});

	it("retains paths while inactive and projects the selected legacy scope", () => {
		const scope = createPathScope(["daily/today.md"])!;
		const inactive = setPathScopeActive(scope, false, "folder", [])!;
		expect(inactive.active).toBe(false);
		expect(inactive.paths).toEqual(["daily/today.md"]);
		expect(pathScopeMatchesLegacy(inactive, "folder", [])).toBe(true);
	});
});
