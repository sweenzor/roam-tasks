import test from "node:test";
import assert from "node:assert/strict";
import { readTasks } from "../server/task-reader.mjs";

test("task enrichment falls back for block refs and page uids while tolerating optional failures", async () => {
  const context = {
    roamCall: async (_graph, action, args) => {
      assert.equal(action, "q");
      const [query, input] = args;

      if (input === "TODO") {
        return {
          success: true,
          result: [[
            "task1",
            "{{[[TODO]]}} Review [[Project]] #Tag ((ref1))",
            "Inbox",
            "inboxuid",
            1,
            2
          ]]
        };
      }
      if (input === "DONE" || input === "Abandoned") return { success: true, result: [] };

      if (Array.isArray(input) && query.includes(":find ?uid ?string")) {
        throw new Error("batch block strings unavailable");
      }
      if (query.includes(":find ?string") && input === "ref1") {
        return { success: true, result: [["{{[[TODO]]}} Referenced [[Ref Page]]"]] };
      }

      if (Array.isArray(input) && query.includes("?parent-string")) {
        throw new Error("parents unavailable");
      }
      if (Array.isArray(input) && query.includes("?child-string")) {
        throw new Error("children unavailable");
      }

      if (Array.isArray(input) && query.includes(":find ?title ?uid")) {
        throw new Error("batch page uids unavailable");
      }
      if (typeof input === "string" && query.includes(":find ?uid")) {
        return { success: true, result: [[`${input}-uid`]] };
      }

      return { success: true, result: [] };
    }
  };

  const [task] = await readTasks(context, { name: "demo" }, { includeDone: false });

  assert.equal(task.uid, "task1");
  assert.deepEqual(task.blockStrings, {
    ref1: "{{[[TODO]]}} Referenced [[Ref Page]]"
  });
  assert.deepEqual(task.pageUids, {
    Inbox: "inboxuid",
    Project: "Project-uid",
    Tag: "Tag-uid"
  });
  assert.deepEqual(task.breadcrumb, []);
  assert.deepEqual(task.details, []);
});
