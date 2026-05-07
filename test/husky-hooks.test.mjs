import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandboxTempDir } from "./helpers/temp-dir.mjs";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("restart skip still refreshes the app bundle without relaunching", async (t) => {
  const repo = await createHookRepo(t);
  if (!repo) return;
  await commitChange(repo, "public/app.js", "console.log('needs refresh');\n");

  const result = await runPostCommit(repo, {
    appRunning: true,
    env: { ROAM_TASKS_RESTART_APP_SKIP: "1" }
  });

  assert.match(result.stdout, /Refreshing local Roam Tasks\.app for main \(post-commit\)/);
  assert.match(result.stdout, /Skipping live Roam Tasks\.app restart/);
  assert.match(result.log, /^npm run build:mac$/m);
  assert.doesNotMatch(result.log, /^osascript /m);
  assert.doesNotMatch(result.log, /^open /m);
});

test("post-commit refresh quits and reopens a running app", async (t) => {
  const repo = await createHookRepo(t);
  if (!repo) return;
  await commitChange(repo, "public/app.js", "console.log('relaunch me');\n");

  const result = await runPostCommit(repo, { appRunning: true });

  assert.match(result.stdout, /Refreshing local Roam Tasks\.app for main \(post-commit\)/);
  assert.match(result.stdout, /Restarting live Roam Tasks\.app/);
  assert.match(result.log, /^npm run build:mac$/m);
  assert.match(result.log, /^osascript -e tell application "Roam Tasks" to quit$/m);
  assert.match(result.log, new RegExp(`^open ${escapeRegExp(join(await realpath(repo), "dist", "Roam Tasks.app"))}$`, "m"));
  assert.doesNotMatch(result.log, /^pkill /m);
  assert.equal(result.state, "running\n");
});

test("post-merge refresh quits and reopens a running app on main", async (t) => {
  const repo = await createHookRepo(t);
  if (!repo) return;
  await commitChange(repo, "public/app.js", "console.log('merged relaunch');\n");

  const result = await runPostMerge(repo, { appRunning: true });

  assert.match(result.stdout, /Refreshing local Roam Tasks\.app for main \(post-merge\)/);
  assert.match(result.stdout, /Restarting live Roam Tasks\.app/);
  assert.match(result.log, /^npm run build:mac$/m);
  assert.match(result.log, /^osascript -e tell application "Roam Tasks" to quit$/m);
  assert.match(result.log, new RegExp(`^open ${escapeRegExp(join(await realpath(repo), "dist", "Roam Tasks.app"))}$`, "m"));
  assert.doesNotMatch(result.log, /^pkill /m);
  assert.equal(result.state, "running\n");
});

test("refresh skip does not quit or reopen the running app", async (t) => {
  const repo = await createHookRepo(t);
  if (!repo) return;
  await commitChange(repo, "public/app.js", "console.log('refresh skipped');\n");

  const result = await runPostCommit(repo, {
    appRunning: true,
    env: { ROAM_TASKS_REFRESH_APP_SKIP: "1" }
  });

  assert.match(result.stdout, /Skipping Roam Tasks\.app refresh/);
  assert.doesNotMatch(result.log, /^npm /m);
  assert.doesNotMatch(result.log, /^osascript /m);
  assert.doesNotMatch(result.log, /^open /m);
});

test("post-commit refresh defaults to main instead of the current feature branch", async (t) => {
  const repo = await createHookRepo(t, { branch: "feature/hook-work" });
  if (!repo) return;
  await commitChange(repo, "public/app.js", "console.log('feature branch');\n");

  const result = await runPostCommit(repo, { appRunning: true });

  assert.equal(result.stdout, "");
  assert.equal(result.log, "");
});

