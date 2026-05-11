import { mergePathRelations, normalizeTasks } from "./task-utils.mjs";
import { notFound } from "./http-errors.mjs";

const taskQuery = `[:find ?uid ?string ?page-title ?page-uid ?created-time ?edited-time
  :in $ ?needle
  :where
  [?b :block/uid ?uid]
  [?b :block/string ?string]
  [(clojure.string/includes? ?string ?needle)]
  [(get-else $ ?b :create/time 0) ?created-time]
  [(get-else $ ?b :edit/time 0) ?edited-time]
  [?b :block/page ?p]
  [?p :node/title ?page-title]
  [?p :block/uid ?page-uid]]`;

const uidQuery = `[:find ?string
  :in $ ?uid
  :where
  [?b :block/uid ?uid]
  [?b :block/string ?string]]`;

const blockStringQuery = `[:find ?uid ?string
  :in $ [?uid ...]
  :where
  [?b :block/uid ?uid]
  [?b :block/string ?string]]`;

const directParentQuery = `[:find ?child-uid ?parent-uid ?parent-string
  :in $ [?child-uid ...]
  :where
  [?b :block/uid ?child-uid]
  [?p :block/children ?b]
  [?p :block/uid ?parent-uid]
  [?p :block/string ?parent-string]]`;

const directChildrenQuery = `[:find ?parent-uid ?child-uid ?child-string ?order
  :in $ [?parent-uid ...]
  :where
  [?p :block/uid ?parent-uid]
  [?p :block/children ?c]
  [?c :block/uid ?child-uid]
  [?c :block/string ?child-string]
  [(get-else $ ?c :block/order 0) ?order]]`;

const pageUidQuery = `[:find ?title ?uid
  :in $ [?title ...]
  :where
  [?p :node/title ?title]
  [?p :block/uid ?uid]]`;

export async function readTasks(context, graph, { includeDone = true } = {}) {
  const rows = await readTaskRows(context, graph, includeDone);
  const tasks = normalizeTasks(rows);
  await Promise.all([
    enrichTaskBlockRefs(context, graph, tasks),
    enrichTaskBreadcrumbs(context, graph, tasks),
    enrichTaskDetails(context, graph, tasks)
  ]);
  enrichTaskPathRelations(tasks);
  await enrichTaskPageUids(context, graph, tasks);
  return tasks;
}

async function readTaskRows(context, graph, includeDone) {
  const statuses = includeDone ? ["TODO", "DONE", "Abandoned"] : ["TODO"];
  const results = await Promise.all(
    statuses.map((status) => context.roamCall(graph, "q", [taskQuery, status], context))
  );
  return results.flatMap((result) => coerceRows(result.result));
}

async function getBlockString(context, graph, uid) {
  const result = await context.roamCall(graph, "q", [uidQuery, uid], context);
  const row = coerceRows(result.result)[0];
  if (!row?.[0]) throw notFound("Could not find that Roam block.");
  return row[0];
}

async function enrichTaskPageUids(context, graph, tasks) {
  const titles = new Set();

  for (const task of tasks) {
    if (task.pageTitle && !task.pageUids?.[task.pageTitle]) titles.add(task.pageTitle);
    for (const title of [...(task.pages || []), ...(task.tags || [])]) {
      if (title && !task.pageUids?.[title]) titles.add(title);
    }
  }

  const pageUids = await resolvePageUids(context, graph, [...titles]);
  for (const task of tasks) {
    task.pageUids = { ...(task.pageUids || {}) };
    for (const title of [task.pageTitle, ...(task.pages || []), ...(task.tags || [])]) {
      if (title && pageUids[title]) task.pageUids[title] = pageUids[title];
    }
  }
}

function enrichTaskPathRelations(tasks) {
  for (const task of tasks) mergePathRelations(task);
}

async function enrichTaskBlockRefs(context, graph, tasks) {
  const uids = new Set();

  for (const task of tasks) {
    for (const uid of task.blockRefs || []) {
      if (uid && !task.blockStrings?.[uid]) uids.add(uid);
    }
  }

  const blockStrings = await resolveBlockStrings(context, graph, [...uids]);
  for (const task of tasks) {
    task.blockStrings = { ...(task.blockStrings || {}) };
    for (const uid of task.blockRefs || []) {
      if (uid && blockStrings[uid]) task.blockStrings[uid] = blockStrings[uid];
    }
  }
}

