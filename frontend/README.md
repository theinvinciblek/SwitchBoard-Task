# Switchboard frontend

React 19 + Vite single-page app for the Switchboard inbox. See the
[root README](../README.md) for the full setup, architecture and API.

```bash
npm install
npm run dev      # http://localhost:5173 (the port is fixed)
npm run lint
npm run build    # production build into dist/
```

The backend must be running on `http://localhost:4000` (override with
`BACKEND_URL`). The dev server proxies `/api`, `/auth` and `/ws` to it, so the
session cookie and the WebSocket work on one origin.
