# Text matching fixture

- [ ] Print forms @office
- [ ] Case differs and should stay Unassigned @Office
- [ ] Email bob@office.com
- [ ] Avoid suffix @homework
- [ ] Avoid hyphen suffix @home-office
- [ ] Avoid path suffix @home/garage
- [ ] Fix sink (@home).
- [ ] Call Bob @phone about invoices
- [ ] Draft plan [[Project A]]
- [ ] Review [[Project B]] and [[Project A]]
- [/] Draft plan @home [[Project B]]
- [ ] Fix sink @home @office
- [ ] Buy milk
- [ ] Preserve priority @office 🔼 📅 2026-11-15 ^spec53-priority
- [ ] Later task #later [[Project B]]
- [x] Historical form @office
- [X] Historical link [[Project A]]
- [x] Archived context @office #archived
- [ ] Parent without context
  - [ ] Child context @office

## Manual review

Use Kanban-Text to check column placement and the Text swimlane list. `[[Project A]]`
is deliberately also a column title, so the view editor should warn about it.

- Confirm @Office stays outside the @office column, and a case-only title
  rename offers Update existing tasks while preserving historical done rows.
- Confirm Call Bob shows its inline @phone text and Draft plan keeps its
  [[Project A]] link in their matching columns.
- Move Call Bob from @phone to @office; check that @office replaces @phone in place.
- Drag between Project A, Project B and Unassigned lanes; inspect this source.
- Create cards in a text lane on desktop and mobile; check column and lane text.
- Complete @office cards with Keep column metadata when completing off and on;
  inline @office text must always remain. Uncheck and confirm their placement.
- Archive @office cards with the setting off and on; archive retention continues
  to follow that setting.
- Rename the @office column to @work with Update existing tasks enabled. Historical
  done rows above must stay byte-for-byte unchanged.
- Reorder Text lanes, collapse a lane, and reopen the board; check persistence.
- Review long literals and narrow layouts in light/dark and another theme.
