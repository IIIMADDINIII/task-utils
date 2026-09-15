import * as colors from "@std/fmt/colors";
import { writeAllSync } from "@std/io";
import { resolve } from "@std/path";
import { ExecaError, ExecaSyncError, type Options, type VerboseObject } from "execa";
import { relative } from "node:path";
import { getCallSites } from "node:util";
import { cached, type ExecaCommonOptions, resolvePackageLocation } from "./utils.ts";

export class TaskError extends Error {
  constructor(task: string, cause: unknown) {
    super(`Task Failed due to a sub task ${task} failing.`, { cause });
  }
}

/** A text encoder for encoding strings to bytes. */
const textEncoder: TextEncoder = new TextEncoder();

type SrcLocation = {
  path: string;
  line: number;
};

/** Options for creating a new context. */
export type CtxOptions = {
  /**
   * Prefix for all lines printed in this context. This is used to distinguish lines printed in different contexts.
   * @default ""
   */
  prefix?: string | undefined;
  /**
   * Whether to suppress the command output in the console. If true, the command will be executed without printing the command and its output to the console.
   * undefined means that the context will inherit the silent flag from its parent context, or be false if it has no parent context.
   * @default undefined
   */
  silent?: boolean | undefined;
  /**
   * Name of the Context. This is used for logging purposes.
   * @default ""
   */
  name?: string | undefined;
  /**
   * The source path associated with this context. This is typically the path to the file which contains the function for this context.
   * @default undefined
   */
  srcLocation?: SrcLocation | undefined;
  /**
   * Indicates whether the context is in production mode.
   * @default false
   */
  prod?: boolean | undefined;
};

/**
 * Gets the default source location from the provided or automatically obtained call sites.
 * @param callSites - The call sites to use for determining the source location. If not provided, the call sites will be obtained automatically.
 * @returns The default source location based on the provided or obtained call sites.
 */
function getDefaultSrcLocation(callSites?: ReturnType<typeof getCallSites> | undefined): SrcLocation {
  const cs = callSites ?? getCallSites(3).slice(1);
  if (cs.length < 2) throw new Error("Failed to get call site of the caller.");
  return { path: cs[1].scriptName, line: cs[1].lineNumber };
}

/**
 * Applies the default source location to the given context options if it is not already set.
 * Modifies the given context options object by setting its `srcLocation` property if it is not already set.
 * @param options - The context options to apply the default source location to.
 * @param callSites - The call sites to use for determining the source location. If not provided, the call sites will be obtained automatically.
 */
function applyDefaultSrcLocation(options: CtxOptions, callSites?: ReturnType<typeof getCallSites> | undefined): void {
  if (options.srcLocation === undefined) {
    const cs = callSites ?? getCallSites(3).slice(1);
    if (cs.length < 2) throw new Error("Failed to get call site of the caller.");
    options.srcLocation = getDefaultSrcLocation(cs);
  }
}

/** A context for running tasks. Provides utilities for output formatting and context management. */
export class Ctx {
  static readonly JSR_URL = "https://jsr.io/";
  static readonly URL_PREFIX = "http";

  /**
   * Runs a task function with the specified context options and arguments. 
   * This is the main entry point for running tasks in this utility. 
   * It creates a new context with the specified options, runs the task function with the context and arguments, and handles any errors that occur during the execution of the task.
   * @param task - The task function to run. This function should take a context as its first argument and return a promise.
   * @param options - The options for the context. This includes the prefix for lines printed in the context, whether to suppress command output, and the name of the context.
   * @param args - The arguments to pass to the task function after the context.
   */
  static run<T extends unknown[]>(task: (ctx: Ctx, ...args: T) => Promise<unknown>, options: CtxOptions = {}, ...args: T): void {
    const callSites = getCallSites(3);
    if (callSites.length > 2) throw new Error(`Call the run method from the main script directly. (example: if (import.meta.main) Ctx.run(...);)`);
    applyDefaultSrcLocation(options, callSites);
    const ctx = new Ctx(options);
    task(ctx, ...args).then(() => {
      Deno.exit(0);
    }).catch((e) => {
      if (!(e instanceof TaskError)) {
        throw e;
      }
      Deno.exit(0);
    });
  }

