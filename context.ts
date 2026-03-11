import type { Options } from "execa";
import * as colors from "fmt/colors";
import { writeAllSync } from "io";

/** A text encoder for encoding strings to bytes. */
const textEncoder: TextEncoder = new TextEncoder();

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
};

/** A context for running tasks. Provides utilities for output formatting and context management. */
export class Ctx {
  /** The parent context of this sub-context. This is used to format lines with the parent context's formatting. */
  #parent: Ctx | undefined;
  /** The name of this sub-context. This is used for example to remember the task name. */
  #name: string;
  /** The prefix for all lines printed in this sub-context. */
  #prefix: string;
  /** The timestamp when this context was created. */
  #createdAt: number;
  /** Whether to suppress the command output in the console. */
  silent: boolean | undefined;

  constructor({
    prefix = "",
    silent = undefined,
    name = "",
  }: CtxOptions = {}, parent: Ctx | undefined = undefined) {
    this.#parent = parent;
    this.#prefix = prefix;
    this.#name = name;
    this.silent = silent;
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
   * Creates a sub-context with the specified prefix.
   * Outputs all lines with the sub-context prefix as a prefix.
   * @param prefix - The prefix for the sub-context.
   * @returns The created sub-context.
   */
  subCtx(options: CtxOptions): Ctx {
    return new Ctx(options, this);
  }

  /**
   * Starts a task with the specified name and returns a sub-context for the task. The task is marked as started in the console.
   * @param name - The name of the task.
   * @returns The sub-context for the task.
   */
  #startTask(options: CtxOptions): Ctx {
    if (options.name === undefined || options.name === "") throw new Error("Function must have a name or be provided with one.");
    this.print(`${colors.blue("⯈")} Start ${options.name}`);
    return this.subCtx({ prefix: "  ", ...options });
  }

  /**
   * Marks the task as successfully completed and prints the time taken to complete the task.
   */
  #endTaskSuccess(): void {
    if (this.parent === undefined) throw new Error("Cannot end task in root context.");
    const time = (Date.now() - this.#createdAt) / 1000;
    this.parent.print(`${colors.green("✓")} Finished ${this.name} in ${time.toFixed(2)} s`);
  }

  /**
   * Marks the task as failed and prints the time taken to complete the task along with the error message.
   * @param error - The error that caused the task to fail.
   */
  #endTaskFailure(error: unknown): void {
    if (this.parent === undefined) throw new Error("Cannot end task in root context.");
    const time = (Date.now() - this.#createdAt) / 1000;
    this.parent.print(`${colors.red("𐄂")} ${this.name} failed in ${time.toFixed(2)} s:\n  ${error}`);
  }

  /**
   * Runs a task with the specified name and function.
   * @param name - The name of the task.
   * @param fn - The function to run as the task.
   * @returns The result of the task function.
   */
  runTask<T>(options: CtxOptions, fn: (ctx: Ctx) => T): T {
    if (options.name === undefined) options.name = fn.name;
    const ctx = this.#startTask(options);
    try {
      const result = fn(ctx);
      ctx.#endTaskSuccess();
      return result;
    } catch (error) {
      ctx.#endTaskFailure(error);
      throw error;
    }
  }

  /**
   * Runs an asynchronous task with the specified name and function.
   * @param name - The name of the task.
   * @param fn - The asynchronous function to run as the task.
   * @returns A promise that resolves to the result of the task function.
   */
  async runTaskAsync<T>(options: CtxOptions, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
    if (options.name === undefined) options.name = fn.name;
    const ctx = this.#startTask(options);
    try {
      const result = await fn(ctx);
      ctx.#endTaskSuccess();
      return result;
    } catch (error) {
      ctx.#endTaskFailure(error);
      throw error;
    }
  }

  /** The parent context of this sub-context. */
  get parent(): Ctx | undefined {
    return this.#parent;
  }

  /** The prefix for this sub-context. */
  get prefix(): string {
    return this.#prefix;
  }

  /** Whether to suppress the command output in the console. */
  get isSilent(): boolean {
    return this.silent ?? this.parent?.isSilent ?? false;
  }

  /**
   * Returns the verbose option for execa based on the silent flag.
   * @returns The verbose option for execa. If silent is true, it returns undefined, which means that execa will not print the command output to the console. If silent is false, it returns a function that formats lines using the context's formatLine method, which means that execa will print the command output to the console using the context's formatting.
   */
  execaVerbose(): Options["verbose"] {
    if (this.silent) {
      return "none";
    }
    return (_line, object) => {
      switch (object.type) {
        case "command":
          return this.formatLine(colors.gray("⯈ " + object.message));
        case "ipc":
          return this.formatLine(colors.yellow("🡘 ") + object.message);
        case "output":
          return this.formatLine(object.message);
        case "error":
          return this.formatLine(colors.red(object.message));
        case "duration":
          return undefined;
      }
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

/**
 * A decorator function that wraps a task function to automatically run it as a task in the context.
 * @param fn - The task function to wrap. This function should take a context as its first argument and return a promise.
 * @returns A new function that wraps the original function and runs it as a task in the context.
 */
export function task<A extends unknown[], R>(fn: (ctx: Ctx, ...args: A) => Promise<R>): (ctx: Ctx, ...args: A) => Promise<R>;
/**
 * A decorator function that wraps a task function to automatically run it as a task in the context with a specified name.
 * @param name - The name of the task. This will be used as the task name when running the task in the context.
 * @param fn - The task function to wrap. This function should take a context as its first argument and return a promise.
 * @returns A new function that wraps the original function and runs it as a task in the context with the specified name.
 */
export function task<A extends unknown[], R>(name: string, fn: (ctx: Ctx, ...args: A) => Promise<R>): (ctx: Ctx, ...args: A) => Promise<R>;
/**
 * A decorator function that wraps a task function to automatically run it as a task in the context with specified options.
 * @param options - The options for the task context.
 * @param fn - The task function to wrap.
 * @returns A new function that wraps the original function and runs it as a task in the context with the specified options.
 */
export function task<A extends unknown[], R>(options: CtxOptions, fn: (ctx: Ctx, ...args: A) => Promise<R>): (ctx: Ctx, ...args: A) => Promise<R>;
export function task<A extends unknown[], R>(...args: [CtxOptions, (ctx: Ctx, ...args: A) => Promise<R>] | [string, (ctx: Ctx, ...args: A) => Promise<R>] | [(ctx: Ctx, ...args: A) => Promise<R>]): (ctx: Ctx, ...args: A) => Promise<R> {
  const [options, fn] = args.length === 2 ? [typeof args[0] === "string" ? { name: args[0] } : args[0], args[1]] : [{ name: args[0].name }, args[0]];
  return async function (ctx, ...args) {
    return await ctx.runTaskAsync(options, (ctx) => fn(ctx, ...args));
  };
}
