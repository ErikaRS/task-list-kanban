# SPEC 0044: Community Scorecard Remediation

Status: IN_PROGRESS

## Feature Request Summary

The Obsidian Community Plugins scorecard reported review warnings for the
released Task List Kanban plugin. Some warnings originate in the manual-test
fixture vault, some are already addressed in unreleased changes, and others
need deliberate code, CSS, and dependency work.

This specification tracks the remaining work so that the public scorecard
reflects the shipped plugin without removing supported behavior or weakening
theme compatibility.

## User Requirements

1. Keep the manual test vault, but place it where the scorecard scanner's
   built-in exclusions recognize it (`test-vault/`).
2. Ensure release artifacts are attested and the repository contains a
   contributor guide; verify both in the next published-release scan.
3. Resolve remaining source-code warnings where doing so preserves behavior
   and improves the implementation.
4. Reduce root stylesheet `!important` usage without regressing the plugin's
   appearance in Obsidian themes.
5. Treat package suggestions and security/disclosure notices as explicit
   review items, rather than making a cosmetic scanner-only change.
6. Keep test-only helpers in scanner-recognized test locations so they do not
   create production-source findings.
7. Run the documented build and test quality gates for every code change.

## High-Level Design

The remediation is separated by ownership and risk:

| Area | Current expected scorecard effect | Approach |
| --- | --- | --- |
| `test-vault/` | Removes fixture-only CSS compatibility and `!important` findings | Keep the canonical directory name and verify after release |
| Release metadata | Clears missing contributor-guide and artifact-attestation findings | Publish the existing workflow and documentation changes, then verify the release |
| TypeScript and Obsidian API usage | Removes small correctness and style findings | Make focused, test-covered migrations |
| `styles.css` | Addresses roughly 275 root stylesheet `!important` findings from the prior scan | Refactor incrementally with visual checks across themes |
| Dependencies and disclosures | Requires a conscious maintenance decision | Evaluate each item for compatibility, security, and user impact |

The public scorecard evaluates a published version, not the working tree.
Consequently, release-related results cannot be confirmed until a new tagged
release is available for the scanner.

## Detailed Behavior

### Scanner Scope

The manual vault remains part of the repository for visual and interaction
testing. Its directory must remain named `test-vault/`, which is one of the
scanner's documented built-in exclusions. Documentation and deployment tooling
must continue to reference that same path. Project configuration must not rely
on a custom scanner ignore rule for this behavior.

### Release Provenance

The release workflow attests `main.js`, `manifest.json`, and `styles.css`.
After the next release, the public scan must be checked to confirm it observes
those attestations and `CONTRIBUTING.md`. Any result that still references the
old release is recorded as pending release propagation, not as a code failure.

### Source Findings

Remaining TypeScript findings are audited individually. Unused imports and
dead exports are removed when no supported consumer needs them. Assertions,
`any`, and error-union findings are replaced with narrower types or guarded
control flow only when that keeps runtime behavior unchanged. Test shims are
moved to an excluded test location when they exist solely to support tests.

The obsolete imperative settings registration and direct heading construction
findings are migrated to the current Obsidian patterns after confirming that
settings search, descriptions, defaults, and callbacks remain identical.

### Stylesheet Findings

The remaining root `styles.css` findings are not removed by a blind global
replacement. Each slice establishes an appropriate selector, cascade layer,
or custom-property boundary before removing `!important`. Every slice receives
a manual visual check in the supported Obsidian themes and states it affects.

### Dependency and Disclosure Review

The scanner's package suggestions for `builtin-modules`, `crypto-js`, and
`js-yaml` are advisory until evaluated against the dependency graph and
supported plugin behavior. Vault enumeration is expected functionality for a
task board that reads notes; it must remain documented and scoped, not removed
solely to change a disclosure label. Malware/disclosure badges are monitored
for false positives or actionable reports.

## Non-Goals

- Removing the manual test vault or the plugin's vault-reading functionality.
- Suppressing findings through unsupported custom scanner ignore configuration.
- Replacing dependencies or restyling the interface without a compatibility
  review.
- Treating an unchanged scan of the prior release as failure of unreleased
  remediation work.

## Implementation Plan

### Phase 1: Publish and Verify Scanner Scope

**Goal:** Confirm that the public scan evaluates the intended repository scope
and release provenance.

1. ☐ Publish a tagged release containing the contributor guide, release
   attestations, and `test-vault/` rename.
2. ☐ Verify the release attestations for `main.js`, `manifest.json`, and
   `styles.css`.
