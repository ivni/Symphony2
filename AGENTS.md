# Symphony2 Agent Instructions

This repository defines and implements Symphony2: a local-first sequential agent runner.

## Core Context

- Read `SPEC.md` before changing behavior.
- If a local `PLAN.md` exists, use it to choose the next implementation slice. `PLAN.md` is
  intentionally ignored by git and is not part of the public repository contract.
- The public GitHub repository is for developing and distributing Symphony2 itself.
- Tasks executed by a user's Symphony2 installation are private local data.
- Do not introduce GitHub Issues, GitHub Projects, or public PR comments as the baseline task
  tracker.

## Product Invariants

- One repository checkout.
- One active ticket at a time.
- One agent run at a time.
- Local SQLite tracker is the MVP source of truth.
- `.symphony2/` contains runtime state and must be gitignored by default.
- Ambiguous repository state should stop the runner, not trigger cleanup guesses.
- Manually selected agents must not be silently replaced.

## Tech Stack

Use the stack in `SPEC.md` unless the user explicitly changes it:

- TypeScript on Node.js LTS.
- Yarn 4 via Corepack.
- `.yarnrc.yml` must use `nodeLinker: node-modules`.
- `commander` for CLI.
- Markdown + YAML front matter for `RUNNER.md`.
- `zod` for validation.
- SQLite WAL with `better-sqlite3`.
- `kysely` for SQL.
- `vitest` for tests.
- Native `git` subprocess commands for repo operations.

## Development Rules

- Keep changes small and aligned with one phase of `PLAN.md`.
- Prefer explicit domain types and schema validation over loose objects.
- Add tests around state transitions, repository safety, and privacy boundaries.
- Do not add a web dashboard before the CLI MVP works.
- Do not add external tracker integrations before the local tracker works.
- Do not add parallel execution, worktrees, or remote workers in the MVP.
- Do not store private task data in commit messages, public issues, PR descriptions, release notes,
  Actions logs, or uploaded artifacts.

## Expected Commands

Until the scaffold exists, document any missing commands in the final response.

Once implemented, use:

```text
corepack enable
yarn install --immutable
yarn test
yarn build
yarn lint
```

## File Ownership Notes

- `SPEC.md`: product contract. Update when behavior changes.
- `AGENTS.md`: instructions for coding agents working in this repo.
- `PLAN.md`: optional local implementation roadmap. Do not stage or commit it.
- Runtime data should live under `.symphony2/` in user projects, not in this public repository.

## Privacy Boundary

Never treat local tickets as public project-management data.

If future GitHub PR integration is added, default PR text must be a privacy-preserving summary:

- include safe changed-file and validation information;
- omit local ticket descriptions, workpad notes, customer data, local paths, secrets, and full agent
  transcripts.
