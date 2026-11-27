# Decisions

This file records decisions made where `BRIEF.md` is silent, and known
limitations. It is updated feature by feature.

## Conversation claiming (`POST /__grader/claim`)

### What was built

- `POST /__grader/claim` with body `{ workspace, contact, agent }`, behind the
  `x-grader-token` check.
- The claim logic lives in `backend/services/conversation.service.js`
  (`claimConversation`) so a future UI route can call the same code path, as
  contract D requires.
- Tests in `backend/tests/claim.test.js` (`npm test` in `backend/`).

### How the claim is atomic

1. Upsert the conversation on `{ workspaceId, contact }`. A unique index on that
   pair guarantees that simultaneous claims for a contact who has not written
   yet create exactly one conversation. A duplicate-key error from a concurrent
   insert is expected and ignored.
2. One `findOneAndUpdate` whose filter matches only when `assignee` is `null`
   or already equals the claiming agent, and which sets `assignee`. MongoDB
   applies single-document updates atomically, so exactly one of several
   simultaneous claims can match the unassigned state. No match means another
   agent holds the conversation.

There is no read-then-write step and no application-level lock, so the
guarantee also holds with several server copies sharing one MongoDB. As a
check on the tests themselves, a deliberately non-atomic read-then-write
version was run against them: all three simultaneous-claim tests failed (five
or six winners per conversation), while the atomic version passes.

### Assumptions

- **Which workspaces exist.** Workspaces are defined by the `PIGEON_KEY_WS_*`
  variables in `.env` (for example `PIGEON_KEY_WS_ACME` defines `ws_acme`). On
  startup the server upserts one Workspace document per variable before it
  accepts traffic. The check resets all data and then claims immediately, so
  workspaces cannot depend on data created at runtime.
- **Unknown workspace** returns `404`. The brief only requires a `4xx`.
- **Invalid input** (missing, empty or non-string `workspace`, `contact` or
  `agent`, or malformed JSON) returns `400`. Requiring strings also blocks
  query-operator injection such as `{ "agent": { "$ne": null } }`.
- **`agent` and `contact` are opaque strings.** They are trimmed but not
  validated further. `agent` is not looked up in the IdP, as the brief states.
- **Response bodies.** `200` returns `{ conversationId, workspace, contact,
  assignee }`. `409` returns the same fields plus `error`, including the current
  holder; agents in the same workspace can see assignees in the inbox anyway.
- **Closed conversations can be claimed.** Claiming does not change `status`.
- **A conversation created by a claim** gets `lastMessageAt` set to the time of
  the claim, so it appears at the top of the inbox.
- **Grader token comparison** uses `crypto.timingSafeEqual` on SHA-256 hashes.
  If `GRADER_TOKEN` is not set, every grader request is refused with `401`.
- **Indexes are built before the server listens** (`ensureIndexes` in
  `backend/config/database.js`), because the unique index is part of the
  correctness of step 1.

- **The UI claim route** (`POST /api/conversations/:id/claim`) calls the same
  `claimConversation`, with the signed-in user's `sub` as the agent.
- **`conversation.assigned`** is published only when the holder changes, not
  when the holder claims again.

### Known limitations

- There is no unclaim or reassign. A claim that raced with a future release
  could return `409` with `assignee: null`; release does not exist, so this
  cannot happen today.

## Inbound webhooks (fixes to the existing handler)

- **An event is skipped as a duplicate only if it finished processing.** The
  original handler recorded the event first and answered `200` to every later
  copy, so a crash, or a failure between recording and saving the message,
  lost the message for good. Every step is idempotent (upserts keyed on
  `{ workspaceId, contact }` and `{ workspaceId, pigeonMessageId }`), so
  processing a retry twice is safe.
- **Display order is `occurred_at`**, stored as `Message.occurredAt`, not arrival
  time. Pigeon does not keep order, and the check scores order by `occurred_at`.
- **`lastMessageAt` only moves forward** (`$max`), and only the newest message
  sets the preview text.
- **Statuses only move forward**: queued, sent, then delivered or failed. A late
  `sent` cannot overwrite a final status. The update is one atomic
  `findOneAndUpdate` with a filter on the lower statuses.
- **Answers follow `PIGEON.md`**: an unknown event type is acknowledged before
  any other validation, and an invalid `occurred_at` is `400`, never `5xx`.

## Outbound replies

- **Outbox in MongoDB.** A reply is stored as a `pending` Message before the
  API answers `202`. Every server copy runs a worker
  (`backend/workers/outbound.worker.js`) that takes due messages with an atomic
  `findOneAndUpdate` setting a 15 second lease (`lockedUntil`). If a copy dies,
  its lease expires and another copy, or the restarted one, sends the message.
- **Exactly once at the carrier.** Every attempt sends `Idempotency-Key` equal to
  the `client_ref`, so a retry after a timeout or a crash is answered by
  Pigeon's replay instead of a second send. The send timeout is 5 seconds,
  because Pigeon sometimes accepts and then answers after 12 seconds.
- **A repeated `client_ref` is one reply.** The unique index on
  `{ workspaceId, clientRef }` decides; both requests get `202`.
- **The rate limit is shared by all copies through Redis.** A token bucket per
  workspace (6 tokens, 3.5 per second), slightly under Pigeon's 8 and 4 per
  second, so the server stays below the limit instead of discovering it. A `429`
  still sets a per-workspace cool-off in Redis for the `Retry-After` time,
  which every copy respects.
