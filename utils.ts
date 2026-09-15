import { existsSync } from "@std/fs";
import { dirname, join, normalize, SEPARATOR } from "@std/path";

/**
 * Decorator to cache the result of a getter method.
 * Caches the result of the getter method after the first call.
 * @returns the decorator function to decorate the getter method.
 */
export function cached<This extends WeakKey, Value>(): (target: (this: This) => Value, context: ClassGetterDecoratorContext<This, Value>) => (this: This) => Value {
  return function (target, _context) {
    const cache: WeakMap<This, Value> = new WeakMap();
    return function (this: This): Value {
      return cache.getOrInsertComputed(this, () => target.call(this));
    };
  };
}

/** Common options for execa commands. */
export type ExecaCommonOptions = {
  /** 
   * The current working directory for the command. 
   * If not specified, it uses the location of the package where the Task is defined which triggers the command.
   */
  cwd?: string | undefined;
  /**
   * The environment variables for the command.
   * Extends the current env variables of the process.
   */
  env?: Readonly<Partial<Record<string, string>>> | undefined;
};

/** Cache for resolved package locations. */
const packageLocationCache: Map<string, string | undefined> = new Map();

/**
 * Given a directory, figure out where the closest package location (containing a mise.toml file) is.
 * @param dir - The starting directory to search for the closest package location.
 * @returns The path to the closest package location containing a mise.toml file, or undefined if none is found.
 */
export function resolvePackageLocation(dir: string): string | undefined {
  dir = normalize(dir);
  return packageLocationCache.getOrInsertComputed(dir, () => {
    if (dir.toLocaleLowerCase().split(SEPARATOR).includes("node_modules")) return undefined;
    if (existsSync(join(dir, "mise.toml"), { isReadable: true, isFile: true })) return dir;
    return resolvePackageLocation(dirname(dir));
  });
}