  /** The parent context of this sub-context. This is used to format lines with the parent context's formatting. */
  #parent: Ctx | undefined;
  /** The main context of this sub-context. This is used to access the root context from any sub-context. */
  #mainContext: Ctx;
  /** The name of this sub-context. This is used for example to remember the task name. */
  #name: string;
  /** The prefix for all lines printed in this sub-context. */
  #prefix: string;
  /** The source path associated with this context. This is typically the path to the file which contains the function for this context. */
  #srcLocation: SrcLocation;
  /** The timestamp when this context was created. */
  #createdAt: number;
  /** Indicates whether the context is in production mode. */
  #prod: boolean | undefined;
  /** Whether to suppress the command output in the console. */
  #silent: boolean | undefined;

  constructor({
    prefix = "",
    silent = undefined,
    name = "",
    prod = undefined,
    srcLocation = undefined,
  }: CtxOptions = {}, parent: Ctx | undefined = undefined) {
    this.#parent = parent;
    this.#mainContext = parent?.mainContext ?? this;
    this.#prefix = prefix;
    this.#name = name;
    if (srcLocation === undefined) srcLocation = getDefaultSrcLocation();
    this.#srcLocation = srcLocation;
    this.#silent = silent;
    this.#prod = prod;
    this.#createdAt = Date.now();
  }

  /**
   * Formats a line of text for printing.
   * @param line - The line of text to format.
   * @returns The formatted line.
   */
  formatLine(line: string): string {
    if (this.#parent !== undefined) return this.#parent.formatLine(this.#prefix + line);
    return this.#prefix + line;
  }

  /**
   * Formats a duration in milliseconds to a human-readable string.
   * @param duration - The duration in milliseconds to format.
   * @returns The formatted duration string.
   */
  formatDuration(duration: number): string {
    if (duration < 1000) return `${duration.toFixed(2)} ms`;
    if (duration < 60 * 1000) return `${(duration / 1000).toFixed(2)} s`;
    if (duration < 60 * 60 * 1000) return `${(duration / (60 * 1000)).toFixed(2)} min`;
    return `${(duration / (60 * 60 * 1000)).toFixed(2)} h`;
  }

  /**
   * Formats a string or array of strings to be printed to the Console.
   * @param lines - The string or array of strings to format.
   * @returns The formatted string.
   */
  formatLines(lines: string | string[]): string {
    if (Array.isArray(lines)) lines = lines.join("\n");
    return lines.split("\n").map((line) => this.formatLine(line) + "\n").join("");
  }

  /**
   * Prints a string to the Console.
   * @param string - The string to print.
   */
  print(string: string): void {
    if (this.isSilent) return;
    writeAllSync(Deno.stdout, textEncoder.encode(this.formatLines(string)));
  }

  /**
   * Inspects a value and prints it to the console.
   * @param value - The value to inspect.
   * @param inspectOptions - Optional inspection options.
   */
  inspect(value: unknown, inspectOptions?: Deno.InspectOptions | undefined): void;
  /**
   * Inspects a value with an optional description and prints it to the console.
   * @param value - The value to inspect.
   * @param description - A description for the value being inspected.
   * @param inspectOptions - Optional inspection options.
   */
  inspect(value: unknown, description: string, inspectOptions?: Deno.InspectOptions | undefined): void;
  inspect(value: unknown, descriptionOrInspectOptions?: string | Deno.InspectOptions | undefined, inspectOptions?: Deno.InspectOptions | undefined): void {
    if (this.isSilent) return;
    const description = typeof descriptionOrInspectOptions === "string" ? descriptionOrInspectOptions : undefined;
    inspectOptions = typeof descriptionOrInspectOptions === "object" ? descriptionOrInspectOptions : inspectOptions;
    if (description !== undefined) return this.print(description + ": " + Deno.inspect(value, inspectOptions));
    this.print(Deno.inspect(value, inspectOptions));
  }

  /**
   * Creates a sub-context with the specified prefix.
   * Outputs all lines with the sub-context prefix as a prefix.
   * @param prefix - The prefix for the sub-context.
   * @returns The created sub-context.
   */
  subCtx(options: CtxOptions): Ctx {
    applyDefaultSrcLocation(options);
    return new Ctx(options, this);
  }

  /**
   * Starts a task with the specified name and returns a sub-context for the task. The task is marked as started in the console.
   * @param name - The name of the task.
   * @returns The sub-context for the task.
   */
  #startTask(options: CtxOptions): Ctx {
    if (options.name === undefined || options.name === "") throw new Error("Function must have a name or be provided with one.");
    const srcLocation = options.srcLocation;
    if (srcLocation === undefined) throw new Error("Source location is required.");
    let path = srcLocation.path;
    const lowerPath = path.toLocaleLowerCase();
    if (lowerPath.startsWith(Ctx.URL_PREFIX)) {
      if (lowerPath.startsWith(Ctx.JSR_URL)) path = "jsr:" + path.substring(Ctx.JSR_URL.length);
    } else {
      path = relative(Deno.cwd(), path);
    }
    this.print(colors.blue(`⯈ ${options.name} Started ${colors.dim(`(${path}:${srcLocation.line})`)}`));
    return this.subCtx({ prefix: "  ", ...options });
  }

