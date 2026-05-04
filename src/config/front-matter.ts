import { parseDocument } from "yaml";

import { RunnerConfigError } from "./errors.js";

export interface RunnerDocumentParts {
  readonly frontMatter: unknown;
  readonly promptBody: string;
}

interface YamlLinePosition {
  readonly line: number;
  readonly col: number;
}

interface YamlParseError {
  readonly message: string;
  readonly pos?: readonly number[];
  readonly linePos?: readonly YamlLinePosition[];
}

export function parseRunnerDocument(source: string, sourceName = "RUNNER.md"): RunnerDocumentParts {
  const withoutByteOrderMark = source.replace(/^\uFEFF/, "");
  const lines = withoutByteOrderMark.split(/\r?\n/);

  if (lines[0] !== "---") {
    throw new RunnerConfigError(`${sourceName} must start with YAML front matter delimited by ---.`);
  }

  const closingFenceIndex = lines.findIndex((line, index) => index > 0 && line === "---");

  if (closingFenceIndex === -1) {
    throw new RunnerConfigError(`${sourceName} is missing the closing YAML front matter delimiter ---.`);
  }

  const yamlSource = lines.slice(1, closingFenceIndex).join("\n");
  const promptBody = lines.slice(closingFenceIndex + 1).join("\n");
  const frontMatter = parseYamlFrontMatter(yamlSource, sourceName);

  return {
    frontMatter,
    promptBody
  };
}

function parseYamlFrontMatter(yamlSource: string, sourceName: string): unknown {
  if (yamlSource.trim().length === 0) {
    return {};
  }

  const document = parseDocument(yamlSource, {
    prettyErrors: false
  });

  if (document.errors.length > 0) {
    const firstError = document.errors[0] as YamlParseError;
    const position = firstError.linePos?.[0] ?? positionFromOffset(yamlSource, firstError.pos?.[0]);
    const location = position ? ` at line ${position.line}, column ${position.col}` : "";

    throw new RunnerConfigError(
      `Invalid YAML front matter in ${sourceName}${location}: ${firstError.message}`
    );
  }

  const value = document.toJSON();

  if (value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new RunnerConfigError(`YAML front matter in ${sourceName} must be a mapping/object.`);
  }

  return value;
}

function positionFromOffset(source: string, offset: number | undefined): YamlLinePosition | undefined {
  if (offset === undefined) {
    return undefined;
  }

  const beforeOffset = source.slice(0, offset);
  const lines = beforeOffset.split("\n");

  return {
    line: lines.length,
    col: lines[lines.length - 1].length + 1
  };
}
