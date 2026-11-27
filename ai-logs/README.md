# AI session logs

Transcripts of the AI sessions used to build Switchboard, as exported by the tool.
They are not edited; only the file name was changed when the export was moved
into this folder.

## Sessions

| File | Tool | What the session covers |
| --- | --- | --- |
| `claude-code-session-backend-and-frontend.txt` | Claude Code (`/export`) | One continuous session: backend setup (Express, MongoDB, Redis), Docker services, conversation APIs, atomic claiming, the remaining backend (outbound outbox, retries, idempotency, grader endpoints, OIDC login, WebSockets), fixes to the Pigeon webhook handler, and the complete React frontend. |

## Not included

- **Submission preparation.** The export above was made before the final
  submission step (README, check report, security review, commit and push).
  That part of the same session is not in this file unless the session is
  exported again after it finished.
- **The Pigeon webhook handler and status updates.** These were first written
  by the developer outside the session above (the session later fixed bugs in
  them). If an AI tool was used for that work, its transcript is not available
  in this folder.
- No other AI sessions were exported. Nothing in this folder was reconstructed
  or written after the fact.
