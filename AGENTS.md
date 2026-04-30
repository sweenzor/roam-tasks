# AGENTS.md

Guidance for coding agents working in this repository.

## Project

Roam Tasks is a local-first task management web app backed by Roam Research's desktop Local API.

## Architecture

- `server/` contains the dependency-free Node HTTP server and Roam Local API proxy.
- `public/` contains the static browser app.
- `test/` contains Node built-in test runner coverage.

## Roam API

Prefer the official Roam Desktop Local API shape used by `Roam-Research/roam-tools`:

- Default local API port: `3333`, or read `~/.roam-local-api.json`.
- Default local API host: `127.0.0.1`, or `host.docker.internal` in Docker.
- Graph/token config: `~/.roam-tools.json`, with optional environment fallback from `.env.example`.
- Request route: `POST http://127.0.0.1:<port>/api/<graph>`.
- Auth: `Authorization: Bearer <roam-graph-local-token-...>`.

Keep tokens on the server side. Do not store Roam tokens in browser local storage.

## Development

- Run tests with `npm test`.
- Run the app with `npm run dev`.
- Keep the app fast and dependency-light unless a dependency removes real complexity.
