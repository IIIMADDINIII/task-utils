import { execa } from "execa";
import { type Ctx, task } from "./context.ts";

/**
 * Runs a raw vp command with the specified arguments.
 * Does not run it as a separate task.
 * @param ctx - The context for the task.
 * @param args - The command-line arguments for the vp command.
 * @returns - A promise resolving to the stdout of the vp command.
 */
async function vp(ctx: Ctx, args: string[]): Promise<string> {
  return (await execa({ verbose: ctx.execaVerbose() })`pnpm exec vp ${args}`).stdout;
}

/**
 * Runs a raw vp command with the specified arguments.
 * @param ctx - The context for the task.
 * @param args - The command-line arguments for the vp command.
 * @returns - A promise resolving to the stdout of the vp command.
 */
export const runWithArgs: (ctx: Ctx, args: string[]) => Promise<string> = task("Running vp command", async (ctx, args) => {
  return await vp(ctx, args);
});

/**
 * Run the vp dev command with the specified options.
 * @param ctx - The context for the task.
 */
export const dev: (ctx: Ctx) => Promise<void> = task("Running vp dev", async (ctx) => {
  await vp(ctx, ["dev"]);
});

/**
 * Run the vp check command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp check command.
 */
export const check: (ctx: Ctx, options?: undefined | {
  /** 
   * Whether to automatically fix issues found by the check command. 
   * @default false
   */
  fix?: boolean | undefined;
}) => Promise<void> = task("Running vp check", async (ctx, {fix=false}={}) => {
  const args = ["check"];
  if (fix) {
    args.push("--fix");
  }
  await vp(ctx, args);
});

/**
 * Run the vp lint command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp lint command.
 */
export const lint: (ctx: Ctx, options?: undefined |{
  /** 
   * Whether to automatically fix issues found by the lint command. 
   * @default false
   */
  fix?: boolean | undefined;
}) => Promise<void> = task("Running vp lint", async (ctx, {fix=false}={}) => {
  const args = ["lint"];
  if (fix) {
    args.push("--fix");
  }
  await vp(ctx, args);
});

/**
 * Run the vp fmt command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp fmt command.
 */
export const fmt: (ctx: Ctx, options?: undefined | {
  /** 
   * Whether to automatically check for issues without fixing them. 
   * @default true
   */
  check?: boolean | undefined;
}) => Promise<void> = task("Running vp fmt", async (ctx, {check=true}={}) => {
  const args = ["fmt"];
  if (check) {
    args.push("--check");
  }
  await vp(ctx, args);
});

/**
 * Run the vp test command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp test command.
 */
export const test: (ctx: Ctx, options?: undefined | {
  /** 
   * The sub-command to run for testing. 
   * @default "run"
   */
  subCommand?: "" | "run" | "watch" | undefined;
  /** 
   * Whether to collect test coverage. 
   * @default false
   */
  coverage?: boolean | undefined;
}) => Promise<void> = task("Running vp test", async (ctx, {coverage=false, subCommand="run"}={}) => {
  const args = ["test"];
  if (subCommand !== "") {
    args.push(subCommand);
  }
  if (coverage) {
    args.push("--coverage");
  }
  await vp(ctx, args);
});

/**
 * Run the vp build command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp build command.
 */
export const build: (ctx: Ctx, options?: undefined | {
  /**
   * Whether to watch for file changes and rebuild automatically.
   * @default false
   */
  watch?: boolean | undefined;
}) => Promise<void> = task("Running vp build", async (ctx, {watch=false}={}) => {
  const args = ["build"];
  if (watch) {
    args.push("--watch");
  }
  await vp(ctx, args);
});

/**
 * Run the vp pack command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp pack command.
 */
export const pack: (ctx: Ctx, options?: undefined | {
  /**
   * Whether to watch for file changes and rebuild automatically.
   * @default false
   */
  watch?: boolean | undefined;
}) => Promise<void> = task("Running vp pack", async (ctx, {watch=false}={}) => {
  const args = ["pack"];
  if (watch) {
    args.push("--watch");
  }
  await vp(ctx, args);
});

/**
 * Run the vp preview command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp preview command.
 */
export const preview: (ctx: Ctx, options?: undefined | {
  /**
   * Whether to watch for file changes and rebuild automatically.
   * @default false
   */
  watch?: boolean | undefined;
}) => Promise<void> = task("Running vp preview", async (ctx, {watch=false}={}) => {
  const args = ["preview"];
  if (watch) {
    args.push("--watch");
  }
  await vp(ctx, args);
});

