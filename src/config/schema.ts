import { z } from "zod";

import { RunnerConfigValidationError, issuesFromZodError } from "./errors.js";

export const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  tracker: {
    kind: "local",
    statePath: ".symphony2/state.sqlite",
    ticketPrefix: "LOCAL",
    activeStates: ["Todo", "In Progress"],
    handoffStates: ["Human Review"],
    terminalStates: ["Done", "Cancelled", "Blocked"]
  },
  repo: {
    path: ".",
    requireCleanBeforeStart: true,
    requireCleanBeforeNextTicket: true
  },
  queue: {
    maxActiveTickets: 1,
    sort: ["priority", "created_at"]
  },
  agents: {
    codex: {
      kind: "codex_sdk",
      enabled: true,
      default: true,
      capabilities: []
    }
  },
  agentSelection: {
    manualSources: [
      {
        type: "ticket_field",
        name: "agent"
      },
      {
        type: "tag_prefix",
        prefix: "agent:"
      }
    ],
    fallbackAgent: "codex",
    unavailablePolicy: "block_ticket"
  },
  validation: {
    commands: []
  }
};

const stringListSchema = z.array(z.string().min(1));
const emptyObjectToDefault = (value: unknown): unknown => value ?? {};
const mutableStringListDefault = (values: readonly string[]): (() => string[]) => {
  return () => [...values];
};

const rawTrackerSchema = z
  .object({
    kind: z.literal("local").default(DEFAULT_RUNNER_CONFIG.tracker.kind),
    state_path: z.string().min(1).default(DEFAULT_RUNNER_CONFIG.tracker.statePath),
    ticket_prefix: z.string().min(1).default(DEFAULT_RUNNER_CONFIG.tracker.ticketPrefix),
    active_states: stringListSchema.default(
      mutableStringListDefault(DEFAULT_RUNNER_CONFIG.tracker.activeStates)
    ),
    handoff_states: stringListSchema.default(
      mutableStringListDefault(DEFAULT_RUNNER_CONFIG.tracker.handoffStates)
    ),
    terminal_states: stringListSchema.default(
      mutableStringListDefault(DEFAULT_RUNNER_CONFIG.tracker.terminalStates)
    )
  })
  .transform((tracker) => ({
    kind: tracker.kind,
    statePath: tracker.state_path,
    ticketPrefix: tracker.ticket_prefix,
    activeStates: tracker.active_states,
    handoffStates: tracker.handoff_states,
    terminalStates: tracker.terminal_states
  }));
const rawTrackerWithDefaultSchema = z.preprocess(emptyObjectToDefault, rawTrackerSchema);

const rawRepoSchema = z
  .object({
    path: z.string().min(1).default(DEFAULT_RUNNER_CONFIG.repo.path),
    require_clean_before_start: z
      .boolean()
      .default(DEFAULT_RUNNER_CONFIG.repo.requireCleanBeforeStart),
    require_clean_before_next_ticket: z
      .boolean()
      .default(DEFAULT_RUNNER_CONFIG.repo.requireCleanBeforeNextTicket)
  })
  .transform((repo) => ({
    path: repo.path,
    requireCleanBeforeStart: repo.require_clean_before_start,
    requireCleanBeforeNextTicket: repo.require_clean_before_next_ticket
  }));
const rawRepoWithDefaultSchema = z.preprocess(emptyObjectToDefault, rawRepoSchema);

const rawQueueSchema = z
  .object({
    max_active_tickets: z.literal(1).default(DEFAULT_RUNNER_CONFIG.queue.maxActiveTickets),
    sort: stringListSchema.default(mutableStringListDefault(DEFAULT_RUNNER_CONFIG.queue.sort))
  })
  .transform((queue) => ({
    maxActiveTickets: queue.max_active_tickets,
    sort: queue.sort
  }));
const rawQueueWithDefaultSchema = z.preprocess(emptyObjectToDefault, rawQueueSchema);

const rawAgentConfigSchema = z
  .object({
    kind: z.string().min(1),
    command: z.string().min(1).optional(),
    enabled: z.boolean().default(true),
    default: z.boolean().default(false),
    capabilities: stringListSchema.default([]),
    timeout_ms: z.number().int().positive().optional(),
    sandbox: z.record(z.string(), z.unknown()).optional()
  })
  .transform((agent) => {
    return {
      kind: agent.kind,
      ...(agent.command ? { command: agent.command } : {}),
      enabled: agent.enabled,
      default: agent.default,
      capabilities: agent.capabilities,
      ...(agent.timeout_ms !== undefined ? { timeoutMs: agent.timeout_ms } : {}),
      ...(agent.sandbox ? { sandbox: agent.sandbox } : {})
    };
  });
type RawAgentConfig = z.output<typeof rawAgentConfigSchema>;

const rawManualSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ticket_field"),
    name: z.string().min(1)
  }),
  z.object({
    type: z.literal("tag_prefix"),
    prefix: z.string().min(1)
  })
]);

const rawAgentSelectionSchema = z
  .object({
    manual_sources: z.array(rawManualSourceSchema).default(() => [
      ...DEFAULT_RUNNER_CONFIG.agentSelection.manualSources
    ]),
    fallback_agent: z.string().min(1).optional(),
    unavailable_policy: z
      .enum(["block_ticket", "ask_human"])
      .default(DEFAULT_RUNNER_CONFIG.agentSelection.unavailablePolicy)
  })
  .transform((selection) => ({
    manualSources: selection.manual_sources,
    fallbackAgent: selection.fallback_agent,
    unavailablePolicy: selection.unavailable_policy
  }));
const rawAgentSelectionWithDefaultSchema = z.preprocess(
  emptyObjectToDefault,
  rawAgentSelectionSchema
);

const rawValidationSchema = z
  .object({
    commands: stringListSchema.default(
      mutableStringListDefault(DEFAULT_RUNNER_CONFIG.validation.commands)
    )
  });
const rawValidationWithDefaultSchema = z.preprocess(emptyObjectToDefault, rawValidationSchema);

const rawRunnerConfigSchema = z
  .object({
    tracker: rawTrackerWithDefaultSchema,
    repo: rawRepoWithDefaultSchema,
    queue: rawQueueWithDefaultSchema,
    agents: z
      .record(z.string().min(1), rawAgentConfigSchema)
      .default(() => createDefaultAgents()),
    agent_selection: rawAgentSelectionWithDefaultSchema,
    validation: rawValidationWithDefaultSchema
  });

export const runnerConfigSchema = rawRunnerConfigSchema
  .transform((config) => {
    const fallbackAgent =
      config.agent_selection.fallbackAgent ?? findDefaultAgent(config.agents) ?? "codex";

    return {
      tracker: config.tracker,
      repo: config.repo,
      queue: config.queue,
      agents: config.agents,
      agentSelection: {
        manualSources: config.agent_selection.manualSources,
        fallbackAgent,
        unavailablePolicy: config.agent_selection.unavailablePolicy
      },
      validation: config.validation
    };
  })
  .superRefine((config, context) => {
    if (Object.keys(config.agents).length === 0) {
      context.addIssue({
        code: "custom",
        path: ["agents"],
        message: "At least one agent must be configured."
      });
      return;
    }

    if (!config.agents[config.agentSelection.fallbackAgent]) {
      context.addIssue({
        code: "custom",
        path: ["agent_selection", "fallback_agent"],
        message: `Fallback agent "${config.agentSelection.fallbackAgent}" is not configured.`
      });
    }
  });

export type RunnerConfig = {
  readonly tracker: {
    readonly kind: "local";
    readonly statePath: string;
    readonly ticketPrefix: string;
    readonly activeStates: readonly string[];
    readonly handoffStates: readonly string[];
    readonly terminalStates: readonly string[];
  };
  readonly repo: {
    readonly path: string;
    readonly requireCleanBeforeStart: boolean;
    readonly requireCleanBeforeNextTicket: boolean;
  };
  readonly queue: {
    readonly maxActiveTickets: 1;
    readonly sort: readonly string[];
  };
  readonly agents: Record<
    string,
    {
      readonly kind: string;
      readonly command?: string;
      readonly enabled: boolean;
      readonly default: boolean;
      readonly capabilities: readonly string[];
      readonly timeoutMs?: number;
      readonly sandbox?: Record<string, unknown>;
    }
  >;
  readonly agentSelection: {
    readonly manualSources: readonly (
      | {
          readonly type: "ticket_field";
          readonly name: string;
        }
      | {
          readonly type: "tag_prefix";
          readonly prefix: string;
        }
    )[];
    readonly fallbackAgent: string;
    readonly unavailablePolicy: "block_ticket" | "ask_human";
  };
  readonly validation: {
    readonly commands: readonly string[];
  };
};

export function parseRunnerConfig(frontMatter: unknown, sourceName = "RUNNER.md"): RunnerConfig {
  const result = runnerConfigSchema.safeParse(frontMatter);

  if (!result.success) {
    throw new RunnerConfigValidationError(sourceName, issuesFromZodError(result.error));
  }

  return result.data;
}

function findDefaultAgent(agents: RunnerConfig["agents"]): string | undefined {
  return Object.entries(agents).find(([, agent]) => agent.default)?.[0];
}

function createDefaultAgents(): Record<string, RawAgentConfig> {
  return {
    codex: {
      kind: "codex_sdk",
      enabled: true,
      default: true,
      capabilities: []
    }
  };
}
