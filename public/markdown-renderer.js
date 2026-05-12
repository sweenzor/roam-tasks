import { cleanRoamInlineText } from "./gtd-model.js";

export function renderInlineMarkdown(markdown, options = {}) {
  const {
    blockStrings = {},
    pageUids = {},
    roamBlockUrl = (uid) => `#${uid}`,
    roamPageUrl = (pageTitle, pageUid) => `#${pageUid || pageTitle}`
  } = options;
  const placeholders = [];
  const stash = (html) => {
    const token = `@@RTTOKEN${placeholders.length}@@`;
    placeholders.push(html);
    return token;
  };

  let source = String(markdown || "");

  source = source.replace(/`([^`]+)`/g, (_, code) => stash(`<code>${escapeHtml(code)}</code>`));

  source = source.replace(/\[([^\]\n]+)\]\(((?:[^()\n]|\([^)\n]*\))+)\)/g, (_, label, href) => {
    return stash(renderMarkdownLink(label, href, { pageUids, roamPageUrl }));
  });

  source = source.replace(/#\[\[([^\]\n]+)\]\]/g, (_, pageTitle) => {
    return stash(renderRoamPageLink(pageTitle, `#${pageTitle}`, { pageUids, roamPageUrl }));
  });

  source = source.replace(/\[\[([^\]\n]+)\]\]/g, (_, pageTitle) => {
    return stash(renderRoamPageLink(pageTitle, pageTitle, { pageUids, roamPageUrl }));
  });

  source = source.replace(/\(\(([A-Za-z0-9_-]+)\)\)/g, (_, uid) => {
    const label = blockStrings[uid] ? cleanRoamInlineText(blockStrings[uid]) : `(${uid})`;
    return stash(
      `<a class="roam-page-link" href="${escapeAttribute(roamBlockUrl(uid))}" data-roam-uid="${escapeAttribute(uid)}" title="Open block in Roam">${escapeHtml(label || `(${uid})`)}</a>`
    );
  });

  source = source.replace(/(^|[\s(])#([A-Za-z0-9_/-]+)/g, (match, prefix, tag) => {
    return `${prefix}${stash(renderRoamPageLink(tag, `#${tag}`, { pageUids, roamPageUrl }))}`;
  });

  let html = escapeHtml(source);
  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\*([^*\s][^*]*?)\*/g, "<em>$1</em>")
    .replace(/_([^_\s][^_]*?)_/g, "<em>$1</em>");

  placeholders.forEach((replacement, index) => {
    html = html.replaceAll(`@@RTTOKEN${index}@@`, replacement);
  });

  return html;
}

function renderMarkdownLink(label, href, options) {
  const trimmedHref = String(href || "").trim();
  const pageMatch = trimmedHref.match(/^\[\[([^\]]+)\]\]$/);
  if (pageMatch) return renderRoamPageLink(pageMatch[1], label, options);

  const safeHref = safeLinkHref(trimmedHref);
  if (!safeHref) return escapeHtml(label);

  const external = /^https?:/i.test(safeHref);
  const target = external ? ' target="_blank" rel="noreferrer"' : "";
  return `<a href="${escapeAttribute(safeHref)}"${target}>${escapeHtml(label)}</a>`;
}

function renderRoamPageLink(pageTitle, label, { pageUids = {}, roamPageUrl }) {
  const pageUid = pageUids[pageTitle];
  const targetAttribute = pageUid
    ? `data-roam-uid="${escapeAttribute(pageUid)}"`
    : `data-roam-title="${escapeAttribute(pageTitle)}"`;
  return `<a class="roam-page-link" href="${escapeAttribute(roamPageUrl(pageTitle, pageUid))}" ${targetAttribute} title="Open ${escapeAttribute(pageTitle)} in Roam">${escapeHtml(label)}</a>`;
}

function safeLinkHref(href) {
  if (/^(https?:|mailto:|roam:\/\/)/i.test(href)) return href;
  if (href.startsWith("#")) return href;
  return "";
}

export function renderPathChipText(value = "") {
  const placeholders = [];
  const stash = (html) => {
    const token = `@@RTPATHTOKEN${placeholders.length}@@`;
    placeholders.push(html);
    return token;
  };
  const boldPageLink = (label) => stash(`<strong class="path-page-link">${escapeHtml(label)}</strong>`);

  let source = String(value);
  source = source
    .replace(/\{\{\s*\[\[(?:TODO|DONE|Abandoned)\]\]\s*\}\}/gi, "")
    .replace(/\{\{\s*(?:TODO|DONE|Abandoned)\s*\}\}/gi, "")
    .replace(/\[([^\]\n]+)\]\(\[\[([^\]\n]+)\]\]\)/g, (_, label) => boldPageLink(label))
    .replace(/\[([^\]\n]+)\]\(((?:[^()\n]|\([^)\n]*\))+)\)/g, "$1")
    .replace(/#\[\[([^\]\n]+)\]\]/g, (_, pageTitle) => boldPageLink(`#${pageTitle}`))
    .replace(/\[\[([^\]\n]+)\]\]/g, (_, pageTitle) => boldPageLink(pageTitle))
    .replace(/(^|[\s(])#([A-Za-z0-9_/-]+)/g, (_, prefix, tag) => {
      return `${prefix}${boldPageLink(`#${tag}`)}`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

  let html = escapeHtml(source);
  placeholders.forEach((replacement, index) => {
    html = html.replaceAll(`@@RTPATHTOKEN${index}@@`, replacement);
  });
  return html;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