  /**
   * Marks the task as successfully completed and prints the time taken to complete the task.
   */
  #endTaskSuccess(): void {
    if (this.parent === undefined) throw new Error("Cannot end task in root context.");
    const time = (Date.now() - this.#createdAt) / 1000;
    this.parent.print(colors.green(`✓ ${this.name} Finished in ${time.toFixed(2)} s`));
  }

  /**
   * Marks the task as failed and prints the time taken to complete the task along with the error message.
   * @param error - The error that caused the task to fail.
   */
  #endTaskFailure(error: unknown): never {
    if (this.parent === undefined) throw new Error("Cannot end task in root context.");
    const time = (Date.now() - this.#createdAt) / 1000;
    if (!(error instanceof TaskError)) {
      this.parent.print(colors.red(`🖣 Error during execution of ${this.name}:`));
      if (error instanceof ExecaError || error instanceof ExecaSyncError) {
        this.print(colors.red(`${error.shortMessage}`));
      } else {
        this.print(colors.red(`${error}`));
      }
    }
    this.parent.print(colors.red(`𐄂 ${this.name} Failed in ${time.toFixed(2)} s.`));
    throw new TaskError(this.name, error);
  }

  /**
   * Runs a task with the specified name and function.
   * @param name - The name of the task.
   * @param fn - The function to run as the task.
   * @returns The result of the task function.
   */
  runTask<T>(options: CtxOptions, fn: (ctx: Ctx) => T): T {
    if (options.name === undefined) options.name = fn.name;
    applyDefaultSrcLocation(options);
    const ctx = this.#startTask(options);
    try {
      const result = fn(ctx);
      ctx.#endTaskSuccess();
      return result;
    } catch (error) {
      ctx.#endTaskFailure(error);
    }
    throw "This never happens, but Deno doesn't know that.";
  }

  /**
   * Runs an asynchronous task with the specified name and function.
   * @param name - The name of the task.
   * @param fn - The asynchronous function to run as the task.
   * @returns A promise that resolves to the result of the task function.
   */
  async runTaskAsync<T>(options: CtxOptions, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
    if (options.name === undefined) options.name = fn.name;
    applyDefaultSrcLocation(options);
    const ctx = this.#startTask(options);
    try {
      const result = await fn(ctx);
      ctx.#endTaskSuccess();
      return result;
    } catch (error) {
      ctx.#endTaskFailure(error);
    }
    throw "This never happens, but Deno doesn't know that.";
  }

