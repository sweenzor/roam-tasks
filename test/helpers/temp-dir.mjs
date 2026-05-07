import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultTempRoot = join(repoRoot, ".test-tmp");
const unwritableErrorCodes = new Set(["EACCES", "EPERM", "EROFS"]);

export async function createSandboxTempDir(t, prefix) {
  const tempRoot = resolve(process.env.ROAM_TASKS_TEST_TMPDIR || defaultTempRoot);

  try {
    await mkdir(tempRoot, { recursive: true });
    const dir = await mkdtemp(join(tempRoot, `${prefix}-`));
    t.after(() => rm(dir, { recursive: true, force: true }));
    return dir;
  } catch (error) {
    if (unwritableErrorCodes.has(error?.code)) {
      t.skip(
        `requires a writable test temp directory (${tempRoot}); set ROAM_TASKS_TEST_TMPDIR to a writable path`
      );
      return null;
    }

    throw error;
  }
}
