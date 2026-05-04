export type AgentCapability =
  | "can_resume"
  | "can_stream_events"
  | "can_run_shell"
  | "can_edit_files"
  | "can_use_mcp"
  | "can_request_approval"
  | "supports_structured_events";

export interface AgentDefinition {
  readonly name: string;
  readonly kind: string;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly capabilities: readonly AgentCapability[];
}
