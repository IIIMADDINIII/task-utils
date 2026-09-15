
import { execa } from "execa";
import { type Ctx, task, type Task } from "./context.ts";
import type { ExecaCommonOptions } from "./utils.ts";


/** Common options for the vp commands. */
export type CommonOptions = ExecaCommonOptions & {
  /**
   * Whether to capture and handle stderr output from the vp command.
   * Might be a boolean or a function to handle stderr output.
   * If true then any stderr output from the vp command will cause the command to fail.
   * If a function is provided, it will be called with the stderr output and should return a boolean indicating whether the command should fail.
   * Defaults to true if the command is pack or build, and false otherwise.
   */
  stderr?: boolean | undefined | ((stderr: string) => boolean);
};

/**
 * Runs a raw vp command with the specified arguments.
 * @param ctx - The context for the task.
 * @param options - The options containing the command-line arguments for the vp command.
 * @returns - A promise resolving to the stdout of the vp command.
 */
export const runWithArgs: Task<(ctx: Ctx, options: {
  /** The command-line arguments for the vp command. */
  args: string[];
} & CommonOptions) => Promise<string>> = task("Running vp command", async (ctx, {
  args,
  stderr = false,
  ...options
}) => {
  const ret = await execa({ preferLocal: true, ...ctx.execaOptions(options) })`pnpm exec vp ${args}`;
  if (stderr !== false) {
    if (typeof stderr === "boolean") stderr = (stderr: string) => stderr.length > 0;
    if (stderr(ret.stderr)) throw new Error("vp command had a warning during execution.");
  }
  return ret.stdout;
});

/**
 * Run the vp dev command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp dev command.
 */
export const dev: Task<(ctx: Ctx, options?: undefined | CommonOptions) => Promise<void>> = task("Running vp dev", async (ctx, options = {}) => {
  await runWithArgs.orig(ctx, { ...options, args: ["dev"] });
});

/**
 * Run the vp check command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp check command.
 */
export const check: Task<(ctx: Ctx, options?: undefined | {
  /** 
   * Whether to automatically fix issues found by the check command. 
   * @default false
   */
  fix?: boolean | undefined;
} & CommonOptions) => Promise<void>> = task("Running vp check", async (ctx, { fix = false, ...options } = {}) => {
  const args = ["check"];
  if (fix) {
    args.push("--fix");
  }
  await runWithArgs.orig(ctx, { ...options, args });
});

/**
 * Run the vp lint command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp lint command.
 */
export const lint: Task<(ctx: Ctx, options?: undefined | {
  /** 
   * Whether to automatically fix issues found by the lint command. 
   * @default false
   */
  fix?: boolean | undefined;
} & CommonOptions) => Promise<void>> = task("Running vp lint", async (ctx, { fix = false, ...options } = {}) => {
  const args = ["lint"];
  if (fix) {
    args.push("--fix");
  }
  await runWithArgs.orig(ctx, { ...options, args });
});

/**
 * Run the vp fmt command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp fmt command.
 */
export const fmt: Task<(ctx: Ctx, options?: undefined | {
  /** 
   * Whether to automatically check for issues without fixing them. 
   * @default true
   */
  check?: boolean | undefined;
} & CommonOptions) => Promise<void>> = task("Running vp fmt", async (ctx, { check = true, ...options } = {}) => {
  const args = ["fmt"];
  if (check) {
    args.push("--check");
  }
  await runWithArgs.orig(ctx, { ...options, args });
});

/**
 * Run the vp test command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp test command.
 */
export const test: Task<(ctx: Ctx, options?: undefined | {
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
} & CommonOptions) => Promise<void>> = task("Running vp test", async (ctx, { coverage = false, subCommand = "run", ...options } = {}) => {
  const args = ["test"];
  if (subCommand !== "") {
    args.push(subCommand);
  }
  if (coverage) {
    args.push("--coverage");
  }
  await runWithArgs.orig(ctx, { ...options, args });
});

/**
 * Run the vp build command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp build command.
 */
export const build: Task<(ctx: Ctx, options?: undefined | {
  /**
   * Whether to watch for file changes and rebuild automatically.
   * @default false
   */
  watch?: boolean | undefined;
  /**
   * The mode in which to run the preview command. Can be either "development" or "production".
   * @default ctx.isProd ? "production" : "development"
   */
  mode?: "development" | "production" | undefined;
} & CommonOptions) => Promise<void>> = task("Running vp build", async (ctx, {
  watch = false,
  mode = ctx.isProd ? "production" : "development",
  ...options
} = {}) => {
  const args = ["build", "--mode", mode];
  if (watch) {
    args.push("--watch");
  }
  await runWithArgs.orig(ctx, { stderr: true, ...options, args });
});

/**
 * Run the vp pack command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp pack command.
 */
export const pack: Task<(ctx: Ctx, options?: undefined | {
  /**
   * Whether to watch for file changes and rebuild automatically.
   * @default false
   */
  watch?: boolean | undefined;
  /**
   * The mode in which to run the preview command. Can be either "development" or "production".
   * @default ctx.isProd ? "production" : "development"
   */
  mode?: "development" | "production" | undefined;
} & CommonOptions) => Promise<void>> = task("Running vp pack", async (ctx, {
  watch = false,
  mode = ctx.isProd ? "production" : "development",
  ...options
} = {}) => {
  const args = ["pack", "--mode", mode];
  if (watch) {
    args.push("--watch");
  }
  await runWithArgs.orig(ctx, { stderr: true, ...options, args });
});

/**
 * Run the vp preview command with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the vp preview command.
 */
export const preview: Task<(ctx: Ctx, options?: undefined | {
  /**
   * Whether to watch for file changes and rebuild automatically.
   * @default false
   */
  watch?: boolean | undefined;
  /**
   * The mode in which to run the preview command. Can be either "development" or "production".
   * @default ctx.isProd ? "production" : "development"
   */
  mode?: "development" | "production" | string;
} & CommonOptions) => Promise<void>> = task("Running vp preview", async (ctx, {
  watch = false,
  mode = ctx.isProd ? "production" : "development",
  ...options
} = {}) => {
  const args = ["preview", "--mode", mode];
  if (watch) {
    args.push("--watch");
  }
  await runWithArgs.orig(ctx, { ...options, args });
});

