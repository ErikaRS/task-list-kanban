Status: IN_PROGRESS

# Card Layout Orientation

## Feature Request Summary

Add a view option that controls whether task cards inside each board cell lay out automatically, horizontally, or vertically. This is a fallback/customization for TTB/BTT layout issues such as [#162](https://github.com/ErikaRS/task-list-kanban/issues/162), without changing the default behavior.

## User Requirements

1. Users can choose card layout per board/view: **Auto**, **Horizontal**, or **Vertical**.
2. **Auto** preserves current behavior:
   - LTR/RTL boards stack cards vertically.
   - TTB/BTT boards lay cards out horizontally.
3. **Horizontal** lays cards left-to-right inside each cell in any flow direction.
4. **Vertical** stacks cards top-to-bottom inside each cell in any flow direction.
5. The option is saved with board settings and participates in saved views/global defaults if those systems support flow/width overrides.

## High-Level Design

Add a persisted setting, tentatively:

```ts
type CardLayout = "auto" | "horizontal" | "vertical";
```

Resolve the effective cell layout near board rendering:

```ts
effectiveCardLayout =
	cardLayout === "auto"
		? isVerticalFlow ? "horizontal" : "vertical"
		: cardLayout;
```

Pass the resolved layout to `BoardCell` and use CSS classes for the task strip direction. Keep existing flow direction semantics unchanged; this setting only controls task-card arrangement inside a cell.

## Detailed Behavior

- Existing boards without the setting behave as `auto`.
- TTB/BTT plus `horizontal` should match today’s intended card-strip behavior.
- TTB/BTT plus `vertical` should make grouped/table cells compact by stacking multiple tasks.
- LTR/RTL plus `horizontal` should create a horizontal card strip inside each column/cell and rely on the existing board/cell overflow behavior.
- Add-new controls and pending new-task inputs should follow the chosen card layout closely enough to remain reachable and visually associated with the cell.
- Manual reorder indicators should remain usable in both orientations; first pass may keep reorder drop calculations vertical-only if horizontal manual reordering is explicitly disabled or unchanged.

## Implementation Plan

### Phase 1: Persist And Render ✅/🚧
**Goal:** Users can choose card layout and see cards rearrange without changing task data.

1. ☐ Add `CardLayout` type/default/parse/serialize support in settings.
2. ☐ Add the control to the view editor.
3. ☐ Thread `cardLayout` through board matrix components into `BoardCell`.
4. ☐ Replace `isVerticalFlow`-only card direction CSS with explicit card-layout classes.
5. ☐ Verify Auto, Horizontal, and Vertical in LTR and TTB/BTT.

**Deliverable:** Card orientation can be changed per board/view with defaults preserved.

### Phase 2: Saved Views And Tests
**Goal:** The option roundtrips through saved view/global default workflows.

1. ☐ Include card layout in saved view override capture/apply.
2. ☐ Include card layout in global default view properties if appropriate.
3. ☐ Add settings parse/serialize tests.
4. ☐ Add saved view tests.
5. ☐ Run `npm run build` and `npm test`.

**Deliverable:** Persisted card layout is covered by automated tests and quality gates.
