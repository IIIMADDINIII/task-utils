import { execa } from "execa";
import { type Ctx, task } from "./context.ts";

/**
 * Runs a raw pnpm command with the specified arguments.
 * @param ctx - The context for the task.
 * @param args - The command-line arguments for the pnpm command.
 * @returns - A promise resolving to the stdout of the pnpm command.
 */
export const runWithArgs: (ctx: Ctx, args: string[]) => Promise<string> = task("Running pnpm command", async (ctx, args) => {
  return (await execa({ verbose: ctx.execaVerbose() })`pnpm ${args}`).stdout;
});

/** Configuration options for pnpm operations. */
export type PnpmConfig = {
  /**
   * Whether to confirm the purge of modules when installing dependencies.
   * Setting this to false will skip the confirmation prompt and automatically purge modules if necessary.
   * This can be useful in CI environments or when you want to ensure a clean installation without manual intervention.
   */
  confirmModulesPurge?: boolean | undefined;
  /**
   * Additional configuration options for pnpm can be added here as needed..
   */
  [option: string]: string | boolean | undefined;
};

/**
 * Generates an array of command-line flags for pnpm based on the provided configuration.
 * @param config - The configuration options for pnpm operations.
 * @returns An array of command-line flags to be used with pnpm commands.
 */
export function makeConfigFlags(config: PnpmConfig): string[] {
  const ret: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    switch (typeof value) {
      case "undefined":
        continue;
      case "string":
      case "boolean":
        ret.push(`--config.${key}=${value}`);
        break;
      default:
        value satisfies never;
    }
  }
  return ret;
}

/**
 * Run `pnpm install` with the specified options.
 * @param ctx - The context for the task.
 * @param options - The options for the install operation. config.confirmModulesPurge will be set to false by default, which means that if pnpm needs to purge modules during installation, it will do so without asking for confirmation.
 */
export const install: (
  ctx: Ctx,
  options?: {
    /**
     * Whether to use the frozen lockfile. Use this option to ensure a reproducible installation during CI builds.
     * @default false
     */
    frozenLockfile?: boolean;
    /**
     * The configuration options for pnpm operations.
     * @default { confirmModulesPurge: false }
     */
    config?: PnpmConfig;
  } | undefined,
) => Promise<void> = task("Installing pnpm dependencies", async (ctx, {
  frozenLockfile = false,
  config = { confirmModulesPurge: false },
} = {}): Promise<void> => {
  const args: string[] = [];
  if (frozenLockfile) args.push("--frozen-lockfile");
  await runWithArgs(ctx, ["install", ...args, ...makeConfigFlags(config)]);
});