- **Retries:** `5xx`, timeouts and network errors back off exponentially
  (0.5 to 8 seconds, with jitter). Other `4xx` mark the message `failed`.
- **The reply's `status` comes from Pigeon's status webhooks.** The send
  response only marks the outbox entry done, because the webhooks can arrive
  before the response does.

## Login and sessions

- **OIDC authorization code flow with PKCE (S256)**, implemented with
  `node:crypto` and no library: discovery, token exchange, and RS256 `id_token`
  verification against the JWKS, checking `iss`, `aud`, `exp` and `nonce`.
- **Login state** (PKCE verifier, nonce) is stored in Redis under the random
  `state` and used once (`GETDEL`). The `state` is also bound to the browser
  through a short-lived `sb_login` cookie, which blocks login CSRF.
- **Sessions are stored in Redis**, so every copy accepts them. The cookie
  `sb_session` holds only a random id: `HttpOnly`, `SameSite=Lax`, and `Secure`
  when the redirect URI is `https`. A new id is issued on every login.
- **Workspaces and roles come from the `workspaces` claim** at login and are
  stored in the session. A role change at the IdP applies at the next login.
- **Membership is checked before existence**, so a non-member gets `403` and
  learns nothing about whether the workspace exists.
- **After login the browser is redirected to `WEB_ORIGIN`** (the frontend).

## Real time

- **One Lua script per event** increments the workspace's `seq`, appends the
  frame to a Redis log (the last 5000 frames per workspace) and publishes it.
  Redis runs scripts atomically, so frames are published in `seq` order, and
  every copy receives them through one pub/sub channel.
- **Replay with `after`:** the socket is registered before the log is read, live
  frames that arrive during the replay are buffered, and any frame at or below
  the last `seq` sent is dropped. So nothing is missed and nothing is sent twice.
- **`seq` survives `/__grader/reset`** (its key is outside the deleted prefix),
  so it only ever goes up within a workspace.
- **Frame types:** `message.inbound`, `message.outbound`, `message.status`,
  `conversation.assigned` and `conversation.status`, plus a `ready` frame without
  `seq` after connecting.
- **The WebSocket refuses a browser `Origin` other than `WEB_ORIGIN`**
  (cross-site WebSocket hijacking). Clients that send no `Origin` are allowed.

## Grader endpoints

- **`/__grader/reset`** deletes conversations, messages, webhook events and the
  Redis keys under `sb:`. Workspaces are re-created; sessions and `seq` stay.
  It uses `deleteMany` rather than drop, so the unique indexes survive.
- **`/__grader/snapshot`** lists inbound ids per contact in `occurred_at` order,
  and outbound `client_ref` to status, per workspace.

## Frontend

- **One origin in development.** Vite proxies `/api`, `/auth` and `/ws` to the
  backend, so the `HttpOnly` session cookie is sent with every request and no
  CORS is needed. The WebSocket's browser `Origin` is `WEB_ORIGIN`, which the
  server accepts.
- **Only real endpoints.** The UI uses exactly the routes in `backend/routes`.
  There is no release endpoint, so there is no Release action, and a
  conversation held by someone else shows its holder instead of an Assign
  button.
- **Search and the inbox views filter what is loaded** (up to 100 conversations
  per page, with "Load older conversations"). The API has no search or filter
  parameters, so search matches the number and the latest message only.
- **Unread is per browser.** The API has no read state; the last time each
  conversation was viewed is kept in `localStorage`, per user and workspace.
- **Replies are idempotent end to end.** The browser creates the `client_ref`
  before the first attempt, retries network and `5xx` failures automatically
  with the same ref, and offers a manual Retry with the same ref, so a reply is
  never stored twice.
- **Real time:** the client keeps the last `seq` and reconnects with
  `after=<seq>` (exponential backoff, and immediately when the browser comes
  back online). The first connection refetches once, to cover the gap between
  the first page load and the socket opening. Frames are merged by key, so
  replays and API responses never duplicate a message, and statuses only move
  forward.
- **Replying is disabled while a conversation is closed**, with a Reopen action
  next to it. The backend would accept the reply; this is a product choice.

## Known limitations

- **Events can be lost in one crash window.** An event is published after its
  data is saved. A crash between the two loses the real-time frame (not the
  data); the client sees the data on its next fetch.
- **Old replays age out.** The real-time log keeps 5000 frames per workspace;
  reconnecting with an older `after` misses what has been trimmed.
- **Health check:** `/healthz` (in `app.js`) answers `200` without checking
  MongoDB and Redis. The server only listens after both connect, so the check
  is not misled at startup, but a later outage is not reported.
- **Not built:** encrypted notes, search and billing.
- **Levels 2 and 3 on Windows.** The harness cannot kill its instances on
  Windows (it uses Unix process groups). They were reproduced with a script
  that kills the server with `SIGKILL`: 176 of 176 inbound messages kept through
  a kill mid-flood with no duplicates or reordering; 12 of 12 accepted replies
  delivered once after a kill and restart; 24 of 24 replies across two copies
  with no request inside a `Retry-After` window; 12 of 12 delivered by the
  surviving copy after the other died for good. The official numbers still need
  `npm run check:full` in the dev container or on Linux.
- **`CHECK_REPORT.json` covers levels 1 and 5 only.** Because of the point
  above, `npm run check:full` was not run. The committed report was written by
  the official harness with `node harness/check.js --levels 1,5 --out
  CHECK_REPORT.json` (profile `quick`): level 1 24/24, level 5 15/15. It
  records its own profile and levels.
