import test from "node:test";
import assert from "node:assert/strict";
import { resolveGraph, sanitizeGraph, selectDefaultGraph } from "../server/roam-client.mjs";

test("Roam graph selection skips the public help graph by default", () => {
  const help = {
    name: "help",
    nickname: "roam-official-help-graph",
    type: "hosted",
    token: "help-token"
  };
  const personal = {
    name: "personal-graph",
    nickname: "personal",
    type: "hosted",
    token: "personal-token"
  };

  assert.equal(selectDefaultGraph([help, personal]), personal);
  assert.equal(selectDefaultGraph([help]), help);
});

test("Roam graph resolution reports empty and unknown graph config clearly", async () => {
  await assert.rejects(
    resolveGraph({ getConfiguredGraphs: async () => [] }, ""),
    { code: "BAD_REQUEST" }
  );

  await assert.rejects(
    resolveGraph({ getConfiguredGraphs: async () => [{ name: "demo", nickname: "demo" }] }, "missing"),
    { code: "NOT_FOUND" }
  );

  assert.deepEqual(
    await resolveGraph({ getConfiguredGraphs: async () => [{ name: "demo", nickname: "demo" }] }, "demo"),
    { name: "demo", nickname: "demo" }
  );
});

test("sanitized graph metadata never includes tokens", () => {
  assert.deepEqual(
    sanitizeGraph({
      name: "demo",
      nickname: "personal",
      type: "hosted",
      accessLevel: "full",
      token: "secret"
    }),
    {
      name: "demo",
      nickname: "personal",
      type: "hosted",
      accessLevel: "full"
    }
  );
});
