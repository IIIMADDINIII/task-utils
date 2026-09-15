
import { exists } from "@std/fs";
import { resolve } from "@std/path/resolve";
import { execa } from "execa";
import { type Ctx, task, type Task } from "./context.ts";
import type { ExecaCommonOptions } from "./utils.ts";

/** Common options for executing lit tasks. */
export type CommonOptions = ExecaCommonOptions;

/**
 * Runs a raw lit-localize command with the specified arguments.
 * @param ctx - The context for the task.
 * @param options - The options containing the command-line arguments for the lit-localize command.
 * @returns - A promise resolving to the stdout of the lit-localize command.
 */
export const runWithArgs: Task<(ctx: Ctx, options: {
  /** The command-line arguments for the lit-localize command. */
  args: string[];
} & CommonOptions) => Promise<string>> = task("Running vp command", async (ctx, { args, ...options }) => {
  const ret = await execa({ preferLocal: true, ...ctx.execaOptions(options), })`pnpm exec lit-localize  ${args}`;
  if (ret.stderr.length > 0) throw new Error("lit-localize had an warning during execution.");
  return ret.stdout;
});

/**
 * Runs the lit-localize command using the specified configuration.
 * @param ctx - The context for the task.
 * @param options - The options containing the configuration file and command-line arguments for the lit-localize command.
 * @returns - A promise resolving to the stdout of the lit-localize command.
 */
export const runWithConfigFile: Task<(ctx: Ctx, options: {
  /** 
   * Configurations for the lit-localize command. Relative Paths are relative to baseDir.
   * @see https://lit.dev/docs/localization/cli-and-config/#config-file
   */
  config: ConfigFile;
  /** The command-line arguments for the lit-localize command. */
  args: string[];
} & CommonOptions) => Promise<string>> = task("Running lit-localize with config file", async (ctx, {
  config,
  ...options
}) => {
  const cwd = ctx.execaCwd(options.cwd);
  // Find a local file name which is not used.
  let counter = 0;
  let configFile = "lit-localize.json";
  let configPath: string;
  while (true) {
    configPath = resolve(cwd, configFile);
    if (!await exists(configPath)) break;
    counter++;
    configFile = `lit-localize.${counter}.json`;
  }
  await Deno.writeFile(configPath, new TextEncoder().encode(JSON.stringify(config)));
  try {
    return await runWithArgs.orig(ctx, { ...options, cwd, args: [...options.args, "--config", configFile] });
  } finally {
    await Deno.remove(configPath);
  }
});

/**
 * Will strip the -x-dev suffix from a locale, if it exists.
 * @param locale - the locale to strip.
 * @public
 */
function stripXDevFromLocale(locale: string): string {
  if (!locale.endsWith("-x-dev")) return locale;
  return locale.slice(0, -6);
}

/**
 * Automatically generate a list of translation targets based on the files in the translation dir.
 * @param baseDir - the base directory to resolve the translation directory against.
 * @param xliffDir - directory where the Translations are Stored.
 * @param sourceLocale - the source locale to fall back to if no translations are found.
 * @public
 */
function detectLocalesFromTranslationDir(baseDir: string, xliffDir: string, sourceLocale: string): string[] {
  const dir = resolve(baseDir, xliffDir);
  const files = Deno.readDirSync(dir);
  const xliffFiles = files.filter((file) => file.isFile && file.name.endsWith(".xlf"));
  const locales = [...xliffFiles.map((file) => file.name.slice(0, -4))];
  if (locales.length === 0) locales.push(stripXDevFromLocale(sourceLocale));
  return locales;
}

/**
 * Will generate a folder locales inside src with a file for every translation, when called with default values.
 * Defaults expect to be run in a subdirectory of the project root.
 * @param options - optional build options.
 * @public
 */
