# Switchboard

Switchboard is a shared team inbox. Customers write to a business through a
messaging provider (Pigeon). Support agents at that business sign in, see
conversations arrive in real time, take ownership of a conversation, and reply.
Several businesses (workspaces) share one deployment and never see each other's
data.

The project was built for the Switchboard build round described in
[`BRIEF.md`](BRIEF.md). The simulated services it talks to (Pigeon, a mock
identity provider, Paybox) and the automatic check live in this repository and
were provided with the brief.

---

## Contents

1. [Features](#features)
2. [Technology stack](#technology-stack)
3. [Architecture](#architecture)
4. [Folder structure](#folder-structure)
5. [Getting started](#getting-started)
6. [Environment variables](#environment-variables)
7. [How it works](#how-it-works)
8. [API reference](#api-reference)
9. [Grader endpoints](#grader-endpoints)
10. [Testing and checks](#testing-and-checks)
11. [npm scripts](#npm-scripts)
12. [Troubleshooting](#troubleshooting)
13. [Security considerations](#security-considerations)
14. [Known limitations](#known-limitations)

---

## Features

- **Sign-in with OpenID Connect** (authorization code flow with PKCE) against the
  mock identity provider. Workspaces and roles come from the identity token.
- **Multi-tenant workspaces.** Every API query is scoped to one workspace; a
  signed-in user who is not a member gets `403`.
- **Inbox.** Conversations per customer, newest activity first, paginated, with
  Open, Assigned to me, Unassigned and Closed views, search and unread markers.
- **Atomic claiming.** One agent holds a conversation; when several agents claim
  at the same instant, exactly one wins.
- **Close and reopen** conversations. A new customer message reopens a closed one.
- **Replies through Pigeon** with a delivery status per message (queued, sent,
  delivered, failed). Replies are stored before they are acknowledged, sent
  exactly once, retried through provider outages, and kept within Pigeon's rate
  limit across all server copies.
- **Webhook ingestion** that rejects forged and replayed requests, ignores
  duplicates, keeps messages in the order they happened, and survives a crash
  between receiving and storing an event.
- **Real time over WebSockets.** New messages, status changes and assignments
  appear without a refresh. A client that reconnects receives exactly what it
  missed.
- **Horizontal scaling.** Several server copies can run behind a load balancer;
  they share MongoDB and Redis, and a copy that dies has its pending work finished
  by the others.
- **React frontend** with light and dark themes, a responsive layout for desktop,
  tablet and phone, and keyboard shortcuts.

## Technology stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js 22, Express 5, JavaScript ES modules |
| Database | MongoDB 7 with Mongoose 9 |
| Shared state | Redis 7 with the official `redis` client (sessions, rate limit, real-time events) |
| Real time | `ws` (native WebSockets), Redis pub/sub between server copies |
| Security middleware | `helmet`, `cors` |
| Logging | `morgan` |
| Frontend | React 19, React Router 7, Vite 8, `lucide-react` icons, plain CSS with design tokens |
| Tests | Node's built-in test runner (`node:test`) against real MongoDB and Redis |
| Services | Docker Compose: MongoDB, Redis, Pigeon, mock IdP, Paybox |

## Architecture

```
simulated customers -> Pigeon :4010 --webhook--> backend :4000 --WebSocket--> React app :5173
                                                     |
agent replies in the app -> backend (outbox in MongoDB) -> worker -> POST /v1/messages on Pigeon
                                                     |
                          Pigeon status webhooks -> backend -> WebSocket -> React app
```

### Backend

The backend is an Express application in `backend/`. It starts listening only
after MongoDB and Redis are connected and the database indexes are built.

| Part | Responsibility |
| --- | --- |
| `config/` | Loads the root `.env`, connects MongoDB and Redis, builds indexes |
| `routes/`, `controllers/` | HTTP routes and request validation |
| `middleware/` | Session check (`401`), workspace membership (`403`), grader token, errors |
| `services/` | Business logic: claiming, replies, OIDC, sessions, rate limit, real-time events, WebSocket server, grader reset and snapshot |
| `workers/outbound.worker.js` | Sends stored replies to Pigeon; every server copy runs one |
| `models/` | Mongoose models: `Workspace`, `Conversation`, `Message`, `WebhookEvent` |

What lives where:

- **MongoDB** stores workspaces, conversations, messages (including the outbound
  outbox) and received webhook events.
- **Redis** stores login sessions, login state during the OIDC redirect, the
  per-workspace send rate limit, and the real-time event log and sequence numbers.

### Frontend

The frontend is a Vite + React single-page app in `frontend/`.

| Part | Responsibility |
| --- | --- |
| `src/api/` | `fetch` wrapper and one function per backend endpoint |
| `src/context/` | `AuthContext` (current user), `InboxContext` (conversations, threads, actions), `ToastContext` |
| `src/state/inboxReducer.js` | Merges API responses and live frames without duplicates; statuses only move forward |
| `src/hooks/useRealtime.js` | WebSocket connection with reconnect and replay |
| `src/components/` | Sidebar, conversation list, chat panel, details panel and shared UI pieces |
| `src/pages/` | Login, inbox, and status pages (loading, no access, not found) |
| `src/styles/` | Design tokens and component styles, light and dark |

In development the Vite server proxies `/api`, `/auth` and `/ws` to the backend,
so the browser talks to a single origin and the session cookie is sent
automatically.

## Folder structure

```
.
├── backend/                 Express API, WebSocket server and outbox worker
│   ├── config/              env.js, database.js, redis.js
│   ├── controllers/         auth, conversation, grader, pigeonWebhook, health
│   ├── middleware/          auth, workspace, graderAuth, error
│   ├── models/              workspace, conversation, message, webhook
│   ├── routes/              auth, conversation, grader, pigeonWebhook, health
│   ├── services/            business logic (see the table above)
│   ├── tests/               claim.test.js, webhook-outbox.test.js
│   ├── utils/               cookies, httpError, pagination, verifyPigeonSignature
│   ├── workers/             outbound.worker.js
│   └── server.js            entry point
├── frontend/                React app (Vite)
│   └── src/                 api, components, context, hooks, pages, state, styles, utils
├── harness/                 the automatic check and the environment doctor (provided)
├── pigeon/ idp/ paybox/     simulated services (provided)
├── scaffold/                optional starter shell from the brief (not used)
├── ai-logs/                 exported AI session transcripts
├── docker-compose.yml       MongoDB, Redis and the simulators
├── switchboard.json         install and start commands used by the check
├── .env.example             every variable, with development values
├── CHECK_REPORT.json        output of the last check run
├── DECISIONS.md             decisions, assumptions and known problems
└── BRIEF.md, START_HERE.md, PIGEON.md, PAYBOX.md, BONUS_BILLING.md, SUBMISSION.md
```

## Getting started

### Prerequisites

- **Node.js 22** or newer (`node -v`)
- **Docker** with Docker Compose (Docker Desktop on Windows and macOS)
- **Git**

Without Docker, `npm run mocks` starts the simulators with plain Node; you then
need your own MongoDB and Redis and must point `MONGO_URL` and `REDIS_URL` at them.

### 1. Clone and configure

```bash
git clone https://github.com/theinvinciblek/SwitchBoard-Task.git
cd SwitchBoard-Task
cp .env.example .env
```

The backend reads the **root** `.env` file (see `backend/config/env.js`).
Values already set in the environment take precedence, which is how the check
passes its own `PORT`.

### 2. Start MongoDB, Redis and the simulators

```bash
npm run up        # docker compose up -d, then waits until every service answers
npm run doctor    # checks every port and says what to fix
```

| Service | Port | Purpose |
| --- | --- | --- |
| MongoDB | 27017 | Application database (`switchboard`) |
| Redis | 6379 | Sessions, rate limit, real-time events |
| Pigeon | 4010 | Simulated messaging provider |
| Mock IdP | 4020 | OpenID Connect provider with five test users |
| Paybox | 4030 | Simulated payments (bonus track, not used by this app) |

Elasticsearch (`npm run up:search`) is optional and not used by this app.

### 3. Start the backend

```bash
cd backend
npm install
npm run dev       # with automatic restart (nodemon); or: npm start
```

The server logs `MongoDB connected`, `Redis connected`, the configured
workspaces and `Server listening on http://localhost:4000`.
Check it with `curl http://localhost:4000/healthz`.

### 4. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

The dev server must run on port **5173**: `WEB_ORIGIN` and the identity
provider's registered redirect expect it, so the port is fixed (`strictPort`).

### 5. Sign in

Open http://localhost:5173 and choose **Continue with single sign-on**. The mock
identity provider has no passwords; pick a user from its list:

| User | Workspaces |
| --- | --- |
| Asha Rao, `asha@acme.test` | `ws_acme` (admin) |
| Ben Ortiz, `ben@acme.test` | `ws_acme` (agent) |
| Chloe Martin, `chloe@globex.test` | `ws_globex` (admin) |
| Dev Patel, `dev@globex.test` | `ws_globex` (agent) |
| Eli Novak, `eli@contractor.test` | `ws_acme` (agent), `ws_globex` (agent) |

Pigeon sends a simulated customer message every few seconds, so the inbox fills
up on its own. `npm run inbound` makes a customer write immediately, and
`npm run quiet` stops the automatic messages.

### Stopping

```bash
npm run down      # stops the Docker services
```

## Environment variables

All variables are listed in [`.env.example`](.env.example) with the values the
local simulators expect. None of them is a real secret.

| Variable | Used by the backend for |
| --- | --- |
| `PORT` | Port to listen on (default `4000`) |
| `WEB_ORIGIN` | Frontend origin: CORS, the post-login redirect, and the allowed WebSocket `Origin` |
| `GRADER_TOKEN` | Value required in the `x-grader-token` header on `/__grader/*`. If unset, every grader request is refused with `401` |
| `MONGO_URL` | MongoDB connection string (required) |
| `REDIS_URL` | Redis connection string (required) |
| `PIGEON_URL` | Base URL of the Pigeon send API |
| `PIGEON_WEBHOOK_SECRET` | Secret for verifying `x-pigeon-signature` on incoming webhooks |
| `PIGEON_KEY_WS_<NAME>` | Pigeon API key per workspace. Each variable also **defines a workspace**: `PIGEON_KEY_WS_ACME` creates `ws_acme` at startup |
| `OIDC_ISSUER` | Identity provider base URL (discovery, token and keys) |
| `OIDC_CLIENT_ID` | OIDC client id |
| `OIDC_CLIENT_SECRET` | OIDC client secret, sent in the token exchange |
| `OIDC_REDIRECT_URI` | Callback URL registered with the IdP (`http://localhost:4000/auth/callback`) |
| `NODE_ENV` | `production` switches nothing functional; the check sets it |

`ELASTICSEARCH_URL` and the `PAYBOX_*` variables are listed in `.env.example`
for the provided services but are not used by this application.

The frontend dev server reads one optional variable, `BACKEND_URL`
(default `http://localhost:4000`), as the proxy target.

`backend/.env.example` is a copy of the variable names with placeholder values;
the backend does not read a `backend/.env` file.

## How it works

### Authentication (OIDC)

1. The browser opens `GET /auth/login`. The backend creates a random `state`,
   `nonce` and PKCE verifier, stores them in Redis for 10 minutes, sets a
   short-lived `sb_login` cookie with the `state`, and redirects to the IdP's
   authorization endpoint with an S256 code challenge.
2. After the user is picked, the IdP redirects to `GET /auth/callback?code&state`.
   The backend checks that the `state` matches the cookie, uses the stored state
   once, exchanges the code (sending the PKCE verifier), and verifies the
   `id_token`: RS256 signature against the IdP's JWKS, issuer, audience, expiry
   and nonce.
3. It stores the user (`sub`, name, email, workspaces and roles) in a Redis
   session, sets the `sb_session` cookie, and redirects to `WEB_ORIGIN`.
4. `GET /api/me` returns the signed-in user; `POST /auth/logout` deletes the
   session.

The `sb_session` cookie contains only a random id. It is `HttpOnly`,
`SameSite=Lax`, valid for 8 hours, and marked `Secure` when the redirect URI uses
`https`.

### Workspaces and tenant isolation

- Workspaces are created at startup from the `PIGEON_KEY_WS_*` variables.
- A user's workspaces and roles (`admin`, `agent`) come from the `workspaces`
  claim at login.
- Every `/api/conversations` route runs `requireSession` (`401` without a
  session) and `requireWorkspace` (`403` if the user is not a member of
  `?workspace=`). Every database query includes the workspace id.
- The WebSocket refuses the upgrade without a session (`401`) or for a workspace
  the user is not a member of (`403`).
- The frontend's workspace switcher lists only the user's own workspaces, and
  opening another workspace's URL shows a no-access page without requesting its
  data.

### Inbox and conversations

- One conversation per contact per workspace (unique index on
  `{ workspaceId, contact }`).
- The list is ordered by `lastMessageAt`, newest first, and paginated
  (`page`, `limit`, at most 100 per page).
- Messages are shown oldest first by `occurredAt`: Pigeon's `occurred_at` for
  inbound messages, the time of sending for replies.
- **Claiming** is one atomic `findOneAndUpdate` that only matches when the
  conversation is unassigned or already held by the same agent. A claim for a
  contact who has not written yet creates the conversation first.
- **Close and reopen** set the conversation status. An inbound message reopens a
  closed conversation.

### Sending a reply

1. The frontend creates a `client_ref` and calls
   `POST /api/conversations/:id/messages`.
2. The backend stores the reply as a `pending` message and answers `202`. The
   unique index on `{ workspaceId, clientRef }` makes a repeated `client_ref` the
   same reply.
3. The outbound worker on each server copy claims due messages with a 15-second
   lease and sends them to Pigeon with `Idempotency-Key` equal to the
   `client_ref`, so a retry is never a second send.
4. A Redis token bucket per workspace (6 tokens, 3.5 per second) keeps sends
   under Pigeon's limit for all copies together. A `429` blocks the workspace for
   its `Retry-After`. Timeouts (5 seconds), `5xx` and network errors retry with
   exponential backoff; other `4xx` mark the message `failed`.
5. Pigeon's status webhooks move the status forward: `queued`, `sent`, then
   `delivered` or `failed`. A late `sent` never overwrites a final status.

If the server dies after accepting a reply, the message is still `pending` in
MongoDB, and the restarted server or another copy sends it when the lease expires.

### Pigeon webhook

`POST /webhooks/pigeon` reads the raw body and answers as `PIGEON.md` requires:

| Request | Answer |
| --- | --- |
| Signature missing, malformed or wrong | `401` |
| Timestamp more than five minutes old | `401` |
| Body that is not valid JSON, or an invalid known event | `400` |
| Unknown event type | `200`, ignored |
| Unknown workspace | `200`, ignored |
| Status for a message never sent | `200`, ignored |
| Valid event, stored (or stored before) | `200` |
| Storage failure | `500`, so Pigeon retries |

The signature is HMAC-SHA256 of `"<t>.<raw body>"` with `PIGEON_WEBHOOK_SECRET`,
compared in constant time. Each event id is recorded; a duplicate is skipped only
if the earlier copy finished processing, so an event interrupted by a crash is
processed again on Pigeon's retry. Every step is idempotent.

### Real time

`GET /ws?workspace=<id>[&after=<seq>]` (WebSocket). Every change frame carries
`seq`, an integer that only increases within a workspace:

```json
{ "seq": 41, "type": "message.inbound", "contact": "+14155550101", "message_id": "pmsg_...", "text": "Hi", "occurred_at": "..." }
{ "seq": 42, "type": "message.outbound", "contact": "+14155550101", "client_ref": "...", "status": "queued", "text": "...", "sender": "u_ben" }
{ "seq": 43, "type": "message.status", "contact": "+14155550101", "client_ref": "...", "status": "delivered" }
{ "seq": 44, "type": "conversation.assigned", "contact": "+14155550101", "assignee": "u_ben" }
{ "seq": 45, "type": "conversation.status", "contact": "+14155550101", "status": "closed" }
```

After connecting (and after any replay), the server sends
`{ "type": "ready", "workspace", "latestSeq", "user" }` without `seq`.

A Lua script in Redis increments `seq`, appends the frame to a log of the last
5000 frames per workspace, and publishes it on one channel in a single atomic
step, so every server copy delivers frames in order. With `after`, the server
first sends every logged frame after that `seq`, then continues live. The
frontend keeps the last `seq`, reconnects with backoff, and asks for
`after=<last seq>`.

## API reference

Errors are JSON: `{ "message": "..." }`. Routes under `/api/conversations` need
the `sb_session` cookie and a `workspace` query parameter.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/healthz` | `200 { "status": "OK", ... }` once the server is listening |
| `GET` | `/auth/login` | Redirects to the IdP (authorization code + PKCE) |
| `GET` | `/auth/callback` | Completes login, sets the session cookie, redirects to `WEB_ORIGIN` |
| `POST` | `/auth/logout` | Deletes the session; `204` |
| `GET` | `/api/me` | `200 { sub, name, email, workspaces: [{ id, role }] }`, or `401` |
| `GET` | `/api/conversations?workspace=&page=&limit=` | `{ conversations, pagination: { page, limit, total, totalPages, hasNextPage } }` |
| `GET` | `/api/conversations/:id/messages?workspace=` | `{ conversation, messages }` |
| `POST` | `/api/conversations/:id/messages?workspace=` | Body `{ text, client_ref }`; `202 { message, duplicate }` |
| `POST` | `/api/conversations/:id/claim?workspace=` | `200 { conversation }` if you now hold it, `409 { conversation }` if someone else does |
| `POST` | `/api/conversations/:id/close?workspace=` | `{ conversation }` |
| `POST` | `/api/conversations/:id/reopen?workspace=` | `{ conversation }` |
| `POST` | `/webhooks/pigeon` | Pigeon webhooks (see above) |
| `GET` | `/ws?workspace=&after=` | WebSocket (see above) |

Common status codes: `400` invalid input, `401` no session, `403` not a member of
the workspace, `404` unknown workspace or conversation.

Examples, with a session cookie copied from the browser after signing in:

```bash
curl -b "sb_session=<cookie value>" \
  "http://localhost:4000/api/conversations?workspace=ws_acme&page=1&limit=20"

curl -b "sb_session=<cookie value>" -H "content-type: application/json" \
  -d '{"text":"Thanks, we are on it.","client_ref":"3f6c2a10-reply-1"}' \
  "http://localhost:4000/api/conversations/<conversation id>/messages?workspace=ws_acme"

curl -b "sb_session=<cookie value>" -X POST \
  "http://localhost:4000/api/conversations/<conversation id>/claim?workspace=ws_acme"
```

## Grader endpoints

Used by the automatic check (contract D in `BRIEF.md`). Every request needs the
header `x-grader-token` equal to `GRADER_TOKEN`; without it, or with a wrong
value, the answer is `401`. They use the same services as the UI routes.

| Method | Path | Body | Answer |
| --- | --- | --- | --- |
| `POST` | `/__grader/reset` | none | `200`. Deletes conversations, messages, webhook events and application keys in Redis. Workspaces, login sessions and `seq` counters stay |
| `GET` | `/__grader/snapshot` | none | The snapshot shape from `BRIEF.md`: inbound message ids per contact (oldest first), the assignee, and `client_ref` to status |
| `POST` | `/__grader/reply` | `{ workspace, contact, text, client_ref }` | `202` once stored; the same `client_ref` again is the same reply and also `202`. `400` invalid input, `404` unknown workspace |
| `POST` | `/__grader/claim` | `{ workspace, contact, agent }` | `200` if this agent now holds it, `409` if someone else does. Creates the conversation if needed. `400`, `404` as above |

```bash
curl -H "x-grader-token: grader-dev-token" http://localhost:4000/__grader/snapshot

curl -H "x-grader-token: grader-dev-token" -H "content-type: application/json" \
  -d '{"workspace":"ws_acme","contact":"+14155550101","agent":"u_ben"}' \
  http://localhost:4000/__grader/claim
```

`grader-dev-token` is the development value from `.env.example`.

## Testing and checks

### Backend tests

```bash
cd backend
npm test
```

33 tests with Node's built-in test runner, against the real MongoDB and Redis
from `npm run up`. They use their own databases (`switchboard_test`,
`switchboard_test_webhooks`) and drop them afterwards, so development data is not
touched. They cover claiming (including six simultaneous claims), webhook
signatures and answers, duplicate and out-of-order events, recovery of an
interrupted event, reply idempotency, status ordering, grader authentication,
reset, and workspace isolation.

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

### The automatic check

The check starts the server itself from `switchboard.json`, behind a small load
balancer on port 4000. **Stop your backend dev server first, and note that the
check deletes application data.**

```bash
npm run check                  # level 1, about 90 seconds
npm run check -- --levels 5    # one level
npm run check:full             # levels 1, 2, 3 and 5; writes CHECK_REPORT.json
```

`CHECK_REPORT.json` in this repository was produced on Windows with
`node harness/check.js --levels 1,5 --out CHECK_REPORT.json` and records
level 1: 24/24 and level 5: 15/15. Levels 2 and 3 were not run by the official
harness here; see [Known limitations](#known-limitations).

## npm scripts

### Root (`package.json`)

| Script | What it does |
| --- | --- |
| `npm run up` | Starts MongoDB, Redis and the simulators in Docker, then waits for them |
| `npm run up:search` | The same plus Elasticsearch (not used by this app) |
| `npm run down` | Stops all Docker services |
| `npm run mocks` | Starts the simulators with plain Node (no Docker) |
| `npm run doctor` | Checks every port and prints what to fix |
| `npm run check` | Runs level 1 of the automatic check |
| `npm run check:full` | Runs levels 1, 2, 3 and 5 and writes `CHECK_REPORT.json` |
| `npm run inbound` | Makes a simulated customer write now |
| `npm run quiet` / `npm run drizzle` | Stops / restarts the automatic customer messages |
| `npm run chaos` | Runs Pigeon's chaos traffic profile |
| `npm run report` | Shows what Pigeon saw of the app |
| `npm run scaffold:*`, `npm run start:server` | Belong to the unused `scaffold/` shell |

### Backend (`backend/package.json`)

| Script | What it does |
| --- | --- |
| `npm start` | `node server.js` |
| `npm run dev` | `nodemon server.js` (restarts on changes) |
| `npm test` | Runs the test suite |

### Frontend (`frontend/package.json`)

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 with the backend proxy |
| `npm run build` | Production build into `frontend/dist` |
| `npm run lint` | ESLint |
| `npm run preview` | Serves the production build locally (port 4173; login redirects to 5173, so use `dev` for a full session) |

## Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| `Bind for 0.0.0.0:27017 failed: port is already allocated` | Another MongoDB (or Redis on 6379) is running, often another project's container. Stop it (`docker ps`, then `docker stop <name>`) and run `npm run up` again. If the containers were created during the failed start, run `docker compose up -d --force-recreate mongo redis` |
| `npm run doctor` fails for MongoDB or Redis | The containers are not running or their ports are not published: `npm run up` |
| Backend exits with `Missing required environment variables` | There is no root `.env`: `cp .env.example .env` |
| Backend exits with `Startup aborted: could not connect to data stores` | MongoDB or Redis is not reachable at `MONGO_URL` / `REDIS_URL` |
| Login fails with `redirect_uri not registered` | `OIDC_REDIRECT_URI` must be one of the registered URIs: `http://localhost:{3000,4000,5173}/auth/callback` |
| After login you land on a blank or wrong page | The frontend must run on `WEB_ORIGIN` (`http://localhost:5173`). Port 5173 is fixed; stop whatever else uses it |
| Every API call returns `401` | No session (sign in again), or the backend restarted with a different Redis |
| The Live indicator stays on Reconnecting | The backend is down, the session expired, or the page's origin differs from `WEB_ORIGIN` (the WebSocket refuses other origins) |
| `npm run check` says port 4000 is in use | Stop your dev server; the check runs its own copy |
| No new customer messages after a check | The check turns the automatic messages off: `npm run drizzle` |
| On Windows, servers keep running after `npm run check` | The harness kills instances with Unix process groups, which do not exist on Windows. Stop the leftover `node` processes on ports 4001 and 4002 |

## Security considerations

- **Secrets stay out of Git.** `.env` and `.env.*` are ignored (except
  `.env.example`). The values in `.env.example` are the simulators' development
  values; use your own for any real deployment, especially `GRADER_TOKEN`,
  `PIGEON_WEBHOOK_SECRET` and `OIDC_CLIENT_SECRET`.
- **Webhooks** are authenticated with HMAC-SHA256 over the raw body, compared in
  constant time, and rejected when older than five minutes (replay protection).
- **Login** uses authorization code + PKCE (S256), a single-use `state` bound to
  the browser by a cookie (login CSRF), a `nonce`, and full `id_token`
  verification against the IdP's keys.
- **Sessions** are server-side in Redis; the cookie is a random id, `HttpOnly`
  and `SameSite=Lax`, with a new id on every login.
- **Authorization:** workspace membership is checked on every API request and on
  the WebSocket upgrade, and every database query is filtered by workspace.
  Membership is checked before existence, so a non-member learns nothing about a
  workspace.
- **WebSocket origin check:** a browser `Origin` other than `WEB_ORIGIN` is
  refused (cross-site WebSocket hijacking).
- **Grader endpoints** require `x-grader-token`, compared in constant time; with
  no `GRADER_TOKEN` configured they refuse every request.
- **Input validation:** request fields must be strings of the expected shape,
  which also blocks MongoDB operator injection such as `{ "$ne": null }`.
- `helmet` sets standard security headers.

## Known limitations

These are also recorded in [`DECISIONS.md`](DECISIONS.md).

- **Levels 2 and 3 of the official check were not run with the harness.** It
  cannot kill server instances on Windows, where this was developed. Their
  scenarios (a crash mid-flood, a crash after accepting replies, two copies
  sharing the rate limit, one copy dying for good) were reproduced with a
  separate script and passed; the official numbers need `npm run check:full` on
  Linux or in the dev container (`.devcontainer/`).
- **`/healthz`** answers `200` without checking MongoDB and Redis. The server
  only starts listening after both connect, so startup is reported correctly,
  but a later outage is not. A readiness check that does test both exists in
  `controllers/health.controller.js` but is not mounted.
- **No unclaim or reassign.** Once claimed, a conversation keeps its holder.
- **Search and the inbox views work on the conversations already loaded**
  (100 per page); search matches the number and the latest message only.
- **Unread markers are stored per browser**, because the API has no read state.
- **Replying to a closed conversation** is disabled in the UI until it is
  reopened (the API itself would accept the reply).
- **Real-time frames can be missed in one crash window:** a frame is published
  after its data is saved, so a crash between the two loses the frame (not the
  data). The real-time log keeps the last 5000 frames per workspace.
- **Production serving of the frontend** is not set up; in development Vite
  proxies to the backend. In production the built app must be served from the
  same origin as the API.
- **Not built:** end-to-end encrypted notes, Elasticsearch search and Paybox
  billing (optional parts of the brief).
