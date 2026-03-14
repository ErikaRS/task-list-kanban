# Planning Guide

## Planning & Documentation

### Planning Artifacts Naming Convention
- Design documents and plans in the `specs/` directory should follow this naming convention:
  - Format: `SPEC_XXXX__STATUS__TITLE.md` where XXXX is a 4-digit sequential number
  - Status can be: `IN_PROGRESS`, `COMPLETE`, `CANCELLED`, etc.
  - Example: `SPEC_0001__COMPLETE__FILTER_SAVE_DESIGN.md`
- Date of implementation should be included in the file content as: `Implemented: YYYY-MM`
- **Numbering is global and sequential** — new specs always use the next available number, regardless of where previous specs are filed
- **Completed specs** should be moved to `specs/complete/` to keep the top-level `specs/` directory focused on active work

### Temporary Planning Artifacts
- Temporary planning artifacts (drafts, exploration notes, implementation logs) should go in `tmp_specs/`
- The `tmp_specs/` directory is gitignored and not tracked in version control
- Examples: implementation logs, rough drafts, temporary analysis documents

### Plan Document Structure & Style Guide

**Required Sections:**
1. **Status line** at top (e.g., `Status: COMPLETE`, `Status: IN_PROGRESS`)
2. **Implemented date** (for completed specs): `Implemented: YYYY-MM`
3. **Feature Request Summary** - Brief description and link to issue/PR
4. **User Requirements** - Numbered list of requirements
5. **High-Level Design** - Architecture, UI mockups, data models
6. **Detailed Behavior** - Specific behavior specifications
7. **Implementation Plan** - Phased approach with tracking

**Implementation Plan Format:**
- Break work into **testable vertical slices** - each phase should deliver a working, testable feature increment
- **Not testable until the end = wrong approach** - avoid phases based purely on technical layers (e.g., "add data model", "add UI", "add logic")
- **Testable increments = right approach** - each phase should work end-to-end (e.g., "basic filtering with manual input", "add autocomplete", "add persistence")
- Each phase should have:
  - **Phase number and name**
  - **Goal statement** - What working feature this phase delivers
  - **Numbered task list** with checkboxes (✅ when complete)
  - **Deliverable** - Concrete, testable outcome
  - **Implemented by** - Link to commit(s) or PR(s) that completed the phase
  
**Example Implementation Phase:**
```markdown
### Phase 1: Basic Add & Load (Content Filters Only) ✅ COMPLETE
**Goal:** User can save a content filter and reload it from dropdown

1. ✅ Add types to settings store
2. ✅ Update parsing functions
3. ✅ Add state to track saved filters
4. ✅ Implement Add logic
5. ✅ Test: Add filter, close/reopen board, verify persistence

**Deliverable:** Working save/load for content filters

**Implemented by:** [99a67b6](https://github.com/ErikaRS/task-list-kanban/commit/99a67b6)
```

**Tracking Guidelines:**
- Mark tasks with ✅ as they're completed
- Add phase status after title: `✅ COMPLETE`, `🚧 IN PROGRESS`, or leave blank if not started
- Link to commits using short hash: `[99a67b6](full-commit-url)`
- Link to PRs using number: `[#51](full-pr-url)`
- Update the filename status when all phases complete (rename `IN_PROGRESS` → `COMPLETE`)
- Keep the plan document as source of truth - update it as implementation evolves
