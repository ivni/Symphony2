export type RunnerState = "idle" | "running";

export interface RunnerStatus {
  readonly state: RunnerState;
  readonly activeTicketIdentifier?: string;
}

export function createIdleStatus(): RunnerStatus {
  return {
    state: "idle"
  };
}
