# Sticky Save Button + Dirty Check for Settings Modal
Status: COMPLETE
Implemented: 2026-03

## Feature Request Summary
The settings modal has grown long enough that the Save button at the bottom scrolls out of view. This makes it easy to forget to save — users close the modal thinking their changes are applied when they aren't.

## User Requirements
1. The Save button must always be visible regardless of scroll position
2. If the user has unsaved changes, they should see an indicator
3. Closing without saving should still discard changes (backwards compatibility)
4. The warning mechanism should be lightweight (inline, not a separate modal)

---

## High-Level Design

### DOM Structure Change

New structure:
```
modalEl (flex column, overflow hidden)
└── contentEl (flex column, flex: 1, overflow hidden)
    ├── scrollable-wrapper (overflow-y: auto, flex: 1, min-height: 0)
    │   ├── dirty-banner (shown/hidden dynamically)
    │   ├── h1 "Settings"
    │   └── all Setting() elements...
    └── button-bar (flex-shrink: 0, border-top)
        ├── Cancel button (left)
        └── Save button (right, CTA style)
```

Key CSS detail: both `modalEl` and `contentEl` need flex layout classes. The `modalEl` needs `overflow: hidden` to constrain height, and the scroll wrapper needs `min-height: 0` to allow flex shrinking (a common flexbox gotcha — flex items default to `min-height: auto` which prevents overflow).

### Dirty State Tracking

- Snapshot original settings as `JSON.stringify(settings)` in the constructor before any mutations
- `isDirty()` method compares `JSON.stringify(this.settings)` against the snapshot
- This works because `SettingValues` is a plain JSON-serializable object

### Live Dirty Banner

The dirty banner is a **live status indicator**, not a close-time guard:
- Appears immediately when any setting differs from the saved state
- Disappears if settings are reverted to their original values
- Text-only (no buttons) — just "You have unsaved changes."
- Every `onChange` handler calls `updateDirtyBanner()` after mutating settings

### Button Behavior

- **Save** always saves and closes (no dirty check needed)
- **Cancel** always closes without saving (user is expressing clear intent)
- **Escape / click outside** also closes without saving (same as Cancel)

---

## Detailed Behavior

### Sticky Button Bar
- Uses `flex-shrink: 0` to stay fixed at the bottom of the modal
- Top border: `1px solid var(--background-modifier-border)`
- Cancel button on the left (default style), Save button on the right (CTA style)

### Dirty Banner
- Inserted as first child of scroll wrapper when dirty, removed when clean
- Background: `rgba(var(--background-modifier-error-rgb), 0.15)` with error border
- Layout: simple text span, no buttons

### Edge Cases
- If settings are changed back to original values, `isDirty()` returns false — banner disappears
- Validation errors (e.g., invalid status markers): only valid values are written to `this.settings`, so `isDirty()` reflects the last valid value

---

## Implementation

### Files Modified
- `src/ui/settings/settings.ts` — DOM restructuring, button bar, dirty tracking, banner
- `styles.css` — CSS for modal layout, scroll wrapper, button bar, and dirty banner
- `src/ui/settings/tests/settings_store.tests.ts` — Dirty check approach validation tests
