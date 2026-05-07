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
  return inspectLocalStore(data).store;
}

function inspectLocalStore(data = {}) {
  const invalidFragments = [];
  const localTasks = [];
  const localState = {};

  if (!isPlainObject(data)) {
    invalidFragments.push(invalidFragment("$", "Expected the local GTD store root to be an object.", data));
    return {
      store: {
        version: currentVersion,
        localTasks,
        localState
      },
      invalidFragments
    };
  }

  if (Object.hasOwn(data, "localTasks")) {
    if (Array.isArray(data.localTasks)) {
      data.localTasks.forEach((task, index) => {
        if (isPlainObject(task)) {
          localTasks.push(task);
        } else {
          invalidFragments.push(
            invalidFragment(`localTasks[${index}]`, "Expected local task entries to be objects.", task)
          );
        }
      });
    } else {
      invalidFragments.push(invalidFragment("localTasks", "Expected localTasks to be an array.", data.localTasks));
    }
  }

  if (Object.hasOwn(data, "localState")) {
    if (isPlainObject(data.localState)) {
      for (const [uid, overlay] of Object.entries(data.localState)) {
        if (isPlainObject(overlay)) {
          localState[uid] = overlay;
        } else {
          invalidFragments.push(
            invalidFragment(
              `localState[${JSON.stringify(uid)}]`,
              "Expected localState overlay entries to be objects.",
              overlay
            )
          );
        }
      }
    } else {
      invalidFragments.push(invalidFragment("localState", "Expected localState to be an object.", data.localState));
    }
  }

  return {
    store: {
      version: currentVersion,
      localTasks,
      localState
    },
    invalidFragments
  };
}

function invalidFragment(path, reason, value) {
  return {
    path,
    reason,
    value
  };
}

async function readLocalStoreFile(filePath) {
  try {
    const data = JSON.parse(await readFile(filePath, "utf8"));
    const result = inspectLocalStore(data);
    if (result.invalidFragments.length > 0) {
      return recoverStructurallyInvalidLocalStore(filePath, result.store, result.invalidFragments);
    }
    return {
      store: result.store,
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

async function recoverStructurallyInvalidLocalStore(filePath, store, invalidFragments) {
  const recoveredAt = new Date().toISOString();
  const preservedPath = invalidFragmentsLocalStorePath(filePath, recoveredAt);

  await writeInvalidFragmentsFile(filePath, preservedPath, recoveredAt, invalidFragments);
  await writeLocalStoreFile(filePath, store);

  return {
    store,
    recovery: {
      error: structuralRecoveryMessage(invalidFragments),
      errorName: "LocalStoreStructureError",
      preservedPath,
      recoveredAt
    }
  };
}

async function writeInvalidFragmentsFile(filePath, preservedPath, recoveredAt, invalidFragments) {
  await mkdir(dirname(preservedPath), { recursive: true });
  await writeFile(
    preservedPath,
    `${JSON.stringify(
      {
        version: currentVersion,
        storePath: filePath,
        recoveredAt,
        invalidFragments
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function structuralRecoveryMessage(invalidFragments) {
  const count = invalidFragments.length;
  const noun = count === 1 ? "entry" : "entries";
  const preview = invalidFragments
    .slice(0, 4)
    .map((fragment) => fragment.path)
    .join(", ");
  const suffix = count > 4 ? `, and ${count - 4} more` : "";
  return `Local GTD store contained ${count} structurally invalid ${noun} (${preview}${suffix}); preserved invalid fragments before continuing.`;
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

function invalidFragmentsLocalStorePath(filePath, recoveredAt) {
  const timestamp = recoveredAt.replace(/[:.]/g, "-");
  const suffix = `${timestamp}-${process.pid}-${Math.random().toString(36).slice(2)}`;
  return `${filePath}.invalid-${suffix}.json`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
