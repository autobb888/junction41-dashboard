# @j41/connect — Buyer-Side CLI Design

## Overview

A buyer-side CLI tool that creates a Dockerized MCP server over a local project directory. Hired agents work on the buyer's files through the Junction41 platform relay. SovGuard pre-scans the directory before the agent connects.

**Privacy model:** File contents pass through the relay in transit (buyer CLI → relay → agent) but are **never stored** in the relay database — only operation metadata (paths, hashes, SovGuard scores) is logged. The relay processes payloads in memory and forwards them. This is transport-level privacy, not end-to-end encryption. SovGuard content scanning runs locally on the buyer's CLI, not at the relay.

**v1 scope:** Read + write files only. Supervised and standard modes. Docker required. Pre-scan only (no real-time write scanning). Text files only.

> **Note:** This spec supersedes the naming in `2026-03-18-j41-workspace-design.md`. The package was renamed from `@j41/workspace` to `@j41/connect`. The CLI command changed from `j41-workspace` to `j41-connect`. The v1 spec also makes these intentional scope reductions from the workspace design:
> - `--no-docker` removed — Docker is required (OS-level sandbox too dangerous for v1)
> - Real-time SovGuard write scanning deferred — pre-scan only for v1 (full write scanning in v2)
> - `sovguardScore` in mcp:result metadata will be `0` for v1 (no real-time scanning)

## Package & CLI

- **Package:** `@j41/connect` (`yarn global add @j41/connect`)
- **Repo:** `/home/bigbox/code/j41-connect`
- **CLI command:** `j41-connect <dir> --uid <token> [flags]`
- **Requires:** Node.js 18+, Docker

## CLI Flags (v1)

| Flag | Description | Default |
|------|-------------|---------|
| `--uid <token>` | 128-bit workspace UID from dashboard | Required |
| `--read` | Agent can read files | Always on |
| `--write` | Agent can write files | Off |
| `--supervised` | Approve each write (diff preview + Y/N) | Default mode |
| `--standard` | Agent reads/writes freely, buyer watches feed | Off |
| `--verbose` | Show file sizes + SovGuard scores in feed | Off |
| `--resume <token>` | Reconnect with fresh reconnect token | — |

**Rejected flags (v1):** `--no-docker` (Docker required), `--commands`, `--install`, `--allow` (all v2).

## Architecture

```
j41-connect/
├── src/
│   ├── cli.ts              # Arg parsing, validation, orchestration
│   ├── docker.ts           # Container lifecycle (dockerode)
│   ├── relay-client.ts     # Socket.IO client to /workspace namespace
│   ├── mcp-server.ts       # MCP tools: list_directory, read_file, write_file
│   ├── pre-scan.ts         # @sovguard/engine pre-scan, exclusion list, buyer confirmation
│   ├── supervisor.ts       # Supervised mode: diff preview, Y/N approval for writes
│   ├── feed.ts             # Terminal live feed (minimal + verbose modes)
│   └── index.ts            # Entry point
├── package.json
├── tsconfig.json
└── Dockerfile              # MCP server container image
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `socket.io-client` | Connect to platform relay `/workspace` namespace |
| `dockerode` | Docker container management |
| `@sovguard/engine` | Pre-scan directory for threats + credentials |
| `commander` | CLI argument parsing |
| `chalk` | Terminal colors |
| `diff` | Generate diffs for supervised mode preview |

## Authentication

**UID-only.** The buyer is already authenticated on the dashboard where they generated the workspace UID. The CLI does not require a separate login. The 128-bit crypto-random UID serves as the bearer token for the Socket.IO connection.

- UID is single-use (only valid for `pending` sessions)
- Reconnection uses a fresh reconnect token (different from UID)
- Rate limited at the relay: 5 failed UID attempts per IP = 15 minute lockout

## Pre-Scan

Uses `@sovguard/engine` to scan the project directory before the agent connects:

1. Walk all text files in project directory
2. Auto-exclude: `.env`, `.env.*`, `.ssh/`, `*.pem`, `*.key`, `*.p12`, `credentials.json`, `secrets.*`, `node_modules/`, `.git/`
3. Run `scanFileContent()` on remaining files — flag anything with high SovGuard score
4. Present exclusion list to buyer:

```
Excluded (5 files):
  .env                    — environment variables
  .env.local              — environment variables
  src/config/keys.json    — detected credentials
  node_modules/           — too large

