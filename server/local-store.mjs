import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const currentVersion = 1;

export function defaultLocalStorePath() {
  return process.env.ROAM_TASKS_LOCAL_STORE_PATH || join(homedir(), ".roam-tasks", "gtd-state.json");
}

export function createJsonLocalStore(filePath = defaultLocalStorePath()) {
  return {
    filePath,
    async read() {
      return readLocalStoreFile(filePath);
    },
    async write(data) {
      const normalized = normalizeLocalStore(data);
      await mkdir(dirname(filePath), { recursive: true });
      const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const temporaryPath = `${filePath}.${suffix}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
      await rename(temporaryPath, filePath);
      return normalized;
    }
  };
}

export function normalizeLocalStore(data = {}) {
  const localTasks = Array.isArray(data.localTasks) ? data.localTasks.filter(isPlainObject) : [];
  const localState = isPlainObject(data.localState)
    ? Object.fromEntries(Object.entries(data.localState).filter(([, value]) => isPlainObject(value)))
    : {};

  return {
    version: currentVersion,
    localTasks,
    localState
  };
}

async function readLocalStoreFile(filePath) {
  try {
    const data = JSON.parse(await readFile(filePath, "utf8"));
    return normalizeLocalStore(data);
  } catch (error) {
    if (error.code === "ENOENT") return normalizeLocalStore();
    throw error;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
