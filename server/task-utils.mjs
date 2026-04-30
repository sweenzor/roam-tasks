const TODO_MARKERS = [
  /\{\{\s*\[\[TODO\]\]\s*\}\}/i,
  /\{\{\s*TODO\s*\}\}/i
];

const DONE_MARKERS = [
  /\{\{\s*\[\[DONE\]\]\s*\}\}/i,
  /\{\{\s*DONE\s*\}\}/i
];

const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

export function detectTaskStatus(value = "") {
  const searchable = stripInlineCode(value);
  if (DONE_MARKERS.some((marker) => marker.test(searchable))) return "done";
  if (TODO_MARKERS.some((marker) => marker.test(searchable))) return "todo";
  return null;
}

export function isTaskString(value = "") {
  return detectTaskStatus(value) !== null;
}

export function taskStringWithStatus(value = "", done = false) {
  const nextMarker = done ? "{{[[DONE]]}}" : "{{[[TODO]]}}";
  const oldMarkers = done ? TODO_MARKERS : DONE_MARKERS;

  for (const marker of oldMarkers) {
    if (marker.test(value)) return value.replace(marker, nextMarker);
  }

  const anyMarker = [...TODO_MARKERS, ...DONE_MARKERS].find((marker) => marker.test(value));
  if (anyMarker) return value.replace(anyMarker, nextMarker);
  return `${nextMarker} ${value.trim()}`.trim();
}

export function taskStringWithText(value = "", text = "", done) {
  const status = done === undefined ? detectTaskStatus(value) : done ? "done" : "todo";
  const marker = status === "done" ? "{{[[DONE]]}}" : "{{[[TODO]]}}";
  return `${marker} ${text.trim()}`.trim();
}

export function ensureTodoString(value = "") {
  if (isTaskString(value)) return value.trim();
  return `{{[[TODO]]}} ${value.trim()}`.trim();
}

export function normalizeTasks(rows = []) {
  const byUid = new Map();

  for (const row of rows) {
    const [uid, string, pageTitle, pageUid, createdTime = 0, editedTime = 0] = normalizeTaskRow(row);

    if (!uid || !string) continue;
    const status = detectTaskStatus(string);
    if (!status) continue;

    const parsed = parseTask({
      uid,
      string,
      pageTitle,
      pageUid,
      createdTime,
      editedTime
    });

    byUid.set(uid, parsed);
  }

  return [...byUid.values()].sort(compareTasks);
}

export function parseTask({ uid, string, pageTitle, pageUid, createdTime = 0, editedTime = 0 }) {
  const status = detectTaskStatus(string) ?? "todo";
  const pages = extractPageLinks(string).filter((page) => !isStatusTitle(page));
  const tags = extractTags(string).filter((tag) => !isStatusTitle(tag));
  const blockRefs = extractBlockRefs(string);
  const dueDate = extractDueDate(string, pageTitle);
  const cleanText = cleanTaskText(string);

  return {
    uid,
    raw: string,
    text: cleanText,
    status,
    done: status === "done",
    pageTitle: pageTitle || "Untitled",
    pageUid: pageUid || null,
    pageUids: pageTitle && pageUid ? { [pageTitle]: pageUid } : {},
    pages,
    tags,
    blockRefs,
    blockStrings: {},
    dueDate,
    priority: extractPriority(string),
    createdTime: Number(createdTime) || 0,
    editedTime: Number(editedTime) || 0
  };
}

function normalizeTaskRow(row) {
  if (!Array.isArray(row)) {
    return [row.uid, row.string, row.pageTitle, row.pageUid, row.createdTime, row.editedTime];
  }

  const [uid, string, pageTitle, fourth, fifth = 0, sixth = 0] = row;
  if (typeof fourth === "string") return [uid, string, pageTitle, fourth, fifth, sixth];
  return [uid, string, pageTitle, undefined, fourth ?? 0, fifth ?? 0];
}

export function cleanTaskText(value = "") {
  let text = value;
  for (const marker of [...TODO_MARKERS, ...DONE_MARKERS]) {
    text = text.replace(marker, "");
  }
  text = text
    .replace(/\s+/g, " ")
    .replace(/^\s*[-*]\s+/, "")
    .trim();
  return text || "Untitled task";
}

export function extractPageLinks(value = "") {
  const pages = new Set();
  const pagePattern = /\[\[([^\]]+)\]\]/g;
  let match;

  while ((match = pagePattern.exec(value)) !== null) {
    pages.add(match[1].trim());
  }

  return [...pages];
}

export function extractTags(value = "") {
  const tags = new Set();
  const tagPattern = /(?:^|\s)#(?:\[\[([^\]]+)\]\]|([A-Za-z0-9_/-]+))/g;
  let match;

  while ((match = tagPattern.exec(value)) !== null) {
    tags.add((match[1] || match[2]).trim());
  }

  return [...tags];
}

export function extractBlockRefs(value = "") {
  const uids = new Set();
  const blockRefPattern = /\(\(([A-Za-z0-9_-]+)\)\)/g;
  let match;

  while ((match = blockRefPattern.exec(value)) !== null) {
    uids.add(match[1]);
  }

  return [...uids];
}

export function extractPriority(value = "") {
  if (/[!]{3,}/.test(value) || /#\[\[?P1\]?\]|#p1|\[\[P1\]\]/i.test(value)) return 1;
  if (/[!]{2}/.test(value) || /#\[\[?P2\]?\]|#p2|\[\[P2\]\]/i.test(value)) return 2;
  if (/[!]/.test(value) || /#\[\[?P3\]?\]|#p3|\[\[P3\]\]/i.test(value)) return 3;
  return null;
}

export function extractDueDate(value = "", pageTitle = "") {
  const explicit = value.match(
    /(?:due|do|scheduled|deadline)::?\s*(\[\[[^\]]+\]\]|[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i
  );

  if (explicit) {
    const parsed = parseRoamDate(explicit[1].replace(/^\[\[|\]\]$/g, ""));
    if (parsed) return parsed;
  }

  for (const page of extractPageLinks(value)) {
    const parsed = parseRoamDate(page);
    if (parsed) return parsed;
  }

  return parseRoamDate(pageTitle);
}

export function parseRoamDate(value = "", fallbackYear = new Date().getFullYear()) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const year = normalizeYear(Number(slash[3]));
    return toIsoDate(year, Number(slash[1]) - 1, Number(slash[2]));
  }

  const roam = trimmed.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?$/i
  );
  if (!roam) return null;

  const month = MONTHS[roam[1].toLowerCase()];
  const day = Number(roam[2]);
  const year = roam[3] ? Number(roam[3]) : fallbackYear;
  return toIsoDate(year, month, day);
}

export function formatRoamDailyDate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}-${date.getFullYear()}`;
}

function compareTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return b.dueDate.localeCompare(a.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  if (a.priority && b.priority && a.priority !== b.priority) return a.priority - b.priority;
  if (a.priority && !b.priority) return -1;
  if (!a.priority && b.priority) return 1;
  return (b.editedTime || 0) - (a.editedTime || 0);
}

function isStatusTitle(value = "") {
  return /^(TODO|DONE)$/i.test(value.trim());
}

function normalizeYear(value) {
  if (value < 100) return value >= 70 ? 1900 + value : 2000 + value;
  return value;
}

function toIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function stripInlineCode(value) {
  return value.replace(/`[^`]*`/g, "");
}
