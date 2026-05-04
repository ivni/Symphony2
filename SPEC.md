# Symphony2 Sequential Agent Runner Specification

Status: Draft v0.2

Purpose: Define a small orchestration service that processes project tickets one at a time in a
single repository working copy, while allowing humans to choose which coding agent should handle
each ticket.

## 1. Summary

This project is not a parallel agent swarm.

The runner owns one repository checkout and executes at most one ticket at a time. It reads work
from a tracker, selects an agent, drives the ticket through a defined set of stages, records state
and evidence, then moves on to the next eligible ticket only after the current ticket is complete,
blocked, or handed off.

The design optimizes for:

- simple operations;
- predictable repository state;
- no file conflicts between agents;
- manual agent selection;
- support for multiple agent backends;
- resumability after crashes;
- clear human review points.

Public GitHub hosting is used only to develop and distribute Symphony2 itself. Tasks executed by a
user's local Symphony2 installation are private local data and MUST NOT be published to this
repository, GitHub Issues, GitHub Projects, pull request descriptions, commit messages, or logs by
default.

## 2. Core Invariants

The implementation MUST preserve these invariants:

1. Only one ticket may be active for a repository at a time.
2. Only one agent run may be active for that ticket at a time.
3. All agent work happens in the configured repository working copy.
4. The runner MUST NOT start a new ticket while the repository contains unresolved changes from a
   previous ticket.
5. The selected agent MUST be recorded before execution starts.
6. The runner MUST keep durable local state so a restart can identify the active ticket and stage.
7. The runner MUST stop instead of silently discarding or overwriting uncommitted work.

## 3. Non-Goals

The runner intentionally does not provide:

- parallel execution across multiple tickets;
- per-ticket worktrees;
- per-ticket branches as a required mechanism;
- distributed scheduling;
- file-level lock graphs;
- a rich multi-tenant web control plane;
- automatic replacement of a manually selected agent with a different agent;
- generic business-process automation outside the ticket execution loop.
- public task tracking for user projects.

Implementations MAY add optional branches, worktrees, dashboards, or parallel workers later, but
those features are outside this baseline spec.

## 4. System Overview

Main components:

1. `Tracker Adapter`
   - Reads candidate tickets.
   - Reads and writes ticket state.
   - Reads manual agent selection metadata.
   - Writes progress comments or workpad updates.

2. `Queue Selector`
   - Picks the next eligible ticket when the runner is idle.
   - Sorts by configured priority rules.
   - Skips blocked or ineligible tickets.

3. `Repo Guard`
   - Owns the global repository lease.
   - Checks repository cleanliness before starting each ticket.
   - Records base revision and current revision.
   - Blocks unsafe transitions.

4. `Agent Router`
   - Resolves the selected agent for the ticket.
   - Honors manual selection first.
   - Applies routing defaults only when no manual selection is present.
   - Validates that the selected agent is available and allowed.

5. `Agent Adapter`
   - Starts the selected agent.
   - Sends the ticket prompt.
   - Streams logs/events when available.
   - Cancels or times out a run.
   - Returns a normalized result.

6. `Stage Engine`
   - Moves the active ticket through intake, planning, execution, validation, and handoff.
   - Persists stage changes.
   - Resumes from the last safe stage after restart.

7. `State Store`
   - Stores local durable state.
   - Stores the current repository lease.
   - Stores run history.

8. `Observability`
   - Emits structured logs.
   - Exposes current status to humans.
   - Captures validation evidence and agent output summaries.

## 5. Domain Model

### 5.1 Ticket

Normalized ticket fields:

- `id`: stable tracker ID.
- `identifier`: human-readable key, for example `ABC-123`.
- `title`.
- `description`.
- `state`.
- `priority`.
- `labels`.
- `url`.
- `manual_agent`: optional explicit agent name.
- `blocked`: boolean or blocker list.
- `created_at`.
- `updated_at`.

### 5.2 Agent

Configured agent fields:

- `name`: stable local name, for example `codex`, `claude`, `aider`.
- `kind`: adapter kind, for example `codex_app_server`, `codex_sdk`, `cli`, `http`.
- `command`: command or endpoint used by the adapter.
- `enabled`: whether the runner may use this agent.
- `default`: whether this agent is the default fallback.
- `capabilities`: declared feature flags.
- `timeout_ms`: optional run timeout.
- `sandbox`: optional adapter-specific policy.

Example capabilities:

- `can_resume`.
- `can_stream_events`.
- `can_run_shell`.
- `can_edit_files`.
- `can_use_mcp`.
- `can_request_approval`.
- `supports_structured_events`.

### 5.3 Run

One attempt to process one ticket.

Fields:

