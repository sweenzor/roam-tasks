# roam-tasks — Gantt chart frontend for Roam Research



## Context



You want a Gantt chart view over TODOs in your Roam graph. Input is a list of tags or a tag prefix (e.g. `proj/*`); the tool finds every TODO referencing those tags, derives start/end dates from the block, and renders a Gantt chart. Repo is empty (`/home/user/repo`, just `CLAUDE.md`). This plan scaffolds a local web app that talks to Roam's local HTTP API (desktop app, port 8088) so queries are fast.



Decisions already made:

- **Date resolution:** attrs (`start::`/`due::`/`end::`) → inline `[[date]]` refs in the block → parent daily-note page.

- **Tag scope:** accept a list of exact tags *or* a `prefix/*` glob.

- **Deployment:** Node/TS server + static SPA, both running in Docker via `docker-compose`. Roam Desktop runs on the host; the container reaches it via `host.docker.internal:8088`.



## Architecture



```mermaid

flowchart LR

    subgraph HOST[Host machine]

      ROAM[Roam Desktop<br/>local API :8088]

      BROWSER[Browser → localhost:3000]

    end

    subgraph COMPOSE[docker-compose]

      WEB[web container<br/>Vite/nginx :3000]

      API[server container<br/>Fastify :3001]

    end

    BROWSER --> WEB

    WEB -->|/api proxy| API

    API -->|POST /api/graph/:graph/q<br/>Bearer token<br/>host.docker.internal:8088| ROAM

    API --> EX[shape: resolve tags · pull blocks ·<br/>extract dates attrs→inline→daily-note]

    EX --> OUT[(GanttRow[])]

    OUT --> WEB

```



Server owns the Roam token (kept out of the browser bundle) and does all shaping. SPA is dumb: fetch JSON, render. Roam Desktop stays on the host — it can't run in Docker.



## Repo layout



Single repo, two apps, npm workspaces, one `docker-compose.yml`.



```

/home/user/repo

├── package.json                (workspaces: server, web)

├── docker-compose.yml          services: server, web

├── .env.example                ROAM_TOKEN, ROAM_GRAPH, ROAM_API_URL, PORT

├── .dockerignore

├── server/

│   ├── Dockerfile              node:20-alpine, multi-stage (deps → build → runtime)

│   ├── package.json            (fastify, zod, undici, dotenv, vitest)

│   ├── tsconfig.json

│   └── src/

│       ├── index.ts            fastify bootstrap, CORS for :3000

│       ├── roam/

│       │   ├── client.ts       POST to {ROAM_API_URL}/api/graph/{graph}/q with Bearer token

│       │   └── queries.ts      datalog strings + typed runners

│       ├── gantt/

│       │   ├── parseDate.ts    Roam ordinal format → ISO ("March 12th, 2025" → 2025-03-12)

│       │   ├── extract.ts      attrs → inline → daily-note fallback chain

│       │   └── shape.ts        raw block pulls → GanttRow[]

│       ├── routes/

│       │   └── tasks.ts        GET /api/tasks?tags=…&prefix=…&includeDone=…

│       └── cache.ts            60s in-memory cache keyed by query string

└── web/

    ├── Dockerfile              node:20-alpine dev (vite) + nginx:alpine prod stage

    ├── nginx.conf              serves /dist, proxies /api → server:3001

    ├── package.json            (vite, react, frappe-gantt, typescript)

    ├── vite.config.ts          dev: proxy /api → server:3001; host 0.0.0.0

    └── src/

        ├── main.tsx

        ├── App.tsx             tag input, prefix toggle, includeDone, group-by, refresh

        ├── components/GanttView.tsx   frappe-gantt wrapper + lifecycle

        └── lib/api.ts          fetch('/api/tasks')

```



## Roam data model assumptions



- Blocks have `:block/uid`, `:block/string`, `:block/refs`, `:block/page`, `:block/children`, `:create/time`, `:edit/time`.

- Pages have `:node/title`. Daily notes are pages titled `"Month Dayth, YYYY"` (ordinal day, Roam convention).

- TODO/DONE are pages: a TODO block has a ref to the page titled `TODO`; DONE has ref to `DONE`.

- `start::`/`due::`/`end::` attributes appear as child blocks whose string starts with `start::`/etc. and whose `:block/refs` include the date page.