async function resolveBlockStrings(context, graph, uids) {
  if (!uids.length) return {};

  try {
    const response = await context.roamCall(graph, "q", [blockStringQuery, uids], context);
    return Object.fromEntries(coerceRows(response.result).filter((row) => row[0] && row[1]));
  } catch {
    const entries = await Promise.all(
      uids.map(async (uid) => {
        try {
          return [uid, await getBlockString(context, graph, uid)];
        } catch {
          return null;
        }
      })
    );
    return Object.fromEntries(entries.filter(Boolean));
  }
}

async function enrichTaskBreadcrumbs(context, graph, tasks) {
  const maxDepth = 6;
  const parentByChild = new Map();
  const seen = new Set();
  let frontier = tasks.map((task) => task.uid).filter(Boolean);

  for (let depth = 0; depth < maxDepth && frontier.length; depth += 1) {
    const nextFrontier = [];
    for (const uid of frontier) seen.add(uid);

    const parents = await resolveDirectParents(context, graph, frontier);
    for (const parent of parents) {
      if (!parentByChild.has(parent.childUid)) parentByChild.set(parent.childUid, parent);
      if (!seen.has(parent.uid)) nextFrontier.push(parent.uid);
    }

    frontier = [...new Set(nextFrontier)];
  }

  for (const task of tasks) {
    const chain = [];
    const visited = new Set([task.uid]);
    let currentUid = task.uid;

    while (parentByChild.has(currentUid) && chain.length < maxDepth) {
      const parent = parentByChild.get(currentUid);
      if (visited.has(parent.uid)) break;
      visited.add(parent.uid);
      chain.push({ uid: parent.uid, string: parent.string });
      currentUid = parent.uid;
    }

    task.breadcrumb = chain.reverse();
  }
}

async function enrichTaskDetails(context, graph, tasks) {
  const children = await resolveDirectChildren(context, graph, tasks.map((task) => task.uid).filter(Boolean));
  const childrenByParent = new Map();

  for (const child of children) {
    if (!childrenByParent.has(child.parentUid)) childrenByParent.set(child.parentUid, []);
    childrenByParent.get(child.parentUid).push({
      uid: child.uid,
      string: child.string
    });
  }

  for (const task of tasks) {
    task.details = childrenByParent.get(task.uid) || [];
  }
}

async function resolveDirectChildren(context, graph, parentUids) {
  if (!parentUids.length) return [];

  try {
    const response = await context.roamCall(graph, "q", [directChildrenQuery, parentUids], context);
    return coerceRows(response.result)
      .filter((row) => row[0] && row[1] && row[2])
      .map((row) => ({
        parentUid: row[0],
        uid: row[1],
        string: row[2],
        order: Number(row[3]) || 0
      }))
      .sort((a, b) => (
        a.parentUid.localeCompare(b.parentUid) ||
        a.order - b.order ||
        a.string.localeCompare(b.string)
      ));
  } catch {
    return [];
  }
}

async function resolveDirectParents(context, graph, childUids) {
  if (!childUids.length) return [];

  try {
    const response = await context.roamCall(graph, "q", [directParentQuery, childUids], context);
    return coerceRows(response.result)
      .filter((row) => row[0] && row[1] && row[2])
      .map((row) => ({
        childUid: row[0],
        uid: row[1],
        string: row[2]
      }));
  } catch {
    return [];
  }
}

async function resolvePageUids(context, graph, titles) {
  if (!titles.length) return {};

  try {
    const response = await context.roamCall(graph, "q", [pageUidQuery, titles], context);
    return Object.fromEntries(coerceRows(response.result).filter((row) => row[0] && row[1]));
  } catch {
    const entries = await Promise.all(
      titles.map(async (title) => {
        try {
          const response = await context.roamCall(graph, "q", [
            "[:find ?uid :in $ ?title :where [?p :node/title ?title] [?p :block/uid ?uid]]",
            title
          ], context);
          const uid = coerceRows(response.result)[0]?.[0];
          return uid ? [title, uid] : null;
        } catch {
          return null;
        }
      })
    );
    return Object.fromEntries(entries.filter(Boolean));
  }
}

function coerceRows(result) {
  if (!Array.isArray(result)) return [];
  return result.filter(Array.isArray);
}
