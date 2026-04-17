# roam-gantt

A Gantt chart frontend for [Roam Research](https://roamresearch.com/) TODOs.

- Point it at a list of exact tags and/or a `prefix/` glob.
- It pulls every TODO block that references those tags, resolves start/end dates from the block, and renders an interactive Gantt chart.
- Click a bar to flip its `{{[[TODO]]}} ⇄ {{[[DONE]]}}` state back in Roam.
- Undated TODOs appear in a dedicated "Unscheduled" lane instead of disappearing.

Data comes from **Roam Desktop's local HTTP API** on `:8088`, so queries are fast and no cloud graph token is required.

## Quickstart

```bash
cp .env.example .env
# Open Roam Desktop → Settings → Graph → Local API Tokens → generate a token.
# Paste the token and your graph name into .env.
docker compose up --build
```

Then open <http://localhost:5757>.

Enter a prefix (e.g. `proj/`) or a csv tag list. Every TODO block referencing any matching tag page shows up in the chart.

## Configuration

`.env` (copied from `.env.example`):

| var            | example                              | purpose                                              |
|----------------|--------------------------------------|------------------------------------------------------|
| `ROAM_API_URL` | `http://host.docker.internal:8088`   | Where Roam Desktop is listening.                     |
| `ROAM_GRAPH`   | `my-graph`                           | Graph name (as it appears in the Roam URL).         |
| `ROAM_TOKEN`   | `roam-graph-local-...`               | Local-API token from Roam Desktop settings.          |
| `SERVER_PORT`  | `5758`                               | Host-side port forwarded to the Fastify container (internally :3001). |
| `WEB_PORT`     | `5757`                               | Host-side port forwarded to the Vite/nginx container (internally :3000). |
| `FIXTURE_PATH` | `/app/fixtures/sample-graph.json`    | **Dev only.** If set, the server ignores Roam and reads a committed fixture. Unset for production use. |

On Linux hosts, `host.docker.internal` is mapped via `extra_hosts: host-gateway` in `docker-compose.yml` (already configured). As a fallback, switch the `server` service to `network_mode: host`.

## Data conventions

The server resolves a TODO's dates in this order (first hit wins):

1. **Attrs**: child blocks of the TODO whose strings begin with `start::`, `due::`, or `end::`. `start + end`/`start + due` → range; just `due` → single-day milestone.
2. **Inline refs**: `[[April 17th, 2026]]` pages referenced directly in the block string. One date → single-day; two or more → `min`/`max` as start/end.
3. **Daily note**: if the block lives on a daily-note page, the page's date becomes the task's date.
4. **None**: the task appears in the Unscheduled lane until a date is added.

Attributes always win. Inline refs are only used when no attribute is present.

## Fixture / dev mode

For frontend work without Roam Desktop running, point the server at the committed fixture:

```bash
FIXTURE_PATH=/app/fixtures/sample-graph.json docker compose up
```

The fixture exercises every fallback tier plus DONE/TODO and an unscheduled row. Toggles mutate the in-process copy but do not persist past a container restart.

## Tests

```bash
docker compose run --rm server npm test
```

Covers `parseDate`, `extract` (attrs beats inline beats daily-note; 2-inline min/max range; unscheduled bucket), `shape` (title cleanup, primary-tag grouping, DONE/TODO detection), and `rewriteMarker` (TODO⇄DONE, insertion when neither marker is present).

## Stack

- **Server** — Fastify, Zod, Undici, Vitest (TypeScript, ESM).
- **Web** — Vite, React, TanStack Query, frappe-gantt.
- **Infra** — Docker Compose with two services (`server`, `web`). Roam Desktop stays on the host and is reached via `host.docker.internal:8088`.

## Out of scope for v1

Dependency arrows between bars, drag-to-reschedule, progress %, assignees/swim-lanes beyond primary-tag/page grouping. Task status is the only thing writable back to Roam today.
