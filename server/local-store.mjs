import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const currentVersion = 1;

export function defaultLocalStorePath() {
  return process.env.ROAM_TASKS_LOCAL_STORE_PATH || join(homedir(), ".roam-tasks", "gtd-state.json");
}

export function createJsonLocalStore(filePath = defaultLocalStorePath()) {
  let lastRecovery = null;

  return {
    filePath,
    async read() {
      const result = await readLocalStoreFile(filePath);
      if (result.recovery) lastRecovery = result.recovery;
      return result.store;
    },
    async write(data) {
      const normalized = normalizeLocalStore(data);
      await writeLocalStoreFile(filePath, normalized);
      return normalized;
    },
    info() {
      return {
        filePath,
        recovery: lastRecovery
      };
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
    return {
      store: normalizeLocalStore(data),
      recovery: null
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        store: normalizeLocalStore(),
        recovery: null
      };
    }
    if (error instanceof SyntaxError) {
      return recoverCorruptedLocalStore(filePath, error);
    }
    throw error;
  }
}

async function recoverCorruptedLocalStore(filePath, error) {
  const recoveredAt = new Date().toISOString();
  const preservedPath = corruptedLocalStorePath(filePath, recoveredAt);
  const store = normalizeLocalStore();

  await rename(filePath, preservedPath);
  await writeLocalStoreFile(filePath, store);

  return {
    store,
    recovery: {
      error: error.message || String(error),
      errorName: error.name || "Error",
      preservedPath,
      recoveredAt
    }
  };
}

async function writeLocalStoreFile(filePath, store) {
  await mkdir(dirname(filePath), { recursive: true });
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const temporaryPath = `${filePath}.${suffix}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function corruptedLocalStorePath(filePath, recoveredAt) {
  const timestamp = recoveredAt.replace(/[:.]/g, "-");
  const suffix = `${timestamp}-${process.pid}-${Math.random().toString(36).slice(2)}`;
  return `${filePath}.corrupt-${suffix}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