  /** The parent context of this sub-context. */
  get parent(): Ctx | undefined {
    return this.#parent;
  }

  /** The main context of this sub-context. */
  get mainContext(): Ctx {
    return this.#mainContext;
  }

  /** The prefix for this sub-context. */
  get prefix(): string {
    return this.#prefix;
  }

  /** The source location of this sub-context. */
  get srcLocationPath(): string {
    return this.#srcLocation?.path;
  }

  /** The line number of the source location of this sub-context. */
  get srcLocationLine(): number {
    return this.#srcLocation?.line;
  }

  /** Whether to suppress the command output in the console. */
  @cached()
  get isSilent(): boolean {
    return this.#silent ?? this.parent?.isSilent ?? false;
  }

  /** Silent version of this context. Returns a new Context mostly identical but with the silent flag set to true. */
  @cached()
  get silent(): Ctx {
    return this.subCtx({ silent: true, srcLocation: this.#srcLocation });
  }

  /** Whether the context is in production mode. */
  @cached()
  get isProd(): boolean {
    return this.#prod ?? this.parent?.isProd ?? false;
  }

  /** Production version of this context. Returns a new Context mostly identical but with the production flag set to true. */
  @cached()
  get prod(): Ctx {
    return this.subCtx({ prod: true, srcLocation: this.#srcLocation });
  }

  /**
   * Formats the message from execa based on its source and type.
   * @param source The source of the message, can be "all", "stdout", "stderr", or "ipc".
   * @param object The minimal verbose object containing the message and its type.
   * @returns The formatted message string, or undefined if the message should not be displayed.
   */
  #execaMessage(source: "all" | "stdout" | "stderr" | "ipc", object: VerboseObject): string | undefined {
    switch (object.type) {
      case "command":
        return this.formatLine(colors.gray(colors.dim("⯈ ") + object.message));
      case "ipc":
        return this.formatLine(colors.yellow(colors.dim("🡘 ") + object.message));
      case "output":
        if (source === "stderr") return this.formatLine(colors.red(colors.dim("⚠ ") + object.message));
        return this.formatLine("> " + object.message);
      case "error":
        return this.formatLine(colors.red(colors.dim("𐄂 ") + object.message));
      case "duration":
        return undefined;
    }
  }

  /**
   * Returns the verbose option for execa based on the silent flag.
   * @returns The verbose option for execa. If silent is true, it returns undefined, which means that execa will not print the command output to the console. If silent is false, it returns a function that formats lines using the context's formatLine method, which means that execa will print the command output to the console using the context's formatting.
   */
  @cached()
  get execaVerbose(): Options["verbose"] {
    return {
      all: (_line, object) => this.#execaMessage("all", object),
      stdout: (_line, object) => this.#execaMessage("stdout", object),
      stderr: (_line, object) => this.#execaMessage("stderr", object),
      ipc: (_line, object) => this.#execaMessage("ipc", object)
    };
  }

  /** The location of the package containing the mise.toml file for this context. */
  @cached()
  get packageLocation(): string {
    const resolveInParentContext = () => {
      if (this.#parent === undefined) throw new Error("Could not locate Package Location. Make sure there is a mise.toml file at the package location.");
      return this.#parent.packageLocation;
    };
    const path = this.#srcLocation.path;
    if (path.toLocaleLowerCase().startsWith(Ctx.URL_PREFIX)) return resolveInParentContext();
    const resolved = resolvePackageLocation(path);
    if (resolved === undefined) return resolveInParentContext();
    return resolved;
  }

  /**
   * Resolves the current working directory for the execa command.
   * @param cwd - The current working directory for the execa command. If not specified, it uses the package location of the context.
   * @returns The resolved current working directory for the execa command.
   */
  execaCwd(cwd?: string | undefined): string {
    if (cwd === undefined) return this.packageLocation;
    return resolve(cwd);
  }

  /** Returns the environment variables for the execa command, including the NODE_ENV based on the production flag. */
  execaEnv(env?: Readonly<Partial<Record<string, string>>> | undefined): Record<string, string> {
    return {
      NODE_ENV: this.isProd ? "production" : "development",
      ...env,
    };
  }

  /**
   * Resolves the execa options for the command, including the current working directory, environment variables, and verbosity settings.
   * @param options - The options for the execa command.
   * @returns The resolved execa options including the current working directory, environment variables, and verbosity settings.
   */
  execaOptions(options: ExecaCommonOptions): {} {
    return {
      cwd: this.execaCwd(options.cwd),
      env: this.execaEnv(options.env),
      verbose: this.execaVerbose,
    };
  }

  /** The name of the context. */
  get name(): string {
    return this.#name;
  }

  /** The timestamp when this context was created. */
  get createdAt(): number {
    return this.#createdAt;
  }
}

/** Type of the function returned by the task function. */
// deno-lint-ignore no-explicit-any
export type Task<F extends (ctx: Ctx, ...args: any[]) => Promise<any>> = F & {
  /**
   * The underlying function implementation without the Task wrapper.
   * Use this method when you want to call the original function implementation directly, bypassing any task-related behavior.
   * This way the any output related to the task (start message, end message and timing) will be bypassed.
   * @param ctx The context in which the task is run.
   * @param args The arguments passed to the task function.
   */
  orig: F;
};;

/**
 * A decorator function that wraps a task function to automatically run it as a task in the context.
 * @param fn - The task function to wrap. This function should take a context as its first argument and return a promise.
 * @returns A new function that wraps the original function and runs it as a task in the context.
 */
export function task<A extends unknown[], R>(fn: (ctx: Ctx, ...args: A) => Promise<R>): Task<(ctx: Ctx, ...args: A) => Promise<R>>;
/**
 * A decorator function that wraps a task function to automatically run it as a task in the context with a specified name.
 * @param name - The name of the task. This will be used as the task name when running the task in the context.
 * @param fn - The task function to wrap. This function should take a context as its first argument and return a promise.
 * @returns A new function that wraps the original function and runs it as a task in the context with the specified name.
 */
export function task<A extends unknown[], R>(name: string, fn: (ctx: Ctx, ...args: A) => Promise<R>): Task<(ctx: Ctx, ...args: A) => Promise<R>>;
/**
 * A decorator function that wraps a task function to automatically run it as a task in the context with specified options.
 * @param options - The options for the task context.
 * @param fn - The task function to wrap.
 * @returns A new function that wraps the original function and runs it as a task in the context with the specified options.
 */
export function task<A extends unknown[], R>(options: CtxOptions, fn: (ctx: Ctx, ...args: A) => Promise<R>): Task<(ctx: Ctx, ...args: A) => Promise<R>>;
export function task<A extends unknown[], R>(...args: [CtxOptions, (ctx: Ctx, ...args: A) => Promise<R>] | [string, (ctx: Ctx, ...args: A) => Promise<R>] | [(ctx: Ctx, ...args: A) => Promise<R>]): Task<(ctx: Ctx, ...args: A) => Promise<R>> {
  const [options, fn] = args.length === 2 ? [typeof args[0] === "string" ? { name: args[0] } : args[0], args[1]] : [{ name: args[0].name }, args[0]];
  applyDefaultSrcLocation(options);
  async function taskFn(ctx: Ctx, ...args: A): Promise<R> {
    return await ctx.runTaskAsync(options, (ctx) => fn(ctx, ...args));
  }
  taskFn.orig = fn;
  return taskFn;
}