## Endpoint contract



`GET /api/tasks`



| query param    | type      | notes                                   |

|----------------|-----------|------------------------------------------|

| `tags`         | csv       | exact tag titles, e.g. `proj/alpha,proj/beta` |

| `prefix`       | string    | e.g. `proj/` — matches page titles by `starts-with?` |

| `includeDone`  | bool      | default `false`                          |

| `onlyTodos`    | bool      | default `true`; if false, include any tagged block |



Response:

```ts

type GanttRow = {

  id: string;          // block uid

  title: string;       // block string, cleaned of {{[[TODO]]}} and attr lines

  start: string;       // ISO date

  end: string;         // ISO date (== start for single-day)

  state: 'TODO' | 'DONE' | null;

  tags: string[];      // matched tag titles

  page: string;        // containing page title

  parentUid: string | null;

  source: 'attrs' | 'inline' | 'daily-note' | 'none';  // for debugging

}

```



## Datalog queries (server/src/roam/queries.ts)



**1. Resolve tag pages**

```edn

[:find ?title ?uid

 :in $ [?exact ...] ?pfx

 :where [?p :node/title ?title]

        [?p :block/uid ?uid]

        (or [(contains? ?exact ?title)]

            [(clojure.string/starts-with? ?title ?pfx)])]

```



**2. Fetch candidate blocks with one level of children (for attrs) and page title**

```edn

[:find (pull ?b [:block/uid :block/string :create/time :edit/time

                 {:block/refs [:node/title :block/uid]}

                 {:block/children [:block/string {:block/refs [:node/title]}]}

                 {:block/page [:node/title]}

                 {:block/parents [:block/uid]}])

 :in $ [?tag-uid ...]

 :where [?tag :block/uid ?tag-uid]

        [?b :block/refs ?tag]]

```



Two queries total per request. No N+1.



## Date extraction (server/src/gantt/extract.ts)



For each block:

1. **Attrs:** scan `block.children` for strings matching `/^(start|due|end)::/i`; take date page from their `:block/refs` → parse via `parseDate`. `start`+`due`/`end` → range; just one → single-day.

2. **Inline:** if no attrs, scan `block.refs` for titles that `parseDate` accepts. 1 date → due; 2+ → min/max as start/end.

3. **Daily note:** if still empty and `block.page.title` is a date → single-day on that date.

4. **None:** tag as `source:'none'`; server omits by default, SPA has a toggle to show them at `create/time`.



TODO/DONE state: check `block.refs` for a ref to `TODO` or `DONE`.



Title cleanup: strip leading `{{[[TODO]]}} ` / `{{[[DONE]]}} `, strip `#tag` suffixes for already-matched tags.



## Date parser (server/src/gantt/parseDate.ts)



Roam ordinal format: `January 1st, 2024`, `March 22nd, 2025`, `April 3rd, 2026`, `June 14th, 2025`. Small regex + month lookup, return ISO string or `null`. ~30 lines, unit-tested in isolation.



## Frontend (web/src/)



- `App.tsx`: controlled input for tags/prefix; checkboxes for `includeDone`, `showUndated`; select for group-by (`page` | `tag` | `none`); "Refresh" button.

- `GanttView.tsx`: mounts `frappe-gantt` on a ref'd `<svg>`, re-renders on data change, supports Day/Week/Month view toggle. Row label = `title`; on bar click, open `roam://#/app/{graph}/page/{uid}` (Roam deep link) in a new tab.

- `lib/api.ts`: single `fetchTasks(params)` with AbortController.



## Config



Root `.env.example` (consumed by `docker-compose.yml`):

```

ROAM_API_URL=http://host.docker.internal:8088

ROAM_GRAPH=my-graph

ROAM_TOKEN=roam-graph-local-token-...

SERVER_PORT=3001

WEB_PORT=3000

```



User gets the token from Roam Desktop → Settings → Graph → Local API Tokens. `host.docker.internal` is the standard bridge on Docker Desktop (Mac/Windows) and works on Linux when the compose file adds `extra_hosts: ["host.docker.internal:host-gateway"]`.



## Docker



`docker-compose.yml` (dev mode, hot-reload via bind mounts):

