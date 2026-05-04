#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = realpathSync(resolve(join(dirname(fileURLToPath(import.meta.url)), "..")));
const command = process.argv[2] ?? "up";
const extraArgs = process.argv.slice(3);

if (!["up", "down"].includes(command)) {
  console.error("Usage: node scripts/fallback-docker.mjs <up|down> [docker compose args...]");
  process.exit(1);
}

const worktreeHash = createHash("sha1").update(repoDir).digest("hex");
const projectName = process.env.COMPOSE_PROJECT_NAME || `roam-tasks-${worktreeHash.slice(0, 8)}`;
const hostPort = process.env.ROAM_TASKS_PORT || String(5874 + (Number.parseInt(worktreeHash.slice(0, 8), 16) % 1000));
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: projectName,
  ROAM_TASKS_PORT: hostPort
};
const localStoreDir = join(process.env.HOME || homedir(), ".roam-tasks");

mkdirSync(localStoreDir, { recursive: true });

console.log(`Docker Compose project: ${projectName}`);
console.log(`Worktree: ${repoDir}`);

const composeArgs =
  command === "up"
    ? ["compose", "-p", projectName, "up", "--build", ...extraArgs]
    : ["compose", "-p", projectName, "down", "--remove-orphans", ...extraArgs];

if (command === "up") {
  console.log(`Open http://127.0.0.1:${hostPort}`);
} else {
  console.log(`Stopping Docker fallback for ${projectName}`);
}

const result = spawnSync("docker", composeArgs, {
  cwd: repoDir,
  env,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
