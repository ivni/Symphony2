import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { RunnerConfigNotFoundError } from "./errors.js";
import { parseRunnerDocument } from "./front-matter.js";
import { type RunnerConfig, parseRunnerConfig } from "./schema.js";

export interface LoadedRunnerConfig {
  readonly path: string;
  readonly config: RunnerConfig;
  readonly promptTemplate: string;
}

export interface LoadRunnerConfigOptions {
  readonly cwd?: string;
  readonly path?: string;
}

export async function discoverRunnerConfigPath(startDirectory = process.cwd()): Promise<string> {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    const candidate = path.join(currentDirectory, "RUNNER.md");

    if (await fileExists(candidate)) {
      return candidate;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      throw new RunnerConfigNotFoundError(path.resolve(startDirectory));
    }

    currentDirectory = parentDirectory;
  }
}

export async function loadRunnerConfig(
  options: LoadRunnerConfigOptions = {}
): Promise<LoadedRunnerConfig> {
  const configPath = path.resolve(options.path ?? (await discoverRunnerConfigPath(options.cwd)));
  const source = await readFile(configPath, "utf8");
  const document = parseRunnerDocument(source, configPath);
  const config = parseRunnerConfig(document.frontMatter, configPath);

  return {
    path: configPath,
    config,
    promptTemplate: document.promptBody
  };
}

async function fileExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}
