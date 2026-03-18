# J41 Workspace Design

## Summary

A buyer-side CLI tool (`@j41/workspace`) that creates a sandboxed MCP server over a local directory. Hired agents work on the buyer's files through the Junction41 platform relay. SovGuard scans file operations locally on the buyer's CLI — file contents never leave the buyer's machine. Trust tier and buyer-configured permissions control what the agent can do. After clean completion, the platform signs a workspace attestation for the agent's reputation record.

**v1 scope:** Read + write files only. Supervised and standard modes. Command execution and package install deferred to v2 after sandbox is battle-tested.

## Buyer Experience

```bash
# One time (never again)
yarn global add @j41/workspace

# Every job (copy from dashboard)
j41-workspace ./my-project --uid <128-bit-token> --read --write --supervised
```

Two commands. First one installs the package globally (requires Node.js). Second one starts a workspace for a specific job.

The dashboard generates the second command with all flags baked in based on the buyer's checkbox selections. The install command is shown above it for first-time users. Copy button grabs both.

## Components

### 1. `@j41/workspace` (npm package)

**Install:** `yarn global add @j41/workspace`

No `curl | bash` installer — buyers hiring coding agents have Node.js. Standalone binary (no Node required) is on the roadmap for broader audience.

**CLI tool:** `j41-workspace <dir> --uid <token> [flags]`

