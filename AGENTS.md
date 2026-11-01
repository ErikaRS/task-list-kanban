# AI Agent Guidelines

## 📚 Onboarding
At the start of each session, read:
1. `README.md` - High-level project overview
2. `README.architecture.md` - Project structure and architecture
3. `README.process.md` - Commit standards and release workflows
4. `README.development.md` - Build commands and testing
5. `README.planning.md` - Spec creation and planning standards

## ✅ Quality Gates
When writing code, you must not finish until all of these succeed:
1. `npm run build` (Runs TypeCheck + Build)
2. `npm test` (Runs Vitest)

## Test Selection
- Before adding a test, identify the plausible failure it catches and check for existing coverage.
- Put behavior cases at the lowest layer that owns the decision. Add an integration or component test only for wiring, interaction, or lifecycle behavior that lower-level tests cannot catch.
- Do not repeat a helper's full case matrix through its callers. Prefer one representative wiring check per distinct path.
- Combine small feature-specific test files when they exercise the same module in the same environment. Keep different environments or incompatible mocks separate; do not create giant catch-all suites.
- Skip tests of incidental wording, icons, CSS classes, trivial pass-throughs, or test fixtures themselves. Preserve accessibility and interaction checks.
- Keep regression tests for data loss, source formatting, failed writes, races, and compatibility. Remove overlap only after identifying the retained test that covers the same risk.
- Use deterministic promises, Svelte ticks, or fake timers instead of sleeps and polling when the completion signal is available. Use small fixtures that cross the relevant boundary.
- Run focused tests while iterating, then run the full quality gates before handing off. Measure suite runtime when changing test infrastructure; keep file isolation enabled.

## ✍️ Attribution
When creating commits with AI assistance, attribute the commit to the agent or
agents that actually contributed to the change using the `Assisted-by:` git trailer.

## 🛑 Committing Changes
DO NOT commit any changes until the user has explicitly had a chance to review them and given you permission to commit. Always stop and ask the user to test/review your work before running `git commit`.

## 🔗 Issue References
Every commit should include `Refs #<issue-number>` whenever an applicable GitHub issue exists, including fixture, documentation, and follow-up commits. Include the same reference in the PR description. Do not use auto-closing keywords; issues are closed only as part of the release workflow.
