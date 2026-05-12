export function activeGraphName(graphs = [], selectedGraph = "") {
  return graphs.find((graph) => graph.nickname === selectedGraph)?.name || selectedGraph || "";
}

export function roamPageUrl(pageTitle, pageUid, context = {}) {
  return roamBlockUrl(pageUid || pageTitle, context);
}

export function roamBlockUrl(uid, context = {}) {
  const graphName = activeGraphName(context.graphs, context.graph);
  return `roam://#/app/${encodeURIComponent(graphName)}/page/${encodeURIComponent(uid)}`;
}

export function setRoamLinkTarget(node, pageTitle, pageUid) {
  if (pageUid) {
    node.dataset.roamUid = pageUid;
    delete node.dataset.roamTitle;
    return;
  }
  node.dataset.roamTitle = pageTitle;
  delete node.dataset.roamUid;
}