On run:
1. Authenticates with platform (buyer's session)
2. Verifies workspace UID matches job + agent (128-bit cryptographically random token)
3. Runs SovGuard pre-scan on directory — flags/excludes sensitive files (.env, keys, credentials, .ssh/)
4. Buyer confirms exclusions and proceeds
5. Starts sandboxed MCP server over the directory (Docker by default, `--no-docker` to opt out)
6. Opens outbound WebSocket to platform relay (no inbound ports needed)
7. Enforces permissions locally — the agent cannot bypass them
8. Runs SovGuard locally on all file writes — content never leaves the machine
9. Streams live feed of all operations to terminal
10. Accepts interactive commands: `pause`, `resume`, `abort`, `accept`

**v1 Flags:**
- `--read` — agent can read files (always on)
- `--write` — agent can write files
- `--supervised` — agent proposes, buyer approves each action (default)
- `--standard` — agent reads/writes freely, buyer watches live feed
- `--no-docker` — skip Docker, use OS-level sandboxing only (with warning)
- `--resume <token>` — reconnect to a disconnected workspace (uses fresh reconnection token, not original UID)

**v2 Flags (deferred):**
- `--commands` — agent can run whitelisted commands (requires `--supervised` unless `--docker`)
- `--install` — agent can install packages (requires trust tier Medium+ and Docker)
- `--allow "cmd"` — add custom command to whitelist (repeatable)

**MCP tools exposed (v1 — 3 tools):**
- `list_directory(path)` — list files/dirs at path (within sandbox, max 10,000 entries)
- `read_file(path)` — read file contents (text files only, max 10MB)
- `write_file(path, content)` — write/create file (if write permission, max 10MB, SovGuard scanned locally)

**v2 MCP tools (deferred):**
- `run_command(command)` — execute command (whitelisted only)
- `get_diff()` — summary diff of all changes in session (max 5MB output)

### 2. Platform Relay (backend)

New WebSocket relay endpoint in the Junction41 backend. Sits between buyer's CLI and agent's dispatcher.

**Responsibilities:**
- Authenticate both sides via job-scoped workspace token
- Route MCP tool calls: agent → relay → buyer's CLI
- Route results: buyer's CLI → relay → agent
- Relay does NOT see file contents — receives only operation metadata (path, content hash, SovGuard scan result) from the buyer's CLI
- Log every operation to audit trail (workspace_operations table)
- Stream operation status to dashboard via Socket.IO (status updates, not file contents)
- Handle disconnection/reconnection (5-minute grace period)
- Enforce workspace state (only active when job is `in_progress`)
- Rate limit MCP tool calls: max 10/second, 300/minute per session

**New endpoint:** `WS /ws/workspace/:jobId`

Rate limited: max 5 failed UID attempts per jobId, then locked for 15 minutes.

**New table:** `workspace_sessions`

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | gen_random_uuid() |
| job_id | text FK → jobs | |
| buyer_verus_id | text | |
| agent_verus_id | text | |
| workspace_uid | text, unique | 128-bit cryptographically random token |
| reconnect_token | text, nullable | fresh token generated on disconnect, expires in 5 min |
| permissions | jsonb | {read, write} for v1 |
| mode | text | supervised / standard |
| status | text | pending / active / paused / disconnected / completed / aborted |
| directory_hash | text | hash of pre-scan file listing (integrity check) |
| excluded_files | jsonb | files excluded by pre-scan |
| exclusion_overrides | jsonb | files buyer explicitly re-included (audit trail) |
| connected_at | timestamptz | |
| disconnected_at | timestamptz | |
| completed_at | timestamptz | |
| created_at | timestamptz | |

**New table:** `workspace_operations`

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| session_id | text FK → workspace_sessions | |
| operation | text | read / write / list_dir |
| path | text | file path |
| content_hash | text | SHA-256 of content written (for writes) |
| size_bytes | integer | size of content |
| sovguard_score | numeric | local SovGuard scan result (0 = safe) |
| approved | boolean | null for standard mode, true/false for supervised |
| blocked | boolean | SovGuard or permission blocked |
| block_reason | text | why it was blocked |
| created_at | timestamptz | |

Retention: operations older than 90 days archived, except for disputed jobs.

### 3. Dashboard Workspace Panel (frontend)

Added to JobDetailPage when job status is `in_progress` (payment verified).

**Workspace token generation:** Buyer clicks "Generate Workspace Token" on the dashboard. The platform creates the `workspace_sessions` row and generates a 128-bit cryptographically random UID. The CLI command is shown with the UID embedded. The agent never generates or sees the UID — they connect through their dispatcher and the platform routes based on job ID and agent identity.

**Permission panel UI:**

```
┌─────────────────────────────────────────────────┐
│ Workspace                                        │
│                                                  │
│ Agent: researcher@ (Trust: High, 847 reviews)    │
│                                                  │
│ Mode:                                            │
│   (•) Supervised — approve each action           │
│   ( ) Standard — watch live feed                 │
│                                                  │
│ Permissions:                                     │
│   [x] Read files                                 │
│   [x] Write files                                │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ # Install (once):                            │ │
│ │ yarn global add @j41/workspace               │ │
│ │                                              │ │
│ │ # Start workspace:                           │ │
│ │ j41-workspace ./my-project \                 │ │
│ │   --uid a7f3b1c9e2d4... \                    │ │
│ │   --read --write --supervised                │ │
│ └──────────────────────────────────────────────┘ │
│                                     [Copy] 📋    │
└─────────────────────────────────────────────────┘
```

Checkboxes update the command live. Same pattern as the payment signing flow.

**Workspace status panel** (when workspace is active):

Shows workspace status (active/paused/disconnected), operation counts (files read, files written), SovGuard flags count, and session duration. In supervised mode, shows approve/reject buttons for pending operations.

### 4. Dispatcher Integration

The dispatcher adds workspace as an MCP connection. When the platform notifies "workspace is live":
- Dispatcher connects its MCP client to the relay WebSocket
- Agent's LLM sees new tools: `list_directory`, `read_file`, `write_file`
- Agent works naturally — same as any MCP tools
- When workspace closes, tools disappear from the agent's toolkit

Also usable by any MCP-compatible client (Claude Code, Cursor) pointing at the relay endpoint.

## Security Model

### Data Flow — What Goes Where

```
Buyer's Machine                    Platform Relay              Agent
┌──────────────────┐              ┌──────────────┐           ┌──────┐
│ j41-workspace    │              │              │           │      │
│                  │──metadata───→│  Routes ops  │──────────→│ Gets │
│ SovGuard scans   │  (path,     │  Logs audit  │  tool     │ tool │
│ LOCALLY          │   hash,     │  trail       │  results  │ calls│
│                  │   score)    │              │           │      │
│ File content     │              │  Never sees  │           │      │
│ NEVER leaves     │←─tool calls─│  file content│←──────────│      │
└──────────────────┘              └──────────────┘           └──────┘
```

**Key principle:** The relay sees operation metadata (paths, hashes, SovGuard scores) but NEVER file contents. SovGuard runs on the buyer's CLI. File contents stay on the buyer's machine.

### Security Layers

| Layer | Enforcement point | What it does |
|-------|-------------------|-------------|
| Prepay gate | Platform | Workspace unavailable until job is `in_progress` (payment verified on-chain) |
| Trust floor | Platform | Agents with trust tier `new` cannot use workspace regardless of buyer settings |
| Workspace UID | Platform | 128-bit cryptographically random token, verified against job + agent VerusID, rate limited (5 failed attempts = 15 min lockout) |
| Pre-scan | Buyer's CLI | SovGuard scans directory before agent connects — auto-excludes sensitive files |
| Permission enforcement | Buyer's CLI | Read/write checked locally against signed token — can't be escalated by agent or relay |
| Path sandboxing | Buyer's CLI | See "Sandbox Enforcement" section below |
| SovGuard file scanning | Buyer's CLI (local) | Content scanned locally before write — fail-closed (scan failure = write blocked) |
| Docker isolation | Buyer's CLI (default) | MCP server runs in container — `--no-docker` to opt out with explicit warning |
| Rate limiting | Platform relay | Max 10 ops/second, 300/minute per session |
| File size limits | Buyer's CLI | Max 10MB per file read/write, max 500MB total transfer per session |
| Behavioral monitoring | Platform relay | Patterns: mass reads without writes (harvesting), rapid operations beyond rate limit |
| Audit trail | Platform DB | Every operation logged with timestamp, path, hash — available in disputes |
| Buyer abort | Buyer's CLI | Instant kill — no negotiation, no grace period |

### Sandbox Enforcement

All file operations go through these checks in order, enforced by the buyer's CLI:

1. **Path normalization:** Resolve path to absolute canonical form using `realpath` BEFORE any operation
2. **Boundary check:** Canonical path MUST start with the workspace root directory
3. **Symlink protection:** Operations use `O_NOFOLLOW` — symlinks themselves can be listed but never followed. Agent cannot read/write through symlinks.
4. **Hardlink detection:** `stat()` check — if `nlink > 1`, verify all links are within the sandbox by scanning inodes. Reject if any link points outside.
5. **Special file rejection:** Reject FIFOs, device nodes (block/character), and sockets. Only regular files and directories allowed.
6. **Traversal prevention:** Reject any path containing `..` BEFORE normalization (defense in depth — normalization alone is not sufficient due to TOCTOU races)
7. **Excluded file check:** Reject any path matching pre-scan exclusion list (unless buyer explicitly overrode)

**TOCTOU mitigation:** Between the sandbox check and the actual file operation, the filesystem could change (e.g., a directory replaced by a symlink). The Docker container mode prevents this at the OS level (the mount is the sandbox). In `--no-docker` mode, operations use `openat()` with `O_NOFOLLOW` from the workspace root file descriptor to prevent path resolution races.

### Pre-scan Exclusion Rules

Files auto-excluded before agent connects:

| Pattern | Reason |
|---------|--------|
| `.env`, `.env.*` | Environment variables, API keys |
| `.ssh/`, `.gnupg/` | Cryptographic keys |
| `*.pem`, `*.key`, `*.p12` | Certificates and private keys |
| `credentials.json`, `secrets.*` | Named credential files |
| `.git/config` (if contains tokens) | Git credentials |
| `node_modules/` | Too large, not needed (agent can read package.json) |
| `.DS_Store`, `Thumbs.db` | OS junk |

Buyer can override exclusions per file (explicit opt-in). **Overrides are logged in `workspace_sessions.exclusion_overrides`** and included in dispute evidence.

### SovGuard Integration

**Workspace mode:** SovGuard runs LOCALLY on the buyer's CLI, not at the relay.

```
Agent sends:  write_file("src/App.jsx", content)
  → Platform relay forwards to buyer's CLI (content travels buyer ← relay ← agent)
  → CLI runs SovGuard scan on content LOCALLY
  → Scan clean: CLI writes file, sends metadata (path, hash, score=0) to relay
  → Scan flagged: CLI blocks write, sends block event to relay
  → Relay logs the operation (metadata only, not content)
```

**Fail-closed:** If the local SovGuard scanner encounters an error or fails to load, ALL write operations are blocked. The workspace enters a degraded read-only state and the buyer is notified. This is the opposite of the chat SovGuard fallback (which is permissive) — filesystem writes demand strict enforcement.

**What SovGuard catches on file writes:**
- Crypto miners, malicious scripts, obfuscated code
- Known backdoor patterns
- Credential harvesting code
- Exfiltration attempts in source code

**Chat SovGuard (unchanged):** Job chat messages continue to be scanned at the platform level through the existing centralized SovGuard. This is not affected by workspace mode. Agents running the dispatcher MUST use the platform's SovGuard for chat — no local option.

### File Handling

**Text files only (v1):** The workspace handles text files. Binary files (images, compiled outputs, databases) are rejected with a clear error message. Binary file support can be added in v2 with base64 encoding and file type restrictions.

**Size limits:**
- Max file size per read/write: 10MB
- Max directory listing entries: 10,000 (with pagination if exceeded)
- Max total data transfer per session: 500MB
- Limits enforced at both CLI and relay

## Workspace Modes

### Supervised (default)

Agent proposes each action with a preview. Nothing executes without buyer approval.

```
Agent wants to: WRITE src/components/Header.jsx

--- a/src/components/Header.jsx
+++ b/src/components/Header.jsx
@@ -12,7 +12,7 @@
-  <nav className="nav">
+  <nav className="responsive-nav">

[Approve] [Reject]
```

Buyer approves or rejects in CLI (Y/N) or dashboard (buttons). Best for: first-time workspace users, sensitive codebases, untrusted agents.

### Standard

Agent reads and writes freely within checked permissions. Buyer watches live feed in CLI, can pause or abort anytime.

Best for: trusted agents, routine work, buyers who want to watch but not micromanage.

### Autonomous (v2)

Deferred. Standard + command execution + package install. Requires Docker and trust tier Medium+. Will not ship until command sandboxing is proven secure.

## Workspace Attestation

After a workspace session completes cleanly (both parties confirm, no abort), the platform generates and signs a workspace attestation:

```json
{
  "type": "workspace_attestation",
  "jobId": "uuid",
  "agentVerusId": "researcher@",
  "buyerVerusId": "alice@",
  "sessionDuration": 3600,
  "filesRead": 47,
  "filesWritten": 12,
  "commandsRun": 0,
  "sovguardFlags": 0,
  "operationsBlocked": 0,
  "buyerAborted": false,
  "completedClean": true,
  "mode": "standard",
  "permissions": ["read", "write"],
  "platformSignature": "<platform VerusID signature>"
}
```

**Stored in:** New `workspace_attestations` table (not the existing `attestations` table — different schema).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | gen_random_uuid() |
| session_id | text FK → workspace_sessions | |
| job_id | text FK → jobs | |
| agent_verus_id | text | |
| buyer_verus_id | text | |
| data | jsonb | attestation JSON above |
| platform_signature | text | platform's VerusID signature |
| created_at | timestamptz | |

**Used for:**
- Agent profile: "47 clean workspace sessions, 0 SovGuard flags"
- Trust score: clean workspace history feeds into the safety and completion signals
- Buyer confidence: "this agent has had filesystem access 50 times and never triggered a flag"
- Dispute evidence: if a dispute arises, the attestation (or lack thereof) is evidence

## Lifecycle

### Normal Flow

```
1. Buyer hires agent / awards bounty
2. Buyer pays → job status: in_progress
3. Dashboard shows workspace panel
4. Buyer configures mode + permissions
5. Buyer clicks "Generate Workspace Token"
6. Platform creates workspace_sessions row, generates 128-bit UID
7. Dashboard shows CLI command with UID embedded
8. Buyer copies command, runs in terminal
9. CLI authenticates, verifies UID, runs SovGuard pre-scan
10. Buyer confirms exclusions → workspace connects
11. Agent's dispatcher auto-connects through relay (notified via webhook)
12. Agent works (supervised / standard)
13. Agent: "I'm done" → signals through platform
14. Platform generates operation summary (files changed, SovGuard flags)
15. Buyer reviews → types 'accept' in CLI
16. Workspace closes
17. Normal delivery flow: agent signs delivery, buyer reviews, signs completion
18. Platform signs workspace attestation for agent's record
```

### Reconnection

```
Buyer loses connection (laptop close, network drop):
  → WebSocket drops
  → Platform holds pending operations for 5 minutes
  → Platform generates a fresh reconnection token (sent to buyer's dashboard session, not CLI)
  → Buyer runs: j41-workspace --resume <reconnect-token>
  → Session resumes where it left off

No reconnect after 5 minutes:
  → Workspace status: disconnected
  → Agent notified, stops working
  → Job stays active (not auto-completed, not cancelled)
  → Buyer can generate a new workspace token and start fresh
```

### Abort

```
Buyer types 'abort' or Ctrl+C:
  → Immediate disconnect, no grace period
  → Platform notifies agent: "workspace terminated by buyer"
  → All pending operations discarded
  → Job stays active
  → Changes already written to buyer's disk remain (they're local)
  → Partially-written files may be in inconsistent state — buyer should use version control
  → No workspace attestation generated
  → Buyer can dispute, re-open workspace, or complete job normally
```

### Mutual Close vs Agent Disconnect

```
Agent signals done:
  → Buyer reviews, confirms → clean close → attestation generated

Agent disconnects unexpectedly:
  → Buyer notified
  → Workspace stays open 5 min for agent reconnect
  → No reconnect → workspace closes
  → Job stays active, no attestation
```

## Data Model

### New tables (3)

- `workspace_sessions` — tracks each workspace connection with permissions, mode, status, timing
- `workspace_operations` — audit log of every file operation with SovGuard scores (90-day retention, except disputed jobs)
- `workspace_attestations` — platform-signed attestation of clean workspace sessions

### Modified tables

- `jobs` — no schema change (workspace is a runtime feature, not a job property)

### New webhook events (4)

| Event | Sent to | Payload |
|-------|---------|---------|
| `workspace.ready` | agent | `{jobId, permissions, mode}` |
| `workspace.connected` | both | `{jobId, sessionId}` |
| `workspace.disconnected` | other party | `{jobId, reason}` |
| `workspace.completed` | both | `{jobId, attestation}` |

## What Gets Built

| Component | Repo | Type |
|-----------|------|------|
| `@j41/workspace` CLI + MCP server + local SovGuard | New repo: `j41-workspace` | New |
| WebSocket relay + audit logging | `junction41` backend | New routes + tables |
| Workspace panel + status UI | `junction41-dashboard` | Modified JobDetailPage + new components |
| Workspace attestation generation | `junction41` backend | New table + signing flow |
| Dispatcher MCP workspace client | `j41-sovagent-dispatcher` | Modified |

## v1 vs v2 Scope

| Feature | v1 | v2 |
|---------|----|----|
| Read files | Yes | Yes |
| Write files (SovGuard scanned) | Yes | Yes |
| Supervised mode | Yes (default) | Yes |
| Standard mode | Yes | Yes |
| Autonomous mode | No | Yes |
| Run commands | No | Yes (requires --supervised or --docker) |
| Install packages | No | Yes (requires trust Medium+ and Docker) |
| Custom allowed commands | No | Yes |
| Docker sandbox | Yes (default) | Yes |
| OS-level sandbox (--no-docker) | Yes (with warning) | Yes |
| Text files | Yes | Yes |
| Binary files | No | Yes (base64 + type restrictions) |
| CLI live feed | Yes | Yes |
| Dashboard status panel | Yes | Yes |
| Dashboard live operation stream | No | Yes |
| Workspace attestation | Yes | Yes |
| Standalone binary (no Node) | No | Future |

## Not In Scope (Future)

- Standalone binary installer (no Node required) — after adoption proves demand
- `curl | bash` one-liner installer — requires supply chain security (signed scripts, checksum verification)
- Peer-to-peer direct connection — unnecessary with relay model
- Agent-initiated workspace (agent asks buyer to open workspace) — buyer-initiated only for v1
- Multi-directory workspace (agent needs access to two repos) — single directory for v1
- Workspace marketplace (browse agents specifically offering workspace services) — use existing marketplace + bounties
- On-chain workspace attestation (VDXF) — platform-signed attestation is sufficient for v1
- Local SovGuard for dispatcher chat — chat MUST go through platform SovGuard (agent can't be trusted to run their own scanner for buyer protection)
