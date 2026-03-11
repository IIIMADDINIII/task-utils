import { Options } from "execa";
import * as colors from "fmt/colors";
import { writeAllSync } from "io";

/** A text encoder for encoding strings to bytes. */
const textEncoder: TextEncoder = new TextEncoder();

/** A context for running tasks. Provides utilities for output formatting and context management. */
export abstract class Ctx {
  /** Whether to suppress the command output in the console. */
  #silent: boolean;

  constructor(silent: boolean = false) {
    this.#silent = silent;
  }

  /**
   * Formats a line of text for printing.
   * @param line - The line of text to format.
   * @returns The formatted line.
   */
  abstract formatLine(line: string): string;

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
    if (this.silent) return;
    writeAllSync(Deno.stdout, textEncoder.encode(this.formatLines(string)));
  }

  /**
   * Creates a sub-context with the specified prefix.
   * Outputs all lines with the sub-context prefix as a prefix.
   * @param prefix - The prefix for the sub-context.
   * @returns The created sub-context.
   */
  subCtx(prefix: string): SubCtx {
    return new SubCtx(this, prefix);
  }

  /**
   * Creates a task context with the specified name.
   * @param name - The name of the task context.
   * @returns The created task context.
   */
  taskCtx(name: string): TaskCtx {
    return new TaskCtx(this, name);
  }

  /**
   * Runs a task with the specified name and function.
   * @param name - The name of the task.
   * @param fn - The function to run as the task.
   * @returns The result of the task function.
   */
  runTask<T>(name: string, fn: (ctx: TaskCtx) => T): T {
    const task = this.taskCtx(name);
    try {
      const result = fn(task);
      task.endSuccess();
      return result;
    } catch (error) {
      task.endFailure(error);
      throw error;
    }
  }

  /**
   * Runs an asynchronous task with the specified name and function.
   * @param name - The name of the task.
   * @param fn - The asynchronous function to run as the task.
   * @returns A promise that resolves to the result of the task function.
   */
  async runTaskAsync<T>(name: string, fn: (ctx: TaskCtx) => Promise<T>): Promise<T> {
    const task = this.taskCtx(name);
    try {
      const result = await fn(task);
      task.endSuccess();
      return result;
    } catch (error) {
      task.endFailure(error);
      throw error;
    }
  }

  /** Whether to suppress the command output in the console. */
  get silent(): boolean {
    return this.#silent;
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
          return "";
      }
      return;
    };
  }
}

/** The main context for running tasks. This is the default context that can be used to run tasks without creating a sub-context. */
export class MainCtx extends Ctx {
  override formatLine(line: string): string {
    return line;
  }
}

/** A sub-context that can be used to group related tasks together. All lines printed in a sub-context will be prefixed with the sub-context name. */
export class SubCtx extends Ctx {
  /** The parent context of this sub-context. This is used to format lines with the parent context's formatting. */
  #parent: Ctx;
  /** The name of this sub-context. This is used as a prefix for all lines printed in this sub-context. */
  #prefix: string;

  constructor(parent: Ctx, prefix: string) {
    super();
    this.#parent = parent;
    this.#prefix = prefix;
  }

  override formatLine(line: string): string {
    return this.#parent.formatLine(this.#prefix + line);
  }

  /** The parent context of this sub-context. */
  get parent(): Ctx {
    return this.#parent;
  }

  /** The prefix for this sub-context. */
  get prefix(): string {
    return this.#prefix;
  }
}

/** A context for running a specific task. */
export class TaskCtx extends SubCtx {
  /** The start time of the task. */
  #startTime: number;
  /** The name of the task. */
  #name: string;

  constructor(parent: Ctx, name: string) {
    super(parent, "  ");
    this.parent.print(`${colors.blue("⯈")} Start ${name}`);
    this.#name = name;
    this.#startTime = Date.now();
  }

  /**
   * Marks the task as successfully completed and prints the time taken to complete the task.
   */
  endSuccess(): void {
    const time = (Date.now() - this.#startTime) / 1000;
    this.parent.print(`${colors.green("✓")} Finished ${this.name} in ${time.toFixed(2)} s`);
  }

  /**
   * Marks the task as failed and prints the time taken to complete the task along with the error message.
   * @param error - The error that caused the task to fail.
   */
  endFailure(error: unknown): void {
    const time = (Date.now() - this.#startTime) / 1000;
    this.parent.print(`${colors.red("𐄂")} ${this.name} failed in ${time.toFixed(2)} s:\n  ${error}`);
  }

  /** The name of the task. */
  get name(): string {
    return this.#name;
  }

  /** The start time of the task. */
  get startTime(): number {
    return this.#startTime;
  }
}

/**
 * A decorator function that wraps a task function to automatically run it as a task in the context.
 * @param fn - The task function to wrap. This function should take a context as its first argument and return a promise.
 * @returns A new function that wraps the original function and runs it as a task in the context.
 */
export function task<A extends unknown[], R>(fn: (ctx: TaskCtx, ...args: A) => Promise<R>): (ctx: Ctx, ...args: A) => Promise<R>;
/**
 * A decorator function that wraps a task function to automatically run it as a task in the context with a specified name.
 * @param name - The name of the task. This will be used as the task name when running the task in the context.
 * @param fn - The task function to wrap. This function should take a context as its first argument and return a promise.
 * @returns A new function that wraps the original function and runs it as a task in the context with the specified name.
 */
export function task<A extends unknown[], R>(name: string, fn: (ctx: TaskCtx, ...args: A) => Promise<R>): (ctx: Ctx, ...args: A) => Promise<R>;
export function task<A extends unknown[], R>(...args: [string, (ctx: TaskCtx, ...args: A) => Promise<R>] | [(ctx: TaskCtx, ...args: A) => Promise<R>]): (ctx: Ctx, ...args: A) => Promise<R> {
  const [name, fn] = args.length === 2 ? args : [args[0].name, args[0]];
  if (name === "") throw new Error("Function must have a name or be provided with one.");
  return async function (ctx, ...args) {
    return await ctx.runTaskAsync(name, (ctx) => fn(ctx, ...args));
  };
}