Proceed? [Y]es / [E]dit exclusions / [A]bort
```

5. Buyer confirms, edits exclusions, or aborts
6. Exclusion list + directory hash sent to relay (stored in `workspace_sessions.excluded_files`)

**Trust boundary:** The exclusion list and directory hash are self-reported by the buyer's CLI. The relay trusts this data because the buyer is the party being protected — they have no incentive to fake their own exclusions. A modified CLI could send a fake list, but that only harms the buyer.

## Docker Container

- **Image:** Lightweight Node.js Alpine
- **Mount:** Project directory read-write at `/workspace`
- **MCP server:** Runs inside container on stdio
- **Startup check:** CLI detects if Docker is installed/running — if not, prints install guide per OS and exits
- **Cleanup:** Container stopped + removed on any exit (accept, abort, Ctrl+C, disconnect)
- **Git warning:** If project dir is not a git repo or has uncommitted changes, warns buyer:
  ```
  Warning: Uncommitted changes detected. Recommend committing before starting.
  Continue? [Y/N]
  ```

No overlay filesystem. Writes go directly to the buyer's disk. Version control is the safety net.

## MCP Tools (v1 — 3 tools)

| Tool | Behavior |
|------|----------|
| `list_directory(path)` | List files/dirs within sandbox, max 10,000 entries |
| `read_file(path)` | Read text file, max 10MB, excluded files rejected |
| `write_file(path, content)` | Write file, max 10MB. Supervised: diff preview + Y/N. Standard: immediate write. |

All tools enforce:
- Path must resolve within project directory (no `..` traversal)
- Excluded files rejected
- Text files only (binary rejected with error message)
- Size limit: 10MB per file
- Max 500MB total transfer per session

## Relay Connection

- **Protocol:** Socket.IO client to platform's `/workspace` namespace
- **Auth:** `{ type: 'buyer', uid: workspaceUid }`
- **Events received:** `mcp:call` (from agent via relay), `workspace:status_changed`, `workspace:agent_done`, `workspace:agent_disconnected`
- **Events sent:** `mcp:result` (with metadata: path, sizeBytes, contentHash, operation, approved, blocked, blockReason), `workspace:pre_scan_done`, `workspace:pause`, `workspace:resume`, `workspace:abort`, `workspace:accept`
- **Reconnection:** On unexpected disconnect, CLI prints instructions. Buyer retrieves reconnect token from dashboard (GET `/v1/workspace/:jobId` includes `reconnectToken` when session is `disconnected`). Buyer runs `j41-connect --resume <token>` within 5 minutes.

### Metadata in mcp:result

Every result includes metadata that the relay logs (content is forwarded but never stored by relay):

```json
{
  "id": "req-1",
  "success": true,
  "result": { "content": "..." },
  "metadata": {
    "operation": "read",
    "path": "src/App.jsx",
    "sizeBytes": 1234,
    "contentHash": "sha256:abc...",
    "sovguardScore": 0,
    "approved": true,
    "blocked": false
  }
}
```

## Supervised Mode

For write operations, the CLI shows a diff preview and waits for buyer approval:

```
WRITE src/components/Header.jsx (1.4KB)
  +  <nav className="responsive-nav">
  -  <nav className="nav">
[Y]es / [N]o?
```

- First ~20 lines of diff shown (truncated with "... N more lines" if longer)
- Y approves → file written → result sent to relay with `approved: true`
- N rejects → result sent with `approved: false`, error returned to agent
- Reads and list_directory log to feed without blocking

## Terminal Live Feed

**Default (minimal):**
```
14:23:01  READ   src/App.jsx                    ✓
14:23:03  WRITE  src/components/Header.jsx      ✓ approved
14:23:05  READ   package.json                   ✓
14:23:08  BLOCKED .env                          ✗ excluded
```

**Verbose (`--verbose`):**
```
14:23:01  READ   src/App.jsx              2.1KB  ✓
14:23:03  WRITE  src/components/Header.jsx 1.4KB  ✓ approved
14:23:05  READ   package.json             0.8KB  ✓
14:23:08  BLOCKED .env                           ✗ excluded file
```

Blocked operations always show the reason regardless of verbosity.

## Interactive Commands

During a session, buyer can type in the terminal:
- `pause` — pause workspace, agent's calls queued at relay
- `resume` — resume workspace
- `abort` — immediate disconnect, container destroyed, no attestation
- `accept` — confirm agent's work, clean close, attestation generated by platform
- `Ctrl+C` — same as abort

## Lifecycle

```
j41-connect ./my-project --uid abc123 --read --write --supervised
  │
  ├─ Validate flags + Docker running
  ├─ Git check (warn if not repo / uncommitted changes)
  ├─ Pre-scan directory (SovGuard) → buyer confirms exclusions
  ├─ Start Docker container (mount project dir read-write)
  ├─ Connect to relay (Socket.IO /workspace, auth: { type: 'buyer', uid })
  ├─ Send workspace:pre_scan_done → relay marks session active
  │
  ├─ Agent connects (notified via relay)
  │   └─ Feed: "Agent connected — workspace active"
  │
  ├─ Work phase:
  │   ├─ Relay forwards mcp:call from agent
  │   ├─ CLI executes tool in Docker container
  │   ├─ Supervised writes: show diff, wait Y/N
  │   ├─ Standard writes: execute immediately, log to feed
  │   ├─ Send mcp:result + metadata back to relay
  │   └─ Feed logs each operation
  │
  ├─ Agent signals done (workspace:agent_done)
  │   └─ Feed: "Agent done. Type 'accept' to confirm or 'abort' to cancel."
  │
  ├─ Buyer types 'accept' → send workspace:accept
  │   └─ Platform signs attestation, session closes
  │
  ├─ Cleanup:
  │   ├─ Stop + remove Docker container
  │   ├─ Disconnect Socket.IO
  │   └─ Print session summary:
  │       Session complete.
  │       Files read: 47 | Written: 12 | Blocked: 0
  │       Duration: 34 minutes
  │       Attestation: signed by platform ✓
  │
  └─ Exit (process.exit(0))
