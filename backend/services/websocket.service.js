import { WebSocketServer } from "ws";
import env from "../config/env.js";
import Workspace from "../models/workspace.model.js";
import { getSessionFromCookieHeader } from "./session.service.js";
import {
  getEventsAfter,
  getLatestSeq,
  startEventSubscriber,
  stopEventSubscriber,
} from "./realtime.service.js";

// GET /ws?workspace=<id>[&after=<seq>]
//
// Authenticated by the session cookie; refused without a session (401) or for a
// workspace the user is not a member of (403). Every change frame carries `seq`.
// With `after`, frames after that seq are replayed from the Redis log first, then
// the socket continues live. Frames come from Redis pub/sub, so a socket on one
// copy receives what any copy processed.

const socketsByWorkspace = new Map(); // workspaceId -> Set<client>
let wss = null;

const reject = (socket, status, message) => {
  socket.write(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`
  );
  socket.destroy();
};

// A browser always sends Origin on a WebSocket; only our web app may connect with
// cookies (prevents cross-site WebSocket hijacking). Non-browser clients send none.
const originAllowed = (origin) => !origin || origin === env.webOrigin || origin === new URL(env.oidc.redirectUri ?? env.webOrigin).origin;

const send = (client, frame) => {
  if (frame.seq <= client.lastSeq) return; // already sent (replay and live overlapped)
  client.lastSeq = frame.seq;
  if (client.ws.readyState === client.ws.OPEN) client.ws.send(JSON.stringify(frame));
};

const deliver = (workspaceId, frame) => {
  for (const client of socketsByWorkspace.get(workspaceId) ?? []) {
    if (client.ready) send(client, frame);
    else client.buffer.push(frame); // replay still running: keep live frames for later
  }
};

const onConnection = async (ws, workspaceId, after, user) => {
  const client = { ws, lastSeq: after ?? 0, ready: after === null, buffer: [] };

  // Registered before reading the backlog, so nothing published in between is missed.
  if (!socketsByWorkspace.has(workspaceId)) socketsByWorkspace.set(workspaceId, new Set());
  socketsByWorkspace.get(workspaceId).add(client);

  ws.on("close", () => socketsByWorkspace.get(workspaceId)?.delete(client));
  ws.on("error", () => ws.terminate());

  try {
    if (after === null) {
      // No replay asked: start live from the current position.
      client.lastSeq = await getLatestSeq(workspaceId);
      client.buffer = client.buffer.filter((f) => f.seq > client.lastSeq);
      for (const frame of client.buffer) send(client, frame);
    } else {
      for (const frame of await getEventsAfter(workspaceId, after)) send(client, frame);
      for (const frame of client.buffer.sort((a, b) => a.seq - b.seq)) send(client, frame);
    }
  } catch (error) {
    console.error("WebSocket replay failed:", error.message);
    ws.close(1011, "replay failed");
    return;
  } finally {
    client.buffer = [];
    client.ready = true;
  }

  // Informational, no seq: tells the client where it is.
  ws.send(JSON.stringify({ type: "ready", workspace: workspaceId, latestSeq: client.lastSeq, user: user.sub }));
};

export const attachWebSocketServer = async (httpServer) => {
  wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  // Clients do not need to send anything; ignore whatever they do send.
  wss.on("connection", (ws) => ws.on("message", () => {}));

  httpServer.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname !== "/ws") return reject(socket, 404, "Not Found");
      if (!originAllowed(req.headers.origin)) return reject(socket, 403, "Forbidden");

      const user = await getSessionFromCookieHeader(req.headers.cookie);
      if (!user) return reject(socket, 401, "Unauthorized");

      const workspaceId = url.searchParams.get("workspace");
      if (!workspaceId || !user.workspaces?.some((w) => w.id === workspaceId)) {
        return reject(socket, 403, "Forbidden");
      }
      if (!(await Workspace.exists({ workspaceId }))) return reject(socket, 404, "Not Found");

      const afterParam = url.searchParams.get("after");
      let after = null;
      if (afterParam !== null) {
        after = Number(afterParam);
        if (!Number.isInteger(after) || after < 0) return reject(socket, 400, "Bad Request");
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
        onConnection(ws, workspaceId, after, user);
      });
    } catch (error) {
      console.error("WebSocket upgrade error:", error.message);
      reject(socket, 500, "Internal Server Error");
    }
  });

  await startEventSubscriber(deliver);

  // Keep connections alive through proxies, and drop dead ones.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
  });
  wss.on("close", () => clearInterval(heartbeat));
};

export const closeWebSocketServer = async () => {
  if (!wss) return;
  for (const ws of wss.clients) ws.close(1001, "server shutting down");
  wss.close();
  wss = null;
  await stopEventSubscriber();
};
