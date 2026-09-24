# Development Guide

## Tech Stack
- **Language**: TypeScript (strict mode)
- **UI Framework**: Svelte 5 (compiled in Svelte 4 component-API compatibility mode)
- **Build Tool**: ESBuild
- **Testing**: Vitest
- **Plugin Framework**: Obsidian API
- **Package Manager**: npm

## Build & Development Commands

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

**Lint**
```bash
npm run lint
```
Runs ESLint across the project. Add `-- --fix` to apply safe automatic fixes.

**Version Bump**
```bash
npm run version
```
Automated script that updates version in manifest.json and versions.json, then stages the files for commit.

## Testing
Run tests before every commit. Only commit if tests pass. Never disable tests
to get them to pass. Only modifiy tests to get them to pass if you are SURE
the failure is expected due to the PR. Otherwise, fix the non-test code or
check with the human operator.

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
