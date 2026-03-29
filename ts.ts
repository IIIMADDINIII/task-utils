import { execa } from "execa";
import { type Ctx, task } from "./context.ts";

/**
 * Runs a raw ts command with the specified arguments.
 * @param ctx - The context for the task.
 * @param args - The command-line arguments for the ts command.
 * @returns - A promise resolving to the stdout of the ts command.
 */
export const runWithArgs: (ctx: Ctx, args: string[]) => Promise<string> = task("Running ts command", async (ctx, args) => {
  return (await execa({ verbose: ctx.execaVerbose() })`pnpm exec tsgo ${args}`).stdout;
});

/**
 * Run the TypeScript compiler with the specified options.
 * @param ctx - The context for the task.
 */
export const run: (ctx: Ctx) => Promise<void> = task("Building TypeScript project", async (ctx) => {
  await runWithArgs(ctx, []);
});