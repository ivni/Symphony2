import { z } from "zod";

export const workflowStageSchema = z.enum([
  "intake",
  "plan",
  "execute",
  "validate",
  "handoff",
  "complete"
]);

export const ticketSchema = z.object({
  id: z.string().min(1),
  identifier: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  state: z.string().min(1),
  priority: z.number().int().default(0),
  labels: z.array(z.string()).default([]),
  url: z.string().url().optional(),
  manual_agent: z.string().min(1).optional(),
  blocked: z.union([z.boolean(), z.array(z.string())]).default(false),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});

export const agentDefinitionSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  command: z.string().min(1).optional(),
  enabled: z.boolean(),
  default: z.boolean(),
  capabilities: z.array(z.string()).default([]),
  timeout_ms: z.number().int().positive().optional(),
  sandbox: z.record(z.string(), z.unknown()).optional()
});

export const repositoryRefSchema = z.object({
  path: z.string().min(1),
  revision: z.string().min(1).optional()
});

export const runSchema = z.object({
  run_id: z.string().min(1),
  ticket_id: z.string().min(1),
  ticket_identifier: z.string().min(1),
  selected_agent: z.string().min(1),
  agent_selection_source: z.string().min(1),
  agent_selection_reason: z.string().min(1),
  repo_path: z.string().min(1),
  base_revision: z.string().min(1).optional(),
  current_revision: z.string().min(1).optional(),
  stage: workflowStageSchema,
  status: z.string().min(1),
  started_at: z.string().min(1),
  heartbeat_at: z.string().min(1).optional(),
  finished_at: z.string().min(1).optional(),
  error: z.string().optional()
});

export const workflowContextSchema = z.object({
  stage: workflowStageSchema,
  stages: z.array(workflowStageSchema).default([
    "intake",
    "plan",
    "execute",
    "validate",
    "handoff",
    "complete"
  ])
});

export const promptTemplateContextSchema = z.object({
  ticket: ticketSchema,
  run: runSchema,
  repo: repositoryRefSchema,
  agent: agentDefinitionSchema,
  workflow: workflowContextSchema,
  attempt: z.number().int().positive().default(1)
});

export type WorkflowStage = z.infer<typeof workflowStageSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
export type RepositoryRef = z.infer<typeof repositoryRefSchema>;
export type Run = z.infer<typeof runSchema>;
export type WorkflowContext = z.infer<typeof workflowContextSchema>;
export type PromptTemplateContext = z.infer<typeof promptTemplateContextSchema>;