- `run_id`.
- `ticket_id`.
- `ticket_identifier`.
- `selected_agent`.
- `agent_selection_source`.
- `agent_selection_reason`.
- `repo_path`.
- `base_revision`.
- `current_revision`.
- `stage`.
- `status`.
- `started_at`.
- `heartbeat_at`.
- `finished_at`.
- `error`.

### 5.4 Repository Lease

The repository lease prevents two runner processes from using the same checkout at the same time.

Fields:

- `lease_id`.
- `repo_path`.
- `owner_run_id`.
- `ticket_identifier`.
- `agent_name`.
- `started_at`.
- `heartbeat_at`.
- `expires_at`.

The lease MUST be renewed while a run is active. A stale lease MAY be recovered only after the
implementation verifies that no runner process still owns it and the repository state is safe.

## 6. Configuration

The runner SHOULD load configuration from a repository-owned file. The default file name is
`RUNNER.md`.

`RUNNER.md` uses YAML front matter for machine-readable config and Markdown body for the agent
prompt template.

Minimal example:

```md
---
tracker:
  kind: local
  state_path: .symphony2/state.sqlite
  ticket_prefix: LOCAL
  active_states: ["Todo", "In Progress"]
  handoff_states: ["Human Review"]
  terminal_states: ["Done", "Cancelled", "Blocked"]

repo:
  path: .
  require_clean_before_start: true
  require_clean_before_next_ticket: true

queue:
  max_active_tickets: 1
  sort: ["priority", "created_at"]

agents:
  codex:
    kind: codex_sdk
    default: true
    enabled: true
  claude:
    kind: cli
    command: claude-code --print
    enabled: true

agent_selection:
  manual_sources:
    - type: ticket_field
      name: agent
    - type: tag_prefix
      prefix: "agent:"
  fallback_agent: codex
  unavailable_policy: block_ticket

validation:
  commands:
    - npm test
---

You are working on ticket {{ ticket.identifier }}.

Title: {{ ticket.title }}

Description:
{{ ticket.description }}

Use the repository at {{ repo.path }}.
Do not start unrelated work.
```

Unknown config keys SHOULD be ignored for forward compatibility.

## 7. Implementation Tech Stack

The baseline implementation SHOULD use this stack:

- Language/runtime: TypeScript on the current Node.js LTS.
- Package manager: Yarn 4 via Corepack.
- Install mode: `nodeLinker: node-modules` in `.yarnrc.yml`.
- CLI framework: `commander`.
- Config parser: Markdown with YAML front matter.
- Config and domain validation: `zod`.
- State database: SQLite in WAL mode.
- SQLite driver: `better-sqlite3`.
- SQL layer: `kysely`.
- Logging: structured JSON logs to stdout and `.symphony2/logs/`.
- Tests: `vitest`.
- Git operations: native `git` subprocess commands.
- First tracker adapter: local SQLite tracker.
- First agent adapter: Codex SDK.
- Second agent adapter: generic CLI subprocess.
- Optional later agent adapter: Codex app-server.
- Optional later external integrations: Linear tracker and GitHub PR integration.

The baseline MUST NOT require any external tracker service. All ticket data needed to run the MVP
must live locally.

### 7.1 Local Runtime Files

By default, runtime files live under `.symphony2/` in the controlled repository:

- `.symphony2/state.sqlite`: local tracker, runner state, leases, and run history.
- `.symphony2/logs/`: structured logs and agent transcript summaries.
- `.symphony2/artifacts/`: optional validation evidence, screenshots, or generated reports.

The implementation SHOULD add `.symphony2/` to the controlled repository's `.gitignore`, unless the
user explicitly wants to version local tickets.

### 7.2 Local Tracker

The local tracker is the authoritative baseline task source.

It MUST support:

- creating tickets locally;
- listing eligible tickets;
- editing title, description, state, priority, tags, and selected agent;
- appending workpad/progress notes;
- recording validation evidence;
- preserving run history after completion.

Suggested CLI commands:

```text
symphony2 ticket create
symphony2 ticket list
symphony2 ticket show <ticket>
symphony2 ticket update <ticket>
symphony2 ticket set-agent <ticket> <agent>
symphony2 run
symphony2 status
symphony2 pause
symphony2 resume
symphony2 doctor
```

Local ticket identifiers SHOULD use the configured prefix, for example `LOCAL-1`, `LOCAL-2`, and
`LOCAL-3`.

GitHub MAY be used for publishing branches and pull requests later, but GitHub Issues MUST NOT be
the baseline tracker. This avoids publishing private task context for public repositories.

The public Symphony2 repository is only the distribution and development repository for the tool.
It is not a task database for installations of the tool.

## 8. Agent Selection

Manual selection MUST take precedence over routing defaults.

Resolution order:

