import test from "node:test";
import assert from "node:assert/strict";
import {
  getConfiguredGraphs,
  getRoamPort,
  getTokenInfo,
  resolveGraph,
  roamCall,
  sanitizeGraph,
  selectDefaultGraph
} from "../server/roam-client.mjs";

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

test("configured graph loading combines file and env graphs without duplicate entries", async () => {
  const graphs = await getConfiguredGraphs({
    env: {
      ROAM_GRAPH: "env-graph",
      ROAM_GRAPH_NICKNAME: "env",
      ROAM_GRAPH_TYPE: "offline",
      ROAM_LOCAL_API_TOKEN: "env-token",
      ROAM_ACCESS_LEVEL: "full"
    },
    homeDir: "/home/test",
    readJsonFile: async (path) => {
      assert.equal(path, "/home/test/.roam-tools.json");
      return {
        graphs: [
          {
            name: "file-graph",
            nickname: "file",
            type: "hosted",
            token: "file-token",
            accessLevel: "read"
          },
          {
            name: "file-graph",
            nickname: "file",
            type: "hosted",
            token: "file-token"
          },
          { name: "missing-token", nickname: "bad" }
        ]
      };
    }
  });

  assert.deepEqual(graphs, [
    {
      name: "file-graph",
      nickname: "file",
      type: "hosted",
      token: "file-token",
      accessLevel: "read"
    },
    {
      name: "env-graph",
      nickname: "env",
      type: "offline",
      token: "env-token",
      accessLevel: "full"
    }
  ]);
});

test("Roam port reads env first and file config second", async () => {
  assert.equal(await getRoamPort({ env: { ROAM_LOCAL_API_PORT: "4567" } }), 4567);
  assert.equal(
    await getRoamPort({
      env: {},
      homeDir: "/home/test",
      readJsonFile: async (path) => {
        assert.equal(path, "/home/test/.roam-local-api.json");
        return { port: 6789 };
      }
    }),
    6789
  );
  assert.equal(await getRoamPort({ env: {}, readJsonFile: async () => null }), 3333);
});

test("Roam calls send official Local API request shape and offline graph flag", async () => {
  let request;
  const result = await roamCall(
    { name: "My Graph", nickname: "daily", type: "offline", token: "secret" },
    "q",
    ["[:find ?e]", "TODO"],
    {
      getRoamPort: async () => 4444,
      roamApiHost: "127.0.0.2",
      fetch: async (url, options) => {
        request = { url, options };
        return jsonResponse({ success: true, result: [["abc"]] });
      }
    }
  );

  assert.deepEqual(result, { success: true, result: [["abc"]] });
  assert.equal(request.url, "http://127.0.0.2:4444/api/My%20Graph?type=offline");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(request.options.headers, {
    "Content-Type": "application/json",
    Authorization: "Bearer secret"
  });
  assert.deepEqual(JSON.parse(request.options.body), {
    action: "q",
    args: ["[:find ?e]", "TODO"],
    expectedApiVersion: "1.1.2"
  });
});

test("Roam calls preserve auth failures and normalize transport failures", async () => {
  await assert.rejects(
    roamCall(
      { name: "demo", type: "hosted", token: "secret" },
      "q",
      [],
      {
        getRoamPort: async () => 3333,
        fetch: async () => jsonResponse(
          { success: false, error: { message: "Bad token", code: "TOKEN_DENIED" } },
          { ok: false, status: 401 }
        )
      }
    ),
    { statusCode: 401, code: "TOKEN_DENIED", message: "Bad token" }
  );

  await assert.rejects(
    roamCall(
      { name: "demo", type: "hosted", token: "secret" },
      "q",
      [],
      {
        getRoamPort: async () => 3333,
        fetch: async () => {
          throw new Error("offline");
        }
      }
    ),
    { statusCode: 503, code: "ROAM_UNAVAILABLE" }
  );
});

test("token info reports active metadata and hides unusable token responses", async () => {
  const active = await getTokenInfo(
    { name: "demo", type: "hosted", token: "secret" },
    {
      getRoamPort: async () => 3333,
      roamApiHost: "localhost",
      fetch: async (url, options) => {
        assert.equal(url, "http://localhost:3333/api/graphs/tokens/info");
        assert.deepEqual(JSON.parse(options.body), {
          token: "secret",
          graph: "demo",
          type: "hosted"
        });
        return jsonResponse({
          success: true,
          graphName: "demo",
          graphType: "hosted",
          grantedAccessLevel: "full",
          grantedScopes: ["q"]
        });
      }
    }
  );

  assert.deepEqual(active, {
    status: "active",
    graphName: "demo",
    graphType: "hosted",
    grantedAccessLevel: "full",
    grantedScopes: ["q"]
  });

  const unknown = await getTokenInfo(
    { name: "demo", type: "hosted", token: "bad" },
    {
      getRoamPort: async () => 3333,
      fetch: async () => jsonResponse({ success: false }, { ok: false, status: 403 })
    }
  );
  assert.deepEqual(unknown, { status: "unknown" });
});

function jsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body
  };
}
