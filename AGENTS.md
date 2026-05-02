# AGENTS.md

Guidance for coding agents working in this repository.

## Project

Roam Tasks is a local-first task management web app backed by Roam Research's desktop Local API.

## Architecture

- `electron/` contains the Electron desktop shell, which starts the local server in-process.
- `server/` contains the dependency-free Node HTTP server and Roam Local API proxy.
- `public/` contains the static browser app.
- `test/` contains Node built-in test runner coverage.

## Roam API

Prefer the official Roam Desktop Local API shape used by `Roam-Research/roam-tools`:

- Default local API port: `3333`, or read `~/.roam-local-api.json`.
- Default local API host: `127.0.0.1`, or `host.docker.internal` in Docker.
- Default graph can be selected with `ROAM_DEFAULT_GRAPH`, matching either graph nickname or graph name.
- Graph/token config: `~/.roam-tools.json`, with optional environment fallback from `.env.example`.
- Request route: `POST http://127.0.0.1:<port>/api/<graph>`.
- Auth: `Authorization: Bearer <roam-graph-local-token-...>`.

Keep tokens on the server side. Do not store Roam tokens in browser local storage.

## Development

- Run tests with `npm test`; it includes the help-graph integration test by default and requires Roam Desktop's Local API/token config.
- Run only the Roam help-graph integration test with `npm run test:integration`; skip it with `SKIP_ROAM_HELP_GRAPH_INTEGRATION=1 npm test` when Roam Desktop is unavailable.
- Run the app with `npm run dev`; this launches Electron and starts the server inside the desktop process.
- For agent browser inspection, use `npm run fallback:docker` and open the printed localhost URL. The fallback creates a worktree-specific Docker Compose project and host port, avoiding fixed-port `localhost:5874` collisions or stale servers from another runtime. Stop that worktree's Compose project with `npm run fallback:docker:down`.
- Use `npm run server` only for quick manual checks from a normal host shell; it binds the fixed `5874` port and is not the preferred path for in-app browser previews.
- Keep the app fast and dependency-light unless a dependency removes real complexity.

## Pull Requests

- Open full, ready-for-review PRs by default; do not create draft PRs unless the user explicitly asks for a draft.
- Write polished PR descriptions with a clear summary, relevant implementation notes, and verification performed.