1. Local ticket field, for example `agent = codex`.
2. Local ticket tag with configured prefix, for example `agent:codex`.
3. Operator CLI override, for example `symphony2 ticket set-agent LOCAL-1 codex`.
4. Routing rules.
5. Fallback default agent.

The runner MUST record:

- selected agent;
- selection source;
- selection reason;
- time of selection.

If a manually selected agent is unavailable, disabled, or unknown, the runner MUST NOT silently use a
different agent. It MUST block the ticket or ask for human intervention according to
`agent_selection.unavailable_policy`.

## 9. Queue and Dispatch

The runner has two high-level states:

- `idle`;
- `running(ticket)`.

When idle:

1. Refresh configuration.
2. Check for an existing repository lease.
3. Check repository state.
4. Fetch eligible tickets.
5. Select the next ticket.
6. Resolve the agent.
7. Acquire the repository lease.
8. Create a run record.
9. Start the stage engine.

When running:

1. Renew the repository lease.
2. Persist stage progress.
3. Stream or store agent events.
4. Stop on terminal, blocked, failure, or handoff conditions.

The runner MUST NOT dispatch a second ticket while any run is active.

## 10. Repository Safety

Before starting a ticket, the runner MUST inspect the repository.

Required checks:

- repository path exists;
- repository path is the configured path;
- no active run already owns the lease;
- working tree cleanliness matches policy;
- no unresolved merge/rebase/cherry-pick state exists;
- current revision is recorded.

If the repository is dirty before a new ticket starts, the runner MUST stop and report the dirty
state. It MUST NOT reset, stash, checkout, or delete changes unless explicitly configured and
approved.

Before moving to the next ticket, the runner MUST verify that the previous ticket has reached an
allowed terminal or handoff state and that repository state is safe.

Allowed repository end states are implementation-defined. Common policies:

- clean working tree;
- committed changes waiting for human push;
- pushed branch and linked PR;
- no code changes needed.

The chosen policy MUST be documented in config.

## 11. Stages

Default stages:

1. `intake`
   - Read ticket.
   - Confirm state and eligibility.
   - Resolve selected agent.
   - Create or update a persistent workpad.

2. `plan`
   - Ask the agent to inspect the task and produce a concise plan.
   - Record acceptance criteria.
   - Record validation plan.

3. `execute`
   - Allow the selected agent to edit the repository.
   - Keep progress in the workpad.
   - Renew lease and heartbeat.

4. `validate`
   - Run configured tests or validation commands.
   - Ask the agent to fix failures within the same ticket scope.
   - Record evidence.

5. `handoff`
   - Summarize completed work.
   - Record changed files and validation.
   - Create or update PR if configured.
   - Move ticket to human review or done.

6. `complete`
   - Release lease.
   - Mark run complete.
   - Return runner to idle.

Implementations MAY combine stages, but persisted state MUST be detailed enough to resume or safely
stop after a crash.

## 12. Tracker State Mapping

The runner SHOULD support configurable tracker states.

Example state map:

- `Backlog`: ignored.
- `Todo`: eligible.
- `In Progress`: active or resumable.
- `Human Review`: handoff; runner does not modify unless instructed.
- `Blocked`: blocked by missing agent, dirty repo, failing required external dependency, or human
  decision.
- `Done`: terminal.
- `Cancelled`: terminal.

If the active ticket moves to a terminal state while a run is active, the runner SHOULD stop the
agent and release the lease after repository safety checks.

## 13. Agent Adapter Contract

All agent adapters expose the same logical operations:

```text
prepare(run, ticket, repo, config) -> ok | error
start(run, prompt) -> session | error
send(session, input) -> ok | error
poll(session) -> event | completed | failed | timed_out
cancel(session) -> ok | error
finish(session) -> result
```

Adapters MAY implement this contract with:

- Codex app-server JSON-RPC;
- Codex SDK;
- a CLI subprocess;
- an HTTP service;
- another local automation runtime.

The runner SHOULD normalize events into a small shared event model:

- `agent_started`;
- `agent_log`;
- `agent_message`;
- `command_started`;
- `command_completed`;
- `file_changed`;
- `approval_required`;
- `validation_result`;
- `agent_completed`;
- `agent_failed`;
- `agent_cancelled`.

Adapters that cannot provide structured events MAY emit `agent_log` and final status only.

## 14. Prompt Contract

The prompt template receives:

- `ticket`;
- `run`;
- `repo`;
- `agent`;
- `workflow`;
- `attempt`.

The rendered prompt SHOULD include:

- ticket identifier;
- title;
- description;
- current tracker state;
- selected agent name;
- repository path;
- current stage;
- acceptance criteria;
- validation requirements;
- instructions not to perform unrelated work.

Unknown template variables SHOULD fail rendering rather than silently producing incomplete prompts.

## 15. State Store

