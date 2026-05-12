import test from "node:test";
import assert from "node:assert/strict";
import { renderInlineMarkdown, renderPathChipText } from "../public/markdown-renderer.js";

test("inline markdown escapes text while linking Roam pages, tags, and block refs", () => {
  const html = renderInlineMarkdown("Call [[Project]] #next ((abc123)) <x>", {
    blockStrings: { abc123: "{{[[TODO]]}} Review **Block**" },
    pageUids: { Project: "page-1", next: "tag-1" },
    roamBlockUrl: (uid) => `block:${uid}`,
    roamPageUrl: (_title, uid) => `page:${uid}`
  });

  assert.match(html, /&lt;x&gt;/);
  assert.match(html, /href="page:page-1" data-roam-uid="page-1"/);
  assert.match(html, /href="page:tag-1" data-roam-uid="tag-1"/);
  assert.match(html, /href="block:abc123" data-roam-uid="abc123"/);
  assert.match(html, />Review Block</);
});

test("inline markdown drops unsafe markdown links", () => {
  const html = renderInlineMarkdown("[bad](javascript:alert(1)) [ok](https://example.com)", {
    roamBlockUrl: (uid) => `block:${uid}`,
    roamPageUrl: (title) => `page:${title}`
  });

  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /^bad /);
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noreferrer">ok<\/a>/);
});

test("path chip rendering strips task markers and emphasizes Roam references", () => {
  assert.equal(
    renderPathChipText("{{[[TODO]]}} #[[Next Actions]] **Call** `Sam`"),
    '<strong class="path-page-link">#Next Actions</strong> Call Sam'
  );
});
