# Roam Tasks

A fast, local-first Electron task manager for Roam Research tasks. The desktop app starts a local Node server inside Electron; the browser window talks only to that server, and the server reads Roam local API tokens from `~/.roam-tools.json` or environment variables before proxying requests to Roam Desktop.

## Requirements

- Node.js 20 or newer
- npm dependencies installed in this repo with `npm install`
- Roam Research desktop app, with your graph open
- A Roam Local API token

The easiest token setup is Roam's official flow:

```bash
npx @roam-research/roam-mcp connect
```

You can also create a token in Roam Desktop under Settings -> Graph -> Local API Tokens. Manual config lives at `~/.roam-tools.json`:

```json
{
  "version": 1,
  "graphs": [
    {
      "name": "your-graph-name",
      "type": "hosted",
      "token": "roam-graph-local-token-...",
      "nickname": "personal",
      "accessLevel": "full"
    }
  ]
}
```

## Run

Install repo-local dependencies once:

```bash
npm install
```

Then launch the app:

```bash
npm start
```

This launches the Electron app. Electron starts the Node server inside the desktop process on a private loopback port and loads the UI in a sandboxed browser window. Roam graph tokens stay server-side and are never stored in browser local storage.

For development, `npm run dev` does the same thing. The Electron dependency is local to this repository at `node_modules/`; it is not installed globally.

## Local GTD State

The GTD sandbox state is stored outside Roam in a local JSON file. In the Electron app, the file is:

```text
~/Library/Application Support/Roam Tasks/gtd-state.json
```

The web-server-only runtime uses `~/.roam-tasks/gtd-state.json`, or the path from `ROAM_TASKS_LOCAL_STORE_PATH` when that environment variable is set. The Docker fallback mounts host `~/.roam-tasks` into the container so browser-inspection state can survive container rebuilds.

## Dock Shortcut

Build a Dockable macOS app bundle:

```bash
npm run build:mac
```

This creates `dist/Roam Tasks.app` using the repo-local Electron install. It does not install anything globally or copy files outside this repository.

To add it to the Dock, open `dist/` in Finder, drag `Roam Tasks.app` into `/Applications`, launch it once, then choose **Options -> Keep in Dock** from its Dock icon. You can also keep it in the Dock directly from `dist/`, but `/Applications` is less fragile if you later move this repo.

### Live Commit Refresh

The Husky hooks refresh `dist/Roam Tasks.app` on `main` after app code changes. If the app is already running when a commit refreshes the bundle, `post-commit` quits and reopens it so the live window picks up the new build. Lightweight UI preferences such as the selected view, search query, sort, Since filter, and quick-add draft are kept in browser storage across the relaunch.

Set `ROAM_TASKS_RESTART_APP_SKIP=1` to rebuild without reopening the running app, or `ROAM_TASKS_REFRESH_APP_SKIP=1` to skip the hook refresh entirely.

## Browser Debugging

```bash
npm run fallback:docker
```

Then open the URL printed by the script. Each worktree gets its own Docker Compose project name and a stable default host port derived from the worktree path, so multiple worktrees can run at the same time.

Use this path when an agent needs to inspect the app in a normal or in-app browser. It avoids fixed-port `localhost:5874` collisions and keeps browser previews tied to the current worktree. Docker runs the web server only; it does not run Electron. The compose file binds the app to `127.0.0.1`, mounts `~/.roam-tools.json` and `~/.roam-local-api.json` read-only into the container, mounts `~/.roam-tasks` for GTD state, and sets `ROAM_LOCAL_API_HOST=host.docker.internal` so the container can reach Roam Desktop on the host.

To choose a port explicitly, run:

```bash
ROAM_TASKS_PORT=5874 npm run fallback:docker
```

Stop the fallback container with:

```bash
npm run fallback:docker:down
```

By default, the app uses the first configured non-help graph. To pin a specific graph, set `ROAM_DEFAULT_GRAPH` in your shell or local `.env` file before starting Docker.

### Web Server Only

```bash
npm run server
```

Then open `http://localhost:5874`. This is useful for quick manual checks from a normal host shell, but it uses a fixed port and is not the recommended browser-inspection path for agents or worktree-parallel debugging. The normal app runtime is Electron.

## Testing

```bash
npm test
npm run test:coverage
```

### Coverage

`npm test` runs the fast local unit and API contract tests plus the Roam help-graph integration test. The integration test requires Roam Desktop's Local API and a configured token path. `npm run test:coverage` uses Node's built-in coverage runner over the fast suite only.

### Integration test: Roam public help graph

The Roam help-graph integration test runs by default with `npm test`. It starts the local app server automatically, calls `GET /api/health?graph=roam-official-help-graph`, and validates the server can resolve the configured graph/token path end-to-end.

```bash
npm run test:integration
SKIP_ROAM_HELP_GRAPH_INTEGRATION=1 npm test
```

To run only that integration test, use `npm run test:integration`. To skip it in a local environment without Roam Desktop, set `SKIP_ROAM_HELP_GRAPH_INTEGRATION=1`. To target a different public graph nickname, set `ROAM_PUBLIC_HELP_GRAPH`.

GitHub Actions does not run the Roam help-graph integration test because the Roam Desktop Local API is not available there. PR CI runs the hosted fast coverage job and Docker build only.

## Task Format

Roam tasks are blocks containing Roam's TODO marker:

```text
{{[[TODO]]}} Send invoice [[May 1st, 2026]] #admin
```

The app reads `{{[[TODO]]}}`, `{{[[DONE]]}}`, and `{{[[Abandoned]]}}` blocks, parses common Roam date links, and layers GTD organization state on top locally. Captured sandbox tasks, task category changes, local completion state, and local removals are stored in the local GTD JSON file rather than written back to Roam.

## Local API Notes

Roam Desktop exposes the local API at `http://127.0.0.1:<port>/api/<graph>`, usually port `3333`. If Roam writes `~/.roam-local-api.json`, this app uses the port from that file. In Docker, the app uses `ROAM_LOCAL_API_HOST=host.docker.internal`.
