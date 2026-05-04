export interface LogEvent {
  readonly event: string;
  readonly timestamp: string;
  readonly runId?: string;
  readonly ticketIdentifier?: string;
}
