import * as path from "path";
import { simpleGit } from "simple-git";
import { task } from "./context.ts";

/**
 * Cleans files that are ignored by GIT in the repository.
 * This task uses the simple-git library to determine which files are ignored by GIT and then removes them from the file system.
 */
export const gitIgnored = task("Cleaning GIT Ignored Files", async (ctx): Promise<void> => {
  const base = await simpleGit().revparse("--show-toplevel");
  const ignores = (await simpleGit().status(["--ignored=matching", "--untracked-files=normal", "--no-ahead-behind", "--no-renames"])).ignored;
  if (ignores === undefined) return;
  await Promise.all(ignores.map(async (ignore) => {
    try {
      ctx.print(`Removing ${ignore}`);
      await Deno.remove(path.join(base, ignore), { recursive: true });
    } catch (error) {
      ctx.print(`Failed to remove ${ignore}:\n  ${error}`);
      throw error;
    }
  }));
});
