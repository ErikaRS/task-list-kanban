# Contributing to Task List Kanban

Thanks for helping improve Task List Kanban.

## Contribution workflow

Please fork this repository, create your branch in that fork, and open a pull
request from the fork back to `ErikaRS/task-list-kanban`. This keeps outside
contributions isolated and gives maintainers a clear review boundary.

## Project standards

The repository READMEs are the source of truth for project conventions. Please
review the applicable guidance before starting work:

- [Project overview](README.md) explains the plugin's user-facing behavior.
- [Architecture guide](README.architecture.md) describes the project structure,
  data flow, and preferred task-write paths.
- [Development guide](README.development.md) lists the supported commands and
  quality checks.
- [Process guide](README.process.md) defines Conventional Commit messages,
  pull-request and release conventions, and required attribution for
  AI-assisted commits.
- [Planning guide](README.planning.md) applies when a contribution adds or
  updates a design/specification document.

## Development setup

1. Install dependencies with `npm install`.
2. Run `npm run dev` to build the plugin in watch mode.
3. Use `./tools/deploy_for_manual_test.sh` to build, test, and copy the plugin into the vendored test vault.

## Before opening a pull request

- Keep changes focused and include regression tests for bug fixes when practical.
- Run `npm run build` and `npm test`.
- Follow the commit and pull-request standards in the [Process guide](README.process.md),
  including Conventional Commit messages such as `fix(filters): preserve saved query`.
- Follow the [Planning guide](README.planning.md) when adding a specification
  or implementation plan.
- Do not commit generated build output unless it is intentionally part of a
  release artifact update described in the [Development guide](README.development.md).

## Reporting issues

Please include your Obsidian version, plugin version, a minimal reproduction, and any relevant console output. Do not include private vault content.
