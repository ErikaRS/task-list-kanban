Status: COMPLETE
Implemented: 2026-07

# SPEC 0026 - Tag Group Include List

## Feature Request Summary

GitHub issue: [#149](https://github.com/ErikaRS/task-list-kanban/issues/149)

Tag grouping currently supports an optional prefix and a global excluded-tags list. With an empty prefix, every non-excluded task tag can become a swimlane, which is noisy for vaults that use many incidental tags such as people, contexts, or reference labels.

This feature adds an on-board include list for tag grouping. When the include list is populated, only those tags create tag swimlanes.

## User Requirements

1. Users can configure an include list directly in the on-board tag grouping controls.
2. When the include list has one or more tags, only those tags create tag swimlanes.
3. Included tag swimlanes appear in the exact order configured by the user.
4. Tasks without an included grouping tag appear in `Unassigned`.
5. Existing prefix grouping continues to work without requiring an include list.
6. Existing saved tag groupings preserve and restore the include list.
7. The global excluded-tags setting continues to hide tags from cards and grouping eligibility.

## High-Level Design

Extend the tag grouping source with an optional include list:

```typescript
type GroupSource =
  | { kind: "none" }
  | { kind: "file" }
  | { kind: "tag-prefix"; prefix?: string; includeTags?: string[] }
  | { kind: "property"; key: string };
```

`includeTags` stores normalized task tag names without a leading `#`, matching the existing settings style for tag lists.

The include list belongs to the on-board grouping controls because it changes the active group-by behavior, not global tag display behavior. The board settings `excludedTags` list remains the broad hide/exclude mechanism.

## Detailed Behavior

### No Include List

When `includeTags` is missing or empty, tag grouping keeps the current behavior:

- With a prefix, matching task tags create swimlanes sorted alphabetically by suffix.
- Without a prefix, all non-excluded task tags create swimlanes sorted alphabetically by tag.
- `Unassigned` appears for tasks with no matching grouping tag.

### Include List

When `includeTags` has one or more tags:

- The group bucket list is derived from `includeTags`, not from all discovered task tags.
- Buckets appear in the same order as `includeTags`.
- Tags not present on any current task may still appear as empty swimlanes if they are in `includeTags`.
- Tags excluded by `excludedTags` should not create swimlanes, even if present in `includeTags`.
- Tasks whose tags do not match any allowed bucket are assigned to `Unassigned`.

For prefix grouping, `includeTags` may contain either full tag names or the matching prefixed tags; the implementation should normalize to full tag names internally. For example, with prefix `Project-`, both `Alpha` and `Project-Alpha` should resolve to the `Project-Alpha` grouping tag. The UI should make the accepted format clear by favoring full tag chips selected from available task tags.

### Multiple Matching Tags

If a task has multiple tags present in `includeTags`, the task is assigned to the earliest matching tag in the configured include-list order. This differs from the current empty-prefix fallback, which uses alphabetical order, and makes manual list order the source of truth.

### Saved Groupings

Saved tag groupings include both `prefix` and `includeTags`.

Two saved tag groupings are considered equivalent only when both normalized prefix and normalized include-list contents match in the same order.

### Drag And Drop

Tag swimlane drag behavior should continue to write the destination swimlane tag to moved tasks.

For include-list grouping:

- Dropping into an included tag swimlane writes that tag.
- Dropping into `Unassigned` removes the current grouping tag chosen by the active prefix/include-list rules.
- If a task has multiple included grouping tags, moving it should remove the source grouping tag and add the destination grouping tag, leaving unrelated tags untouched.

## Implementation Plan

### Phase 1: Grouping Semantics ✅ COMPLETE
**Goal:** The grouping model supports include-list buckets and ordered assignment.

1. ✅ Extend `GroupSource` and settings schema with `includeTags?: string[]`.
2. ✅ Normalize include-list tags consistently with existing tag settings.
3. ✅ Derive include-list buckets in configured order.
4. ✅ Assign tasks by earliest matching include-list tag.
5. ✅ Add unit tests for ordered buckets, unassigned fallback, excluded-tag interaction, and multiple matching tags.

**Deliverable:** `deriveGroupBuckets`, `createGroupAssigner`, and `getTaskTagGroupValue` support ordered include-list grouping.

### Phase 2: On-Board Controls And Saved Groupings ✅ COMPLETE
**Goal:** Users can configure, save, reload, and delete tag include-list groupings from the board header.

1. ✅ Add an include-tags control to the existing tag grouping controls.
2. ✅ Preserve include-list order in the UI.
3. ✅ Update saved grouping matching to include ordered `includeTags`.
4. ✅ Save and load groupings with both prefix and include-list settings.
5. ✅ Add focused tests where practical for settings parsing and grouping equivalence.

**Deliverable:** Tag group include lists are usable from the board and round-trip through saved groupings.

### Phase 3: Documentation And Verification ✅ COMPLETE
**Goal:** The feature is documented and passes project quality gates.

1. ✅ Update README grouping docs.
2. ✅ Run `npm run build`.
3. ✅ Run `npm test`.
4. ✅ Manually verify that include-list swimlanes render in configured order and that non-included tags land in `Unassigned`.

**Deliverable:** The feature is ready for user review.

## Open Questions

- Should the include-list UI allow manual entry of tags that are not currently present on any task, or only chips from discovered tags?
- Should the prefix input filter include-list suggestions, or should users be able to include tags outside the prefix as an explicit override?