export const build: Task<(ctx: Ctx, options?: undefined | {
  /**
   * Locale code that messages in the source code are written in.
   * @default "en-x-dev"
   */
  sourceLocale?: string;
  /**
   * Locale codes that messages will be localized to.
   * Will look at the files in the Translations folder and use the file names as targetLocales.
   * If the folder does not exist will output sourceLocale (excluding -x-dev if it exists).
   */
  targetLocales?: string[];
  /**
   * Array of filenames or glob patterns to extract messages from.
   * @default ["..\/**\/src\/**\/*"]
   */
  inputFiles?: string[];
  /**
   * Directory on disk to read/write .xlf XML files. For each target locale,
   * the file path "<xliffDir>/<locale>.xlf" will be used.
   * Defaults to "./translations" if used with buildTranslationSource.
   */
  xliffDir?: string;
  /**
   * Output directory for generated modules.
   * For each `targetLocale` a <locale>.ts will be generated into this directory.
   * Each a module that exports the translations in that locale keyed by message ID.
   *
   * Defaults to "./src/locales" if used with buildTranslationSource.
   */
  outputDir?: string;
} & CommonOptions) => Promise<void>> = task("Building Translation Files", async (ctx, {
  xliffDir = "../translations",
  outputDir = "./src/locales",
  sourceLocale = "en-x-dev",
  inputFiles = ["..\/**\/src\/**\/*"],
  targetLocales,
  ...options
} = {}) => {
  const cwd = ctx.execaCwd(options.cwd);
  await runWithConfigFile.orig(ctx, {
    ...options,
    cwd,
    args: ["build"],
    config: {
      sourceLocale,
      targetLocales: targetLocales ?? detectLocalesFromTranslationDir(cwd, xliffDir, sourceLocale),
      interchange: {
        format: "xliff",
        xliffDir,
        placeholderStyle: "x",
      },
      output: {
        mode: "runtime",
        outputDir,
        language: "ts",
        localeCodesModule: resolve(outputDir, "index.ts"),
      },
      inputFiles: inputFiles,
    }
  });
});

/**
 * Will generate a folder locales inside src with a file for every translation, when called with default values.
 * Defaults expect to be run in the root of the project.
 * @param options - optional build options.
 * @public
 */
export const extract: Task<(ctx: Ctx, options?: undefined | {
  /**
   * Locale code that messages in the source code are written in.
   * @default "en-x-dev"
   */
  sourceLocale?: string;
  /**
   * Locale codes that messages will be localized to.
   * Will look at the files in the Translations folder and use the file names as targetLocales.
   * If the folder does not exist will output sourceLocale (excluding -x-dev if it exists).
   */
  targetLocales?: string[];
  /**
   * Array of filenames or glob patterns to extract messages from.
   * @default ["..\/**\/src\/**\/*"]
   */
  inputFiles?: string[];
  /**
   * Directory on disk to read/write .xlf XML files. For each target locale,
   * the file path "<xliffDir>/<locale>.xlf" will be used.
   * Defaults to "./translations" if used with buildTranslationSource.
   */
  xliffDir?: string;
} & CommonOptions) => Promise<void>> = task("Building Translation Files", async (ctx, {
  xliffDir = "./translations",
  sourceLocale = "en-x-dev",
  targetLocales,
  inputFiles = [".\/**\/src\/**\/*"],
  ...options
} = {}) => {
  const cwd = ctx.execaCwd(options.cwd);
  await runWithConfigFile.orig(ctx, {
    ...options,
    args: ["extract"],
    config: {
      sourceLocale,
      targetLocales: targetLocales ?? detectLocalesFromTranslationDir(cwd, xliffDir, sourceLocale),
      interchange: {
        format: "xliff",
        xliffDir,
        placeholderStyle: "x",
      },
      output: {
        mode: "runtime",
        outputDir: ""
      },
      inputFiles: inputFiles,
    }
  });
});

/** Union of configuration objects for each of the supported interchange formatters. */
export type FormatConfig = XlbConfig | XliffConfig;

/**
 * Parse an XLB XML file. These files contain translations organized using the
 * same message names that we originally requested.
 * Configuration for XLB interchange format.
 */
export interface XlbConfig {
  /** Format to use for this interchange configuration. */
  format: 'xlb';
  /**
   * Output path on disk to the XLB XML file that will be created containing all
   * messages extracted from the source. E.g. "data/localization/en.xlb".
   */
  outputFile: string;
  /**
   * Glob pattern of XLB XML files to read from disk containing translated
   * messages. E.g. "data/localization/*.xlb".
   *
   * See https://github.com/isaacs/node-glob#README for valid glob syntax.
   */
  translationsGlob: string;
}

/** Configuration for XLIFF interchange format. */
export interface XliffConfig {
  /** Format to use for this interchange configuration. */
  format: 'xliff';
  /**
   * Directory on disk to read/write .xlf XML files. For each target locale,
   * the file path "<xliffDir>/<locale>.xlf" will be used.
   */
  xliffDir: string;
  /**
   * How to represent placeholders containing HTML markup and dynamic
   * expressions. Different localization tools and services have varying support
   * for placeholder syntax.
   *
   * Defaults to "x". Options:
   *
   * - "x": Emit placeholders using <x> tags. See
   *   http://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html#x
   *
   * - "ph": Emit placeholders using <ph> tags. See
   *   http://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html#ph
   */
  placeholderStyle?: 'x' | 'ph';
}

