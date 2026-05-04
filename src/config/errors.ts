import { ZodError } from "zod";

export interface ConfigIssue {
  readonly path: string;
  readonly message: string;
}

export class RunnerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerConfigError";
  }
}

export class RunnerConfigNotFoundError extends RunnerConfigError {
  constructor(startDirectory: string) {
    super(`Could not find RUNNER.md from ${startDirectory}.`);
    this.name = "RunnerConfigNotFoundError";
  }
}

export class RunnerConfigValidationError extends RunnerConfigError {
  readonly issues: readonly ConfigIssue[];

  constructor(source: string, issues: readonly ConfigIssue[]) {
    super(formatConfigIssues(source, issues));
    this.name = "RunnerConfigValidationError";
    this.issues = issues;
  }
}

export class PromptTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptTemplateError";
  }
}

export function issuesFromZodError(error: ZodError): ConfigIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "<root>",
    message: issue.message
  }));
}

function formatConfigIssues(source: string, issues: readonly ConfigIssue[]): string {
  const details = issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n");

  return `Invalid RUNNER.md config in ${source}:\n${details}`;
}