The implementation MUST persist state outside process memory.

Acceptable storage:

- SQLite;
- JSON files with atomic writes;
- another durable local database.

The baseline implementation MUST use SQLite. JSON files may be used for export/import or debugging,
but not as the primary state store.

Required records:

- current runner status;
- active run;
- repository lease;
- run history;
- last selected ticket;
- last selected agent;
- stage history;
- errors and validation summaries.

The state store MUST support crash recovery. On startup, the runner MUST reconcile local state,
tracker state, and repository state before dispatching new work.

## 16. Crash Recovery

On startup:

1. Load configuration.
2. Load state store.
3. Inspect repository.
4. Inspect active lease, if any.
5. Fetch active ticket, if any.
6. Decide one of:
   - resume active run;
   - mark run as interrupted and block ticket;
   - release stale lease and return to idle;
   - stop and ask for human intervention.

The runner MUST prefer stopping over starting a new ticket when state is ambiguous.

## 17. Retry Policy

Retries are allowed only for the current active ticket.

The runner MUST NOT use retries to create parallel attempts.

Retry behavior is configurable:

- max attempts;
- backoff;
- retryable error classes;
- whether validation failures are retryable;
- whether missing credentials are retryable.

Non-retryable conditions:

- unknown manually selected agent;
- disabled manually selected agent;
- dirty repository before ticket start;
- unresolved repository operation;
- ambiguous crash recovery state;
- missing required human approval.

## 18. Human Control

Humans must be able to:

- pause the runner;
- resume the runner;
- stop the active run;
- change the selected agent before execution starts;
- mark a ticket blocked;
- mark a ticket ready for review;
- inspect current stage and last agent output.

If a human changes the selected agent while a run is already active, the implementation MUST define
whether the change applies immediately, after cancellation, or only to the next run. The baseline
policy is: agent changes apply only before execution starts.

## 19. Observability

At minimum, the runner MUST emit structured logs containing:

- run ID;
- ticket identifier;
- selected agent;
- stage;
- repository path;
- base revision;
- event type;
- timestamp;
- error, if any.

The runner SHOULD expose a simple status command or endpoint showing:

- idle/running status;
- active ticket;
- active stage;
- selected agent;
- heartbeat age;
- repository cleanliness;
- last error;
- last validation summary.

## 20. Security and Permissions

The runner executes agents against a real repository checkout. Implementations MUST document:

- which commands each agent may run;
- whether shell access is sandboxed;
- where credentials come from;
- which tracker writes are allowed;
- whether PR/merge operations are allowed;
- what requires human approval.

The runner MUST NOT expose a remote control surface without authentication.

### 20.1 Task Privacy Boundary

Executed task data is private by default.

The runner MUST NOT send local ticket content, workpad notes, agent transcripts, validation logs,
repository paths, screenshots, or generated artifacts to public GitHub surfaces unless the operator
explicitly asks for that export.

Public GitHub surfaces include:

- GitHub Issues;
- GitHub Projects;
- pull request titles and descriptions;
- pull request comments;
- commit messages;
- release notes;
- Actions logs;
- uploaded artifacts.

If a future GitHub PR integration is added, it MUST use a privacy-preserving summary by default:

- mention that Symphony2 produced or assisted with the change;
- include changed files and validation commands when safe;
- omit local ticket descriptions, private notes, customer data, secrets, local paths, and full agent
  transcripts.

The local tracker remains the source of truth for executed tasks. Exporting a task outside the local
state store is an explicit operator action, not default behavior.

## 21. Definition of Done

A baseline implementation is complete when it can:

- load `RUNNER.md`;
- create and fetch eligible tickets from the local SQLite tracker;
- run in single-ticket mode;
- acquire and renew a repository lease;
- reject new work when the repo is unsafe;
- select an agent manually from the local ticket field or tag metadata;
- fall back to a default agent only when no manual selection exists;
- run the Codex SDK agent adapter;
- run the generic CLI agent adapter;
- persist run state in SQLite;
- recover safely after restart;
- update local ticket progress;
- record validation evidence;
- keep executed task data out of public GitHub surfaces by default;
- release the lease and move to the next ticket only after safe completion.

## 22. Example Lifecycle

```text
runner starts
  -> loads RUNNER.md
  -> repo is clean
  -> no active lease
  -> fetches tickets
  -> picks LOCAL-1
  -> sees ticket field agent=codex
  -> records selected_agent=codex
  -> acquires repo lease
  -> moves LOCAL-1 to In Progress
  -> runs intake
  -> runs plan
  -> runs execute
  -> runs validate
  -> creates handoff summary
  -> moves LOCAL-1 to Human Review
  -> verifies repo end state is allowed
  -> releases lease
  -> returns to idle
  -> picks next eligible ticket
```
