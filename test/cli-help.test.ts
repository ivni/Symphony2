import { describe, expect, it } from "vitest";

import { createProgram } from "../src/cli/program.js";

describe("symphony2 CLI", () => {
  it("renders basic help", () => {
    const help = createProgram().helpInformation();

    expect(help).toContain("Usage: symphony2");
    expect(help).toContain("Local-first sequential agent runner");
    expect(help).toContain("status");
  });
});
