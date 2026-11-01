# Development Guide

## Tech Stack
- **Language**: TypeScript (strict mode)
- **UI Framework**: Svelte 5 (compiled in Svelte 4 component-API compatibility mode)
- **Build Tool**: ESBuild
- **Testing**: Vitest
- **Plugin Framework**: Obsidian API
- **Package Manager**: npm

## Build & Development Commands

Use Node.js 22 (22.13 or newer) and `npm ci` to install the locked dependency tree.
The release workflow uses Node.js 22 and the same lockfile.

**Development**
```bash
npm run dev
```
Starts ESBuild in watch mode for live development. Built files go to root directory.

**Build (Production)**
```bash
npm run build
```
Runs TypeScript type checking (`tsc -noEmit -skipLibCheck`), then Svelte component type checking (`npm run check:svelte`, i.e. `svelte-check` gated on errors), then builds the optimized bundle with ESBuild. Always run this before releasing to catch type errors — `tsc` alone does not check `.svelte` files.

**Test**
```bash
npm test
```
Runs the Vitest test suite. Tests are located in `src/` alongside source files.
Svelte interaction tests use the Vite Svelte plugin and opt into `happy-dom`
with a per-file environment comment. They mount the real components to check
focus, draft state, and asynchronous saves. Geometry-dependent
tests supply explicit element bounds; they do not replace device testing of
Android keyboards or Obsidian theme rendering.

**Lint**
```bash
npm run lint
```
Runs ESLint across the project. Add `-- --fix` to apply safe automatic fixes.

**Community Lint**
```bash
npm run communitylint
```
Approximates the Obsidian community directory scanner, which uses its own settings instead of this repo's config. It runs the stock `eslint-plugin-obsidianmd` rules (see `eslint.scanner.mjs`), skipping only `src/**/tests/**` and build output, then runs Stylelint with `stylelint-config-obsidianmd` on `styles.css`. It reports issues `npm run lint` does not.

**Version Bump**
```bash
npm run version
```
Automated script that updates version in manifest.json and versions.json, then stages the files for commit.

## Testing
Run tests before every commit. Only commit if tests pass. Never disable tests
to get them to pass or weaken assertions to hide an unexpected failure.

Choose tests by the failure they prevent, not by test counts or coverage
percentages. Before adding a case, inspect the existing tests and name the
plausible regression it would catch. Extend an existing suite when it owns
the behavior rather than creating a separate file for each feature.
Combine small suites for the same module when they share an environment and
compatible mocks. Keep pure Node tests separate from DOM tests, and retain
enough file-level parallelism rather than collecting unrelated tests into a
single large suite.

- Test decision rules and edge cases in the pure function or model that owns
  them. Callers need representative wiring checks, not another copy of the
  helper's case matrix. Use a table only when its rows exercise distinct rules.
- Mount a component for interaction, focus, asynchronous state, or lifecycle
  behavior. Do not mount one just to assert static copy, icon names, CSS
  classes, or that a native button can receive focus. Check appearance in the
  test vault when layout or theme rendering is the actual concern.
- Preserve checks for source-file integrity, failed writes and draft recovery,
  race conditions, accessibility, and settings migrations. When pruning an
  overlapping test, identify which retained test protects the same failure.
- Await a controlled operation and Svelte's `tick()` when available. Use fake
  timers for timer-driven behavior; avoid real sleeps and polling for work
  whose completion the test already controls. Keep fixtures only large enough
  to cross the boundary being tested, such as pagination or cursor eviction.

During development, run the affected suite, for example:

```bash
npm test -- src/ui/tasks/tests/task_insertion.tests.ts
```

For repeated edits, keep Vitest running so it can reuse transformed modules
and rerun tests affected by each save:

```bash
npm run test:watch
# Or watch one suite and its source dependencies:
npm run test:watch -- src/ui/tasks/tests/task_insertion.tests.ts
```

The test runner uses isolated thread workers and Vite's Svelte preprocessor
for TypeScript and styles. The production build retains its ESBuild pipeline.

Run `npm run build` and the full `npm test` before handing off changes. When
optimizing the runner, compare repeated full runs on the same machine and
runtime; do not trade away file isolation or omit tests for a faster result.

## Styling Across Obsidian Environments

Obsidian themes, CSS snippets, other plugins, and desktop/mobile versions can
change the rules applied to ordinary buttons, inputs, labels, and popovers. A
control that looks correct in the test vault may still break in a different
vault. When adding or changing UI styles:

- Scope selectors to the plugin view or modal root (for example,
  `.task-list-kanban-view`) and give controls their own classes. Avoid relying
  on unqualified element selectors or on a theme's default button dimensions.
- Set the layout properties a control needs explicitly: its positioning
  context, display, sizing, box sizing, margin, padding, and overflow. Anchor
  menus to a positioned parent and check their stacking order and viewport
  constraints.
- Use Obsidian CSS variables for colors, borders, spacing, and typography so
  the UI follows the active theme. Preserve keyboard focus and disabled states.
- Svelte 5 scopes component CSS with low-specificity `:where()` selectors. If
  host or theme rules override a control, put that control's styles in
  `styles.css` under the plugin root instead of duplicating them in the Svelte
  component. Use `!important` only where needed to beat host rules, including
  interaction states and mobile positioning. The source-file menu is an
  example; the filter bar also has view scoped overrides.
- Manually inspect the affected control in the test vault and at least one
  other theme or vault configuration, in both light and dark modes when colors
  are involved. Check open menus, hover, focus, disabled state, narrow widths,
  and long labels. If a user reports a mismatch, compare computed styles and
  enabled snippets/themes before adjusting selectors.

## Dependency audits

Run `npm audit` after dependency updates. Use `npm audit --omit=dev` to check
production dependencies separately from development tooling.