async function createHookRepo(t, options = {}) {
  const repo = await createSandboxTempDir(t, "roam-tasks-hooks");
  if (!repo) return null;

  await mkdir(join(repo, ".husky"), { recursive: true });
  await mkdir(join(repo, "public"), { recursive: true });
  await mkdir(join(repo, "scripts"), { recursive: true });
  await writeFile(join(repo, "package.json"), "{}\n");
  await writeFile(join(repo, "scripts", "build-macos-app.mjs"), "\n");
  await writeFile(join(repo, "public", "app.js"), "console.log('initial');\n");

  for (const hook of ["post-commit", "post-merge", "roam-tasks-refresh-macos-app"]) {
    const destination = join(repo, ".husky", hook);
    await copyFile(join(sourceRoot, ".husky", hook), destination);
    await chmod(destination, 0o755);
  }

  await createFakeCommands(repo);
  git(repo, "init");
  git(repo, "checkout", "-b", "main");
  git(repo, "config", "user.name", "Hook Test");
  git(repo, "config", "user.email", "hook-test@example.com");
  git(repo, "add", ".");
  git(repo, "commit", "--no-gpg-sign", "-m", "initial");

  if (options.branch) {
    git(repo, "checkout", "-b", options.branch);
  }

  return repo;
}

async function commitChange(repo, relativePath, content) {
  await writeFile(join(repo, relativePath), content);
  git(repo, "add", relativePath);
  git(repo, "commit", "--no-gpg-sign", "-m", "change");
}

async function createFakeCommands(repo) {
  const binDir = join(repo, "fake-bin");
  await mkdir(binDir);

  await writeFakeCommand(
    binDir,
    "uname",
    `#!/bin/sh
printf 'Darwin\\n'
`
  );
  await writeFakeCommand(
    binDir,
    "pgrep",
    `#!/bin/sh
if [ "$(cat "$ROAM_TASKS_TEST_STATE" 2>/dev/null)" = "running" ]; then
  exit 0
fi
exit 1
`
  );
  await writeFakeCommand(
    binDir,
    "osascript",
    `#!/bin/sh
printf 'osascript %s\\n' "$*" >> "$ROAM_TASKS_TEST_LOG"
printf 'stopped\\n' > "$ROAM_TASKS_TEST_STATE"
`
  );
  await writeFakeCommand(
    binDir,
    "pkill",
    `#!/bin/sh
printf 'pkill %s\\n' "$*" >> "$ROAM_TASKS_TEST_LOG"
printf 'stopped\\n' > "$ROAM_TASKS_TEST_STATE"
`
  );
  await writeFakeCommand(
    binDir,
    "open",
    `#!/bin/sh
printf 'open %s\\n' "$*" >> "$ROAM_TASKS_TEST_LOG"
printf 'running\\n' > "$ROAM_TASKS_TEST_STATE"
`
  );
  await writeFakeCommand(
    binDir,
    "npm",
    `#!/bin/sh
printf 'npm %s\\n' "$*" >> "$ROAM_TASKS_TEST_LOG"
if [ "$1" = "run" ] && [ "$2" = "build:mac" ]; then
  mkdir -p "dist/Roam Tasks.app"
fi
`
  );
}

async function writeFakeCommand(binDir, name, content) {
  const path = join(binDir, name);
  await writeFile(path, content, { mode: 0o755 });
}

async function runPostCommit(repo, options = {}) {
  return runHook(repo, "post-commit", options);
}

async function runPostMerge(repo, options = {}) {
  return runHook(repo, "post-merge", options);
}

async function runHook(repo, hook, options = {}) {
  const stateFile = join(repo, "app-state");
  const logFile = join(repo, "command-log");
  const tempDir = join(repo, "hook-tmp");
  await mkdir(tempDir, { recursive: true });
  await writeFile(stateFile, options.appRunning ? "running\n" : "stopped\n");
  await writeFile(logFile, "");

  const env = {
    ...process.env,
    PATH: `${join(repo, "fake-bin")}:${process.env.PATH}`,
    ROAM_TASKS_TEST_LOG: logFile,
    ROAM_TASKS_TEST_STATE: stateFile,
    TMPDIR: tempDir
  };
  delete env.ROAM_TASKS_REFRESH_APP_BRANCH;
  delete env.ROAM_TASKS_REFRESH_APP_SKIP;
  delete env.ROAM_TASKS_RESTART_APP_SKIP;
  Object.assign(env, options.env || {});

  const stdout = execFileSync("sh", [join(repo, ".husky", hook)], {
    cwd: repo,
    encoding: "utf8",
    env
  });

  return {
    log: await readFile(logFile, "utf8"),
    state: await readFile(stateFile, "utf8"),
    stdout
  };
}

function git(repo, ...args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, HUSKY: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
