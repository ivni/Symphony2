export type WorkflowStage =
  | "intake"
  | "plan"
  | "execute"
  | "validate"
  | "handoff"
  | "complete";

export const defaultWorkflowStages: readonly WorkflowStage[] = [
  "intake",
  "plan",
  "execute",
  "validate",
  "handoff",
  "complete"
];
