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

## Dock Shortcut

Build a Dockable macOS app bundle:

```bash
npm run build:mac
```

This creates `dist/Roam Tasks.app` using the repo-local Electron install. It does not install anything globally or copy files outside this repository.

To add it to the Dock, open `dist/` in Finder, drag `Roam Tasks.app` into `/Applications`, launch it once, then choose **Options -> Keep in Dock** from its Dock icon. You can also keep it in the Dock directly from `dist/`, but `/Applications` is less fragile if you later move this repo.

## Web Server Only

```bash
npm run server
```

Then open `http://localhost:5874`. This is useful for quick browser debugging, but the normal app runtime is Electron.

## Flagged Browser Fallback

```bash
npm run fallback:docker
```

Then open `http://localhost:5874`.

This is a fallback for agents that need to inspect the app in a normal browser when the Electron GUI is not available. Docker runs the web server only; it does not run Electron. The compose file mounts `~/.roam-tools.json` and `~/.roam-local-api.json` read-only into the container and sets `ROAM_LOCAL_API_HOST=host.docker.internal` so the container can reach Roam Desktop on the host.

Stop the fallback container with:

```bash
npm run fallback:docker:down
```

By default, the app uses the first configured non-help graph. To pin a specific graph, set `ROAM_DEFAULT_GRAPH` in your shell or local `.env` file before starting Docker.

## Testing

```bash
npm test
npm run test:coverage
```

### Coverage

`npm run test:coverage` uses Node's built-in coverage runner and currently targets full coverage for `server/task-utils.mjs`.

### Integration test: Roam public help graph

The Roam help-graph integration test runs by default as part of `npm test`. It starts the local app server automatically, calls `GET /api/health?graph=roam-official-help-graph`, and validates the server can resolve the configured graph/token path end-to-end.

```bash
npm test
RUN_ROAM_INTEGRATION_TESTS=0 npm test
```

Set `RUN_ROAM_INTEGRATION_TESTS=0` when you only want the dependency-free unit tests. To target a different public graph nickname, set `ROAM_PUBLIC_HELP_GRAPH`.

In GitHub Actions, the hosted coverage job disables this local Roam integration test with `RUN_ROAM_INTEGRATION_TESTS=0`. The dedicated integration job runs only when repository variable `RUN_ROAM_HELP_GRAPH_INTEGRATION` is set to `1`.

The integration job is configured for a self-hosted runner (`self-hosted`, `linux`, `roam`) so it can access a real Roam Desktop Local API endpoint.

## Task Format

Roam tasks are blocks containing Roam's TODO marker:

```text
{{[[TODO]]}} Send invoice [[May 1st, 2026]] #admin
```

The app reads `{{[[TODO]]}}`, `{{[[DONE]]}}`, and `{{[[Abandoned]]}}` blocks, parses common Roam date links, and updates the original Roam block when you complete, edit, or delete a task.

## Local API Notes

Roam Desktop exposes the local API at `http://127.0.0.1:<port>/api/<graph>`, usually port `3333`. If Roam writes `~/.roam-local-api.json`, this app uses the port from that file. In Docker, the app uses `ROAM_LOCAL_API_HOST=host.docker.internal`.
