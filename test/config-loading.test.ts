import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  RunnerConfigError,
  RunnerConfigValidationError,
  discoverRunnerConfigPath,
  loadRunnerConfig,
  parseRunnerDocument,
  renderPromptTemplate
} from "../src/index.js";

async function writeRunnerFile(contents: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "symphony2-config-"));
  const runnerPath = path.join(directory, "RUNNER.md");

  await writeFile(runnerPath, contents, "utf8");

  return runnerPath;
}

describe("RUNNER.md loading", () => {
  it("loads a valid minimal RUNNER.md with defaults", async () => {
    const runnerPath = await writeRunnerFile(`---
---
Ticket {{ ticket.identifier }}
`);

    const loaded = await loadRunnerConfig({
      path: runnerPath
    });

    expect(loaded.config.tracker.kind).toBe("local");
    expect(loaded.config.tracker.statePath).toBe(".symphony2/state.sqlite");
    expect(loaded.config.queue.maxActiveTickets).toBe(1);
    expect(loaded.config.agentSelection.fallbackAgent).toBe("codex");
    expect(loaded.promptTemplate).toBe("Ticket {{ ticket.identifier }}\n");
  });

  it("discovers RUNNER.md from a nested working directory", async () => {
    const runnerPath = await writeRunnerFile(`---
---
Prompt
`);
    const projectDirectory = path.dirname(runnerPath);
    const nestedDirectory = path.join(projectDirectory, "src", "nested");

    await mkdir(nestedDirectory, {
      recursive: true
    });

    await expect(discoverRunnerConfigPath(nestedDirectory)).resolves.toBe(runnerPath);
  });

  it("fails invalid front matter with a precise YAML error", () => {
    expect(() =>
      parseRunnerDocument(`---
tracker: [
---
Prompt
`)
    ).toThrow(/Invalid YAML front matter in RUNNER\.md at line 1, column 11/);
  });

  it("ignores unknown config keys", async () => {
    const runnerPath = await writeRunnerFile(`---
tracker:
  kind: local
  extra_tracker_key: ignored
extra_root_key: ignored
agents:
  codex:
    kind: codex_sdk
    default: true
    enabled: true
    extra_agent_key: ignored
---
Prompt
`);

    const loaded = await loadRunnerConfig({
      path: runnerPath
    });

    expect("extra_root_key" in loaded.config).toBe(false);
    expect("extra_tracker_key" in loaded.config.tracker).toBe(false);
    expect("extra_agent_key" in loaded.config.agents.codex).toBe(false);
  });

  it("reports friendly validation paths", async () => {
    const runnerPath = await writeRunnerFile(`---
queue:
  max_active_tickets: 2
---
Prompt
`);

    await expect(
      loadRunnerConfig({
        path: runnerPath
      })
    ).rejects.toThrow(RunnerConfigValidationError);

    await expect(
      loadRunnerConfig({
        path: runnerPath
      })
    ).rejects.toThrow(/queue\.max_active_tickets/);
  });

  it("renders prompt templates for a local ticket", () => {
    const rendered = renderPromptTemplate("Work on {{ ticket.identifier }} with {{ agent.name }}.", {
      ticket: {
        id: "1",
        identifier: "LOCAL-1",
        title: "Add config loader",
        description: "Load RUNNER.md",
        state: "Todo",
        priority: 1,
        labels: [],
        blocked: false
      },
      run: {
        run_id: "run-1",
        ticket_id: "1",
        ticket_identifier: "LOCAL-1",
        selected_agent: "codex",
        agent_selection_source: "fallback",
        agent_selection_reason: "default",
        repo_path: ".",
        stage: "intake",
        status: "running",
        started_at: "2026-05-04T00:00:00.000Z"
      },
      repo: {
        path: ".",
        revision: "abc123"
      },
      agent: {
        name: "codex",
        kind: "codex_sdk",
        enabled: true,
        default: true,
        capabilities: []
      },
      workflow: {
        stage: "intake",
        stages: ["intake", "plan", "execute", "validate", "handoff", "complete"]
      },
      attempt: 1
    });

    expect(rendered).toBe("Work on LOCAL-1 with codex.");
  });

  it("rejects unknown prompt template variables", () => {
    expect(() =>
      renderPromptTemplate("{{ ticket.missing }}", {
        ticket: {
          id: "1",
          identifier: "LOCAL-1",
          title: "Add config loader",
          description: "",
          state: "Todo"
        },
        run: {
          run_id: "run-1",
          ticket_id: "1",
          ticket_identifier: "LOCAL-1",
          selected_agent: "codex",
          agent_selection_source: "fallback",
          agent_selection_reason: "default",
          repo_path: ".",
          stage: "intake",
          status: "running",
          started_at: "2026-05-04T00:00:00.000Z"
        },
        repo: {
          path: "."
        },
        agent: {
          name: "codex",
          kind: "codex_sdk",
          enabled: true,
          default: true
        },
        workflow: {
          stage: "intake"
        },
        attempt: 1
      })
    ).toThrow(/Unknown prompt template variable/);
  });

  it("requires RUNNER.md front matter delimiters", () => {
    expect(() => parseRunnerDocument("Prompt only")).toThrow(RunnerConfigError);
  });
});