3. ☐ Recheck the Community Plugins scorecard after it indexes the release.
4. ☐ Confirm fixture-only `:has`, partial browser-CSS, and fixture
   `!important` findings no longer appear.

**Deliverable:** A release-linked scorecard verification note distinguishing
resolved findings from any scanner lag or newly discovered source findings.

**Implemented by:** Preparation landed in
[71d8fce](https://github.com/ErikaRS/task-list-kanban/commit/71d8fce) and
[e0a1c1d](https://github.com/ErikaRS/task-list-kanban/commit/e0a1c1d);
published verification pending.

### Phase 2: Resolve Low-Risk Source Findings

**Goal:** Remove unambiguous production-source findings while preserving
runtime and test behavior.

1. ☐ Audit the reported unused `parseSourceTaskLine` and `NoneSchema`
   exports/imports; remove them if no supported consumer needs them.
2. ☐ Confirm whether `parseColumnSpec` is an intentional public barrel export;
   document or restructure it if the scanner continues to flag it.
3. ☐ Replace the remaining error-union, assertion, and `any` findings with
   safe narrow types or guards.
4. ☐ Move test-only Obsidian/moment compatibility shims into a
   scanner-recognized test directory.
5. ☐ Run `npm run build` and `npm test`.

**Deliverable:** A focused source cleanup with tests demonstrating unchanged
behavior.

**Implemented by:** The unsafe `MetadataCache#getTags()` access was replaced
with the public `getAllTags()` helper. The remaining Moment compatibility
adapter is necessary because the published Obsidian declaration models its
runtime-callable export as a namespace. Broader assertion/export cleanup
remains pending.

### Phase 3: Modernize Settings and UI Construction

**Goal:** Address the remaining Obsidian API and direct-heading findings.

1. ☐ Map every setting currently registered imperatively to its declarative
   definition, including defaults, descriptions, visibility, and callbacks.
2. ☑ Migrate the settings registration to the current API.
3. ☑ Replace the direct heading construction with the recommended Obsidian UI
   helper where appropriate.
4. ☐ Manually verify settings search, editing, reset behavior, and rendered
   hierarchy in Obsidian.
5. ☑ Run `npm run build` and `npm test`.

**Deliverable:** Settings behavior that is equivalent to the current UI and
does not trigger the obsolete-API findings.

**Implemented by:** `minAppVersion` and the development API package now target
Obsidian 1.13. The plugin tab uses `getSettingDefinitions()` and a documented
imperative `SettingPage` for the dynamic Svelte editor and saved-view list.
The page itself is searchable; making each dynamic child control independently
searchable is the remaining work in item 1. Build and all 1,022 tests pass.

### Phase 4: Reduce Stylesheet Cascade Overrides

**Goal:** Incrementally remove the remaining root stylesheet `!important`
usage without visual regressions.

1. ☐ Inventory the roughly 275 root `styles.css` instances reported by the
   prior scan, grouping them by component and purpose.
2. ☐ Refactor one component group at a time using scoped selectors, cascade
   order, or CSS custom properties.
3. ☐ Manually verify each group in the supported themes, narrow and wide board
   layouts, and interaction states it changes.
4. ☐ Keep only documented exceptions whose precedence cannot be safely
   expressed otherwise.
5. ☐ Run `npm run build` and `npm test` after every implementation slice.

**Deliverable:** A substantially reduced, justified set of stylesheet priority
overrides with visual verification notes.

**Implemented by:** Pending.

### Phase 5: Evaluate Dependencies and Remaining Disclosures

**Goal:** Make intentional maintenance decisions for advisory scorecard items.

1. ☐ Inspect the direct and transitive use of `builtin-modules`, `crypto-js`,
   and `js-yaml`.
2. ☐ For each package, retain it with rationale, update it, replace it, or
   remove it based on compatibility and security impact.
3. ☐ Review the Vault Enumeration and malware/disclosure entries for a
   concrete mitigation or false-positive report path.
4. ☐ Record the outcome and any accepted residual risk in release notes or
   maintenance documentation.
5. ☐ Run `npm run build` and `npm test` for any dependency change.

**Deliverable:** A documented dependency and disclosure decision record, with
implementation changes where warranted.

**Implemented by:** Pending.

## References

- [Community Plugins scorecard](https://community.obsidian.md/plugins/task-list-kanban)
- [Scanner configuration and built-in exclusions](https://github.com/obsidianmd/eslint-plugin/blob/master/docs/configuration.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