/** Configuration specific to the `runtime` output mode. */
export interface RuntimeOutputConfig {
  /** Output mode for this configuration. */
  mode: 'runtime';
  /**
   * Language for emitting generated modules. Defaults to "js" unless a
   * `tsConfig` was specified, in which case it defaults to "ts".
   *
   * - "js": Emit JavaScript modules with ".js" file extension.
   * - "ts": Emit TypeScript modules with ".ts" file extension.
   */
  language?: 'js' | 'ts';
  /**
   * Output directory for generated modules. Into this directory will be
   * generated a <locale>.ts for each `targetLocale`, each a module that exports
   * the translations in that locale keyed by message ID.
   */
  outputDir: string;
  /**
   * Optional filepath for a generated module that exports `sourceLocale`,
   * `targetLocales`, and `allLocales` using the locale codes from your config
   * file. Use to keep your config file and client config in sync. For example:
   *
   *   export const sourceLocale = 'en';
   *   export const targetLocales = ['es-419', 'zh_CN'];
   *   export const allLocales = ['es-419', 'zh_CN', 'en'];
   *
   * This path should end with either ".js" or ".ts". If it ends with ".js" it
   * will be emitted as a JavaScript module. If it ends with ".ts" it will be
   * emitted as a TypeScript module.
   */
  localeCodesModule?: string;
}

/** Configuration specific to the `transform` output mode. */
export interface TransformOutputConfig {
  /** Output mode for this configuration. */
  mode: 'transform';
  /**
   * Output directory for transformed projects. A subdirectory will be created
   * for each locale within this directory, each containing a full build of the
   * project for that locale.
   *
   * Required unless `tsConfig` is specified, in which case it defaults to that
   * config's `outDir`. If both are specified, this field takes precedence.
   */
  outputDir?: string;
  /**
   * Optional filepath for a generated module that exports
   * `sourceLocale`, `targetLocales`, and `allLocales` using the locale codes
   * from your config file. Use to keep your config file and client config in
   * sync. For example:
   *
   *   export const sourceLocale = 'en';
   *   export const targetLocales = ['es-419', 'zh_CN'];
   *   export const allLocales = ['es-419', 'zh_CN', 'en'];
   *
   * This path should end with either ".js" or ".ts". If it ends with ".js" it
   * will be emitted as a JavaScript module. If it ends with ".ts" it will be
   * emitted as a TypeScript module.
   */
  localeCodesModule?: string;
}

/** Replace one string with another. */
export interface Patch {
  /** The string to search for. */
  before: string;
  /** The string to replace matches with. */
  after: string;
}

/** Config File Type used for lit-localize command. */
export interface ConfigFile {
  /** See https://json-schema.org/understanding-json-schema/reference/schema.html */
  $schema?: string;
  /** Required locale code that messages in the source code are written in. */
  sourceLocale: string;
  /** Required locale codes that messages will be localized to. */
  targetLocales: string[];
  /**
   * Array of filenames or glob patterns to extract messages from.
   *
   * Required unless `tsConfig` is specified. If `tsConfig` is also specified,
   * then this field takes precedence.
   */
  inputFiles?: string[];
  /**
   * Path to a tsconfig.json file that determines the source files from which
   * messages will be extracted, and also the compiler options that will be used
   * when building for transform mode.
   *
   * Required unless `inputFiles` is specified. If `inputFiles` is also
   * specified, then the files specified by this config will be ignored in favor
   * of `inputFiles`.
   */
  tsConfig?: string;
  /** Localization interchange format and configuration specific to that format. */
  interchange: FormatConfig;
  /** Set and configure the output mode. */
  output: RuntimeOutputConfig | TransformOutputConfig;
  /**
   * Optional string substitutions to apply to specific locale messages. Useful
   * for making minor corrections without modifying source files or repeating a
   * full localization cycle.
   *
   * Example:
   *
   * "patches": {
   *   "es-419": {
   *     "greeting": [
   *       {
   *         "before": "Buenos dias",
   *         "after": "Buenos días"
   *       }
   *     ]
   *   }
   * }
   */
  patches?: {
    [locale: string]: {
      [messageId: string]: Patch[];
    };
  };
}