```

## Disconnect Handling

**Buyer loses connection (laptop close, network drop):**
- Socket.IO disconnects
- Relay sets 5-minute grace period + generates reconnect token
- Reconnect token is stored in `workspace_sessions.reconnect_token`
- Buyer retrieves it by logging into the dashboard (GET `/v1/workspace/:jobId` returns `reconnectToken` for buyer when session is `disconnected`)
- Buyer runs: `j41-connect --resume <reconnect-token>`
- If no reconnect in 5 min: session marked disconnected by worker, agent notified

**Buyer types abort / Ctrl+C / SIGTERM / SIGHUP:**
- Immediate disconnect, no grace period
- Docker container stopped + removed
- Relay marks session aborted
- No attestation generated

**Agent disconnects:**
- CLI shows: "Agent disconnected. Workspace remains open."
- Buyer can wait for agent to reconnect or abort

## Signal & Process Handling

The CLI registers handlers for clean shutdown on any termination signal:

- `SIGINT` (Ctrl+C) — abort workspace, cleanup Docker, exit
- `SIGTERM` — same as SIGINT
- `SIGHUP` (terminal closed) — same as SIGINT
- `process.on('exit')` — final safety net: attempt Docker container kill if still running
- `process.on('uncaughtException')` — log error, attempt cleanup, exit 1

All handlers call the same cleanup function: stop container → remove container → disconnect Socket.IO → exit.

## Stdin Management

The CLI uses stdin for two purposes that must not conflict:

1. **Interactive commands** (`pause`, `resume`, `abort`, `accept`) — always active
2. **Supervised write approval** (`Y/N` prompts) — only during pending write operations

**State machine:**
- **IDLE state:** stdin reads lines and matches against commands
- **APPROVAL_PENDING state:** stdin reads single char (Y/N). Any other input ignored until approval resolves.
- When a supervised write arrives, state transitions to APPROVAL_PENDING
- After Y or N, state returns to IDLE
- `abort` and Ctrl+C work in ANY state (override approval prompt)

## Error Handling

**Relay errors:** The CLI must handle `ws:error` events from the relay (auth failures, session errors). On `ws:error`, log the error message and exit with code 1.

**Rate limiting:** The relay rate-limits the agent (not the buyer). The buyer CLI may observe gaps between `mcp:call` events if the agent is throttled. This is normal — the CLI should not treat gaps as errors.

**Docker errors:** If the Docker container crashes or stops unexpectedly during a session, the CLI should detect this (via dockerode container.wait() or polling), notify the relay with `workspace:abort`, and exit with an error message.

**Network errors:** Socket.IO handles reconnection automatically. If the connection is lost and cannot be re-established within Socket.IO's retry window, the CLI prints the reconnect command and exits.

## Relay Status Events

The CLI must handle `workspace:status_changed` events from the relay:

| Status | CLI Behavior |
|--------|-------------|
| `active` | Normal operation, log "Workspace active" |
| `paused` | Show "Workspace paused" in feed, queue incoming mcp:call events |
| `disconnected` | Should not happen (buyer IS the CLI), log warning |
| `aborted` | Log "Session aborted", cleanup and exit |
| `completed` | Log "Session completed", cleanup and exit |

## Docker Install Guide (shown when Docker not found)

```
Docker is required to run j41-connect.

Install Docker:
  macOS:   brew install --cask docker
  Ubuntu:  sudo apt install docker.io
  Windows: https://docs.docker.com/desktop/install/windows/
  Other:   https://docs.docker.com/get-docker/
```

## v1 Scope Boundaries

| In v1 | Deferred to v2 |
|-------|----------------|
| Docker sandbox (required) | `--no-docker` OS-level sandbox |
| Read + write files | Command execution (`--commands`) |
| Supervised + standard modes | Autonomous mode |
| Text files only | Binary file support |
| Pre-scan only (SovGuard) | Real-time write scanning |
| CLI live feed | Dashboard live operation stream |
| `yarn global add` install | Standalone binary (no Node) |
| Single directory | Multi-directory workspace |

## Not In Scope

- Auto-installing Docker (detect + guide only)
- Agent-initiated workspace (buyer-initiated only)
- Peer-to-peer direct connection (relay model only)
- On-chain workspace attestation (platform-signed is sufficient for v1)
- Local SovGuard for dispatcher chat (chat MUST go through platform SovGuard)
