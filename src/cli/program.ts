import { Command } from "commander";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("symphony2")
    .description("Local-first sequential agent runner")
    .version("0.0.0");

  program
    .command("status")
    .description("Show runner status")
    .action(() => {
      console.log("Symphony2 status is not implemented yet.");
    });

  return program;
}
