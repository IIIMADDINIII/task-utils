import { execa } from "execa";
import { type Ctx, type Task, task } from "./context.ts";
import type { ExecaCommonOptions } from "./utils.ts";

/** Common options for the ts commands. */
export type CommonOptions = ExecaCommonOptions;

/**
 * Runs a raw ts command with the specified arguments.
 * @param ctx - The context for the task.
 * @param options - The options containing the command-line arguments for the ts command.
 * @returns - A promise resolving to the stdout of the ts command.
 */
export const runWithArgs: Task<(ctx: Ctx, options: {
  /** The command-line arguments for the ts command. */
  args: string[];
} & CommonOptions) => Promise<string>> = task("Running ts command", async (ctx, { args, ...options }) => {
  return (await execa({ preferLocal: true, ...ctx.execaOptions(options) })`pnpm exec tsgo ${args}`).stdout;
});

/**
 * Run the TypeScript compiler with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for running the TypeScript compiler.
 */
export const run: Task<(ctx: Ctx, options?: undefined | CommonOptions) => Promise<void>> = task("Building TypeScript project", async (ctx, options = {}) => {
  await runWithArgs.orig(ctx, { ...options, args: [] });
});