```yaml

services:

  server:

    build: ./server

    command: npm run dev

    environment:

      ROAM_API_URL: ${ROAM_API_URL}

      ROAM_GRAPH:   ${ROAM_GRAPH}

      ROAM_TOKEN:   ${ROAM_TOKEN}

      PORT:         ${SERVER_PORT}

    ports: ["${SERVER_PORT}:3001"]

    volumes:

      - ./server:/app

      - /app/node_modules

    extra_hosts:

      - "host.docker.internal:host-gateway"   # Linux

  web:

    build: ./web

    command: npm run dev -- --host 0.0.0.0

    ports: ["${WEB_PORT}:3000"]

    volumes:

      - ./web:/app

      - /app/node_modules

    depends_on: [server]

```



Vite dev proxy targets `http://server:3001` (docker DNS). For a prod build, the `web` Dockerfile's second stage serves `/dist` via nginx and proxies `/api` to `server:3001`.



`server/Dockerfile` (multi-stage):

```dockerfile

FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

FROM deps AS build

COPY . .

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY --from=build /app/dist ./dist

COPY package.json ./

EXPOSE 3001

CMD ["node", "dist/index.js"]

```



`web/Dockerfile` mirrors: dev stage runs Vite; prod stage is `nginx:alpine` with built assets + `nginx.conf` proxying `/api`.



## Open questions surfaced in the plan (decide in-flight, not blockers)



- Do you want **dependencies** (arrows between bars)? Would need a convention like `blocked-by::((uid))`. Out of scope for v1.

- **Progress %** on a bar? Could derive from `DONE` ratio of children. Skip v1.

- **Assignees / swim lanes**? Group-by covers it via `page`/`tag`. Can add `assignee::` attr later.

- **Milestones** (single-day, diamond marker)? Free via single-date → `start==end`; frappe-gantt handles it.



## Verification



1. Copy `.env.example` → `.env`, paste token, set `ROAM_GRAPH`, make sure Roam Desktop is open on that graph.

2. `docker compose up --build` → server on :3001, web on :3000.

3. Connectivity probe: `docker compose exec server wget -qO- http://host.docker.internal:8088/health` (or equivalent). If this fails on Linux, confirm `host-gateway` resolved; as a last resort, switch the server service to `network_mode: host`.

4. `curl 'http://localhost:3001/api/tasks?prefix=proj/'` — expect non-empty JSON array.

5. Open `http://localhost:3000`, enter `proj/*`, confirm bars render.

6. Unit tests (run in container): `docker compose run --rm server npm test` — covers `parseDate` (ordinals, edge months, leap day), `extract` (attrs beats inline beats daily-note), `shape` (title cleanup, state detection).

7. Manual edge cases:

   - Block with only `due::` → 1-day bar.

   - Block with `start::` + `end::` → range.

   - Block with two inline `[[date]]` refs → range (min/max).

   - DONE block hidden by default, shown when `includeDone=true`.

   - Prefix match picks up new tag pages without code change.



## Critical files to create (in order)



1. Root `package.json` (workspaces), `.env.example`, `.dockerignore`, `docker-compose.yml`.

2. `server/Dockerfile`, `server/package.json`, `server/tsconfig.json`.

3. `server/src/roam/client.ts` + `queries.ts` — prove connectivity via `docker compose run --rm server node -e "..."` before wiring routes.

4. `server/src/gantt/parseDate.ts` + unit tests.

5. `server/src/gantt/extract.ts` + `shape.ts` + unit tests.

6. `server/src/routes/tasks.ts` + `server/src/index.ts`.

7. `web/Dockerfile`, `web/nginx.conf`, `web/package.json`, `web/vite.config.ts`.

8. `web/src/` Vite scaffold, `GanttView.tsx`, `App.tsx`, `lib/api.ts`.

9. `README.md` with token setup and `docker compose up` quickstart.



## Libraries



- Server: `fastify`, `undici` (or native `fetch`), `zod`, `dotenv`, `vitest`.

- Web: `react`, `vite`, `frappe-gantt` (MIT, SVG, minimal API). If `frappe-gantt`'s imperative API becomes annoying, swap to `vis-timeline` — same data shape works.

- Roam client: start with a **thin handwritten client** (one `POST /api/graph/{graph}/q` call). Evaluate `@roam-research/roam-tools-core` later; avoid the dep until it pays for itself.

