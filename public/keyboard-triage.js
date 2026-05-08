export const gtdTriageBucketKeys = {
  i: "inbox",
  n: "next",
  w: "waiting",
  s: "scheduled",
  y: "someday"
};

export const gtdTriageViewKeys = {
  ...gtdTriageBucketKeys,
  p: "projects",
  r: "review"
};

export const gtdTriageShortcutPrefixes = {
  g: "view",
  m: "move"
};

export const keyboardSelectionShortcutKeys = {
  a: "select-visible",
  escape: "clear"
};

export function shortcutKey(event = {}) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return "";
  return String(event.key || "").toLowerCase();
}

export function isKeyboardShortcutEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || "").toLowerCase();
  return ["input", "select", "textarea"].includes(tag);
}

export function resolveGtdTriageShortcut(prefix, key) {
  const action = gtdTriageShortcutPrefixes[String(prefix || "").toLowerCase()];
  if (!action) return null;
  const keyMap = action === "view" ? gtdTriageViewKeys : gtdTriageBucketKeys;
  const bucket = keyMap[String(key || "").toLowerCase()];
  return bucket ? { action, bucket } : null;
}

export function resolveKeyboardSelectionShortcut(key) {
  return keyboardSelectionShortcutKeys[String(key || "").toLowerCase()] || "";
}

export function triageChangesForBucket(bucket, options = {}) {
  if (bucket === "inbox") {
    return {
      gtdStatus: "inbox",
      dueDate: null,
      waitingFor: ""
    };
  }
  if (bucket === "next") {
    return {
      gtdStatus: "next",
      dueDate: null,
      waitingFor: ""
    };
  }
  if (bucket === "waiting") {
    return {
      gtdStatus: "waiting",
      dueDate: null
    };
  }
  if (bucket === "scheduled") {
    const dueDate = String(options.dueDate || "");
    if (!dueDate) return {};
    return {
      gtdStatus: "scheduled",
      dueDate,
      waitingFor: ""
    };
  }
  if (bucket === "someday") {
    return {
      gtdStatus: "someday",
      dueDate: null,
      waitingFor: ""
    };
  }
  return {};
}

export function taskIdsForKeyboardTriage({
  selectedTaskIds = [],
  focusedTaskId = "",
  visibleTaskIds = [],
  pendingRemovalIds = []
} = {}) {
  const visible = new Set(iterableValues(visibleTaskIds));
  const pending = new Set(iterableValues(pendingRemovalIds));
  const selected = iterableValues(selectedTaskIds).filter((uid) => {
    return visible.has(uid) && !pending.has(uid);
  });

  if (selected.length) return selected;
  if (focusedTaskId && visible.has(focusedTaskId) && !pending.has(focusedTaskId)) return [focusedTaskId];
  return [];
}

export function nextKeyboardTaskIndex(count, currentIndex, direction) {
  if (count <= 0) return -1;
  const step = direction < 0 ? -1 : 1;
  if (currentIndex < 0) return step > 0 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, currentIndex + step));
}

function iterableValues(value) {
  if (!value || typeof value[Symbol.iterator] !== "function") return [];
  return [...value];
}
