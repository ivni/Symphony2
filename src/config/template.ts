import {
  type PromptTemplateContext,
  promptTemplateContextSchema
} from "../domain/index.js";
import { PromptTemplateError } from "./errors.js";

const templateVariablePattern = /{{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*}}/g;

export function renderPromptTemplate(template: string, context: PromptTemplateContext): string {
  const parsedContext = promptTemplateContextSchema.safeParse(context);

  if (!parsedContext.success) {
    throw new PromptTemplateError(parsedContext.error.issues[0]?.message ?? "Invalid prompt context.");
  }

  const rendered = template.replace(templateVariablePattern, (_match, path: string) =>
    stringifyTemplateValue(resolveTemplatePath(parsedContext.data, path))
  );
  const unsupportedExpression = rendered.match(/{{[^}]*}}/);

  if (unsupportedExpression) {
    throw new PromptTemplateError(
      `Unsupported prompt template expression "${unsupportedExpression[0]}".`
    );
  }

  return rendered;
}

function resolveTemplatePath(context: PromptTemplateContext, path: string): unknown {
  const segments = path.split(".");
  let value: unknown = context;

  for (const segment of segments) {
    if (!isRecord(value) || !(segment in value)) {
      throw new PromptTemplateError(`Unknown prompt template variable "{{ ${path} }}".`);
    }

    value = value[segment];
  }

  if (value === undefined || value === null) {
    throw new PromptTemplateError(`Prompt template variable "{{ ${path} }}" is empty.`);
  }

  return value;
}

function stringifyTemplateValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
