export function normalizeLocalStore(data = {}) {
  return {
    localTasks: Array.isArray(data.localTasks) ? data.localTasks : [],
    localState: normalizeLocalState(data.localState)
  };
}

export function normalizeLocalStoreInfo(data = {}) {
  return {
    storePath: typeof data.storePath === "string" ? data.storePath : "",
    recovery: normalizeLocalStoreRecovery(data.recovery),
    degraded: normalizeLocalStoreDegraded(data.degraded)
  };
}

export function hasLocalStoreData(store) {
  return store.localTasks.length > 0 || Object.keys(store.localState).length > 0;
}

function normalizeLocalStoreRecovery(recovery) {
  if (!recovery || typeof recovery !== "object" || Array.isArray(recovery)) return null;
  return {
    error: stringValue(recovery.error),
    errorName: stringValue(recovery.errorName),
    preservedPath: stringValue(recovery.preservedPath),
    recoveredAt: stringValue(recovery.recoveredAt)
  };
}

function normalizeLocalStoreDegraded(degraded) {
  if (!degraded || typeof degraded !== "object" || Array.isArray(degraded)) return null;
  return {
    error: stringValue(degraded.error),
    fallback: stringValue(degraded.fallback),
    fallbackError: stringValue(degraded.fallbackError),
    degradedAt: stringValue(degraded.degradedAt)
  };
}

function normalizeLocalState(localState) {
  if (!localState || typeof localState !== "object" || Array.isArray(localState)) return {};
  return Object.fromEntries(
    Object.entries(localState).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value))
  );
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}
