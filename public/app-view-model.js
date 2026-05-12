export function normalizeGraphLoadResult(data = {}) {
  const graphs = Array.isArray(data.graphs) ? data.graphs : [];
  const selectedGraph = typeof data.selectedGraph === "string" && data.selectedGraph ? data.selectedGraph : null;

  return {
    graphs,
    selectedGraph,
    showSetup: graphs.length === 0
  };
}

export function localStoreNoticeView(info = {}) {
  if (info.recovery) {
    return {
      visible: true,
      title: "Local sandbox recovered",
      rows: [
        ["Active store", info.storePath || "Unknown"],
        ["Preserved data", info.recovery.preservedPath || "Unavailable"],
        ["Recovery issue", info.recovery.error || "Could not load local GTD store safely"]
      ]
    };
  }

  if (info.degraded) {
    const rows = [
      ["Active store", info.storePath || "Unavailable"],
      ["Fallback", info.degraded.fallback || "Browser local storage"],
      ["Persistence issue", info.degraded.error || "Could not reach the local GTD store"]
    ];

    if (info.degraded.fallbackError) {
      rows.push(["Fallback issue", info.degraded.fallbackError]);
    }

    return {
      visible: true,
      title: "Local sandbox fallback",
      rows
    };
  }

  return {
    visible: false,
    title: "",
    rows: []
  };
}

export function degradedLocalStoreInfo(error, { fallback = "Browser local storage", fallbackError = "" } = {}) {
  return {
    error: errorMessage(error),
    fallback,
    fallbackError: errorMessage(fallbackError),
    degradedAt: new Date().toISOString()
  };
}

function errorMessage(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return error.message || String(error);
}
