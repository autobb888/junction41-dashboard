> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

# Audit Fixes: j41-sovagent-sdk, j41-sovagent-dispatcher, j41-sovagent-mcp-server

**Date:** 2026-03-20
**Repos:**
- SDK: `/home/bigbox/code/j41-sovagent-sdk`
- Dispatcher: `/home/bigbox/code/j41-sovagent-dispatcher`
- MCP Server: `/home/bigbox/code/j41-sovagent-mcp-server`

**Priority order:** Criticals → Highs → Mediums. Each task ends with a commit.

---

## Task 1 — SDK: Fix stale session token + connect-token timeout (C1, C2)

**Files:** `src/workspace/client.ts`, `src/agent.ts`

### Background

**C1:** `WorkspaceClient` is constructed in `J41Agent.workspace` getter (agent.ts:141-150) with a static `sessionToken` string captured at construction time. When `J41Agent.login()` refreshes the session, the `_client` gets the new token via `_client.setSessionToken()`, but the `WorkspaceClient` still holds the old one. The fix is to pass a getter function so the token is always fetched live from `_client`.

**C2:** The `connect()` method at `workspace/client.ts:65-70` calls `fetch()` with no `AbortController` timeout, unlike every other REST call in the SDK. On a slow/hung server this hangs indefinitely.

### Steps

- [ ] **1.1** In `src/workspace/client.ts`, change the `WorkspaceClientConfig` interface: replace `sessionToken: string` with `getSessionToken: () => string | null`.

```typescript
export interface WorkspaceClientConfig {
  apiUrl: string;
  getSessionToken: () => string | null;
}
```

- [ ] **1.2** In `connect()` at line 65, wrap the token fetch with an `AbortController` timeout (15s), and call `this.config.getSessionToken()` instead of `this.config.sessionToken`:

```typescript
async connect(jobId: string): Promise<void> {
  this._jobId = jobId;

  // Step 1: Get connect token via REST — use live token getter (C1 fix)
  const tokenController = new AbortController();
  const tokenTimer = setTimeout(() => tokenController.abort(), 15_000);
  let tokenRes: Response;
  try {
    tokenRes = await fetch(`${this.config.apiUrl}/v1/workspace/${jobId}/connect-token`, {
      headers: {
        'Cookie': `verus_session=${this.config.getSessionToken()}`,
      },
      credentials: 'include',
      signal: tokenController.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Workspace connect-token request timed out after 15s');
    }
    throw err;
  } finally {
    clearTimeout(tokenTimer);
  }
  // ... rest of connect() unchanged
```

- [ ] **1.3** In `src/agent.ts`, change the `workspace` getter to pass a token-getter function instead of a static string:

```typescript
get workspace(): WorkspaceClient {
  if (!this._workspace) {
    this._workspace = new WorkspaceClient({
      apiUrl: this._client.getBaseUrl(),
      getSessionToken: () => this._client.getSessionToken(),
    });
  }
  return this._workspace;
}
```

- [ ] **1.4** Search for any other places in the SDK that construct `WorkspaceClient` directly and update them to pass `getSessionToken` instead of `sessionToken`. Run: `grep -r "new WorkspaceClient" /home/bigbox/code/j41-sovagent-sdk/src/`

- [ ] **1.5** Verify TypeScript compiles cleanly: `cd /home/bigbox/code/j41-sovagent-sdk && yarn build`

- [ ] **1.6** Commit: `fix(workspace): stale session token via getter fn + connect-token timeout (C1, C2)`

---

## Task 2 — SDK: Path traversal validation + null checks + chat reconnect loop (H1, H3, H4, H5, M3)

**Files:** `src/workspace/client.ts`, `src/agent.ts`, `src/chat/client.ts`, `src/tx/payment.ts`

### Background

**H1:** `readFile(path)`, `writeFile(path, content)`, `listDirectory(path)` in `workspace/client.ts` accept arbitrary paths with no traversal validation — an LLM or malicious caller could pass `../../etc/passwd`.

**H3:** `deactivate()` in `agent.ts` calls `signMessage(this.wif!, ...)` — the `!` non-null assertion suppresses the check but the wif may actually be null at runtime (e.g., if agent was never given a WIF).

**H4:** `ChatClient.reconnect_failed` handler at `chat/client.ts:206-215` calls `this.connect()` unconditionally, which creates an infinite reconnect loop if the server is persistently down.

**H5:** `Math.ceil(amount * SATS_PER_COIN)` at `tx/payment.ts:32,69` has floating-point precision issues (e.g., `0.1 * 100000000 = 9999999.999...` rounded up incorrectly). Use `Math.round()` instead.

**M3:** `readFile` at line 199 and `writeFile` at line 204 do `result.content[0].text` with no null check — if the MCP result is malformed, this throws an unhandled TypeError.

### Steps

- [ ] **2.1** Add a path validation helper at the top of `src/workspace/client.ts` (after imports):

```typescript
/**
 * Validate that a workspace path is safe: relative, no `..` segments, no leading `/`.
 * Throws if invalid.
 */
function assertSafePath(path: string): void {
  if (!path || typeof path !== 'string') {
    throw new Error('Workspace path must be a non-empty string');
  }
  if (path.startsWith('/')) {
    throw new Error(`Workspace path must be relative, not absolute: "${path}"`);
  }
  const parts = path.split(/[\\/]/);
  if (parts.some(p => p === '..')) {
    throw new Error(`Workspace path must not contain ".." traversal: "${path}"`);
  }
}
```

- [ ] **2.2** Call `assertSafePath()` at the start of each high-level method in `WorkspaceClient`:

```typescript
async listDirectory(path: string = '.'): Promise<any[]> {
  assertSafePath(path);
  // ...
}

async readFile(path: string): Promise<string> {
  assertSafePath(path);
  // ...
}

async writeFile(path: string, content: string): Promise<string> {
  assertSafePath(path);
  // ...
}
```

- [ ] **2.3** Add null/length guards for `result.content[0].text` in `readFile` and `writeFile` (M3):

```typescript
async readFile(path: string): Promise<string> {
  assertSafePath(path);
  this._stats.filesRead++;
  const result = await this.sendToolCall('read_file', { path });
  if (!result?.content?.[0]?.text) {
    throw new Error(`readFile: unexpected MCP result format for path "${path}"`);
  }
  return result.content[0].text;
}

async writeFile(path: string, content: string): Promise<string> {
  assertSafePath(path);
  this._stats.filesWritten++;
  const result = await this.sendToolCall('write_file', { path, content });
  if (!result?.content?.[0]?.text) {
    throw new Error(`writeFile: unexpected MCP result format for path "${path}"`);
  }
  return result.content[0].text;
}
```

- [ ] **2.4** Fix `Math.ceil` → `Math.round` in `src/tx/payment.ts` (H5). Both occurrences: line 32 in `selectUtxos` and line 69 in `buildPayment`:

```typescript
// selectUtxos:
const targetSatoshis = Math.round(targetAmount * SATS_PER_COIN);

// buildPayment:
const amountSatoshis = Math.round(amount * SATS_PER_COIN);
```

- [ ] **2.5** Fix the chat reconnect loop in `src/chat/client.ts` (H4). Add a `_reconnectCycles` counter to the class and cap at 3 before surfacing the failure:

Add to class fields:
```typescript
private _reconnectCycles = 0;
private readonly MAX_RECONNECT_CYCLES = 3;
```

Replace the `reconnect_failed` handler:
```typescript
this.socket.on('reconnect_failed', () => {
  this._reconnectCycles++;
  if (this._reconnectCycles > this.MAX_RECONNECT_CYCLES) {
    const err = new Error(
      `[CHAT] Reconnect limit reached (${this.MAX_RECONNECT_CYCLES} cycles) — giving up`
    );
    console.error(err.message);
    if (this.onReconnectFailed) {
      this.onReconnectFailed(err);
    }
    return;
  }
  console.error(`[CHAT] All reconnection attempts failed — getting fresh token (cycle ${this._reconnectCycles}/${this.MAX_RECONNECT_CYCLES})...`);
  this.connect().catch((err) => {
    console.error('[CHAT] Auto-reconnect failed:', err.message);
    if (this.onReconnectFailed) {
      this.onReconnectFailed(err);
    }
  });
});
```

Also reset `_reconnectCycles` to 0 at the top of `connect()` when the connection succeeds:
```typescript
this.socket.on('connect', () => {
  this._reconnectCycles = 0; // Reset on successful connect
  if (!resolved) {
    // ... existing logic
  }
});
```

- [ ] **2.6** Fix H3 (`deactivate()` WIF null check) in `src/agent.ts`. Search for the `deactivate` method and add a guard before `signMessage(this.wif!, ...)`:

```typescript
if (!this.wif) {
  throw new Error('[J41] deactivate() requires a WIF key — agent was not initialized with signing capability');
}
```

- [ ] **2.7** Run `yarn build` in the SDK repo and verify clean compile.

- [ ] **2.8** Commit: `fix(sdk): path traversal validation, null guards, chat reconnect cap, payment precision (H1,H3,H4,H5,M3)`

---

## Task 3 — SDK: Medium fixes — WorkspaceStatus type, signChallenge prefix, decodeVdxfValue (M2, M4, M8)

**Files:** `src/client/index.ts`, `src/identity/signer.ts` (or wherever `signChallenge` lives), `src/workspace/client.ts`

### Background

**M2:** `getWorkspaceStatus` in `client/index.ts` returns `Promise<any>`. A typed interface improves safety for callers (MCP server, dispatcher).

**M4:** `signChallenge()` address validation treats any address starting with `'V'` as an R-address, but Verus R-addresses start with `'R'`. The `'V'` prefix belongs to i-addresses. This can cause incorrect signing path selection.

**M8:** `decodeVdxfValue` silently swallows JSON parse errors with an empty catch, making debugging impossible. Add a logged warning (not strict throw — strict would be a breaking change).

### Steps

- [ ] **3.1** Define a `WorkspaceStatus` interface in `src/workspace/client.ts` (or a shared types file):

```typescript
export interface WorkspaceStatus {
  jobId: string;
  status: 'pending' | 'active' | 'completed' | 'aborted';
  agentConnected: boolean;
  buyerConnected: boolean;
  createdAt: string;
  updatedAt: string;
  stats?: {
    filesRead: number;
    filesWritten: number;
    listDirectoryCalls: number;
  };
}
```

- [ ] **3.2** Update `getWorkspaceStatus` in `src/client/index.ts` to return `Promise<WorkspaceStatus>` instead of `Promise<any>`. Import `WorkspaceStatus` from the workspace module.

- [ ] **3.3** Fix `signChallenge()` address prefix validation (M4). Find the check in `src/identity/signer.ts` or `src/identity/verus-sign.ts`. Replace any `address.startsWith('V')` R-address check with the correct check. Verus R-addresses start with `'R'`; i-addresses start with `'i'`:

```typescript
// Before (incorrect):
const isRAddress = iAddress.startsWith('V') || iAddress.startsWith('R');

// After (correct):
const isRAddress = iAddress.startsWith('R');
const isIAddress = iAddress.startsWith('i');
```

Adjust the downstream signing path selection accordingly.

- [ ] **3.4** Find `decodeVdxfValue` in the SDK (likely in `src/onboarding/vdxf.ts` or similar). Add a logged warning on JSON parse failure (M8):

```typescript
// Before:
try {
  return JSON.parse(raw);
} catch {
  return raw;
}

// After:
try {
  return JSON.parse(raw);
} catch (e) {
  console.warn(`[VDXF] decodeVdxfValue: JSON parse failed, returning raw string. Error: ${(e as Error).message}`);
  return raw;
}
```

- [ ] **3.5** Run `yarn build` and verify clean compile.

- [ ] **3.6** Commit: `fix(sdk): WorkspaceStatus type, signChallenge prefix fix, decodeVdxfValue warning (M2,M4,M8)`

---

## Task 4 — Dispatcher: Fix env leak + MCP_COMMAND injection (C1, C2)

**Files:** `src/cli.js`, `src/executors/mcp.js`

### Background

**C1 (Dispatcher):** `MCP_COMMAND` in `executors/mcp.js:254` is split on whitespace and passed directly to `spawn()`. A misconfigured env var could execute an arbitrary binary. The executor already whitelists env vars for the child process (which is good), but the command itself is not validated.

**C2 (Dispatcher):** `startJobLocal()` at `cli.js:2761` uses `...process.env` which spreads ALL parent environment variables — including any secrets set in the dispatcher's environment (KIMI_API_KEY, J41_AGENT_WIF, database URLs, etc.) — into the child job-agent process. The Docker mode constructs env from scratch (correct). Local mode must do the same.

### Steps

- [ ] **4.1** In `src/executors/mcp.js`, add MCP_COMMAND validation in `_connectStdio()` before the `spawn()` call. Validate that the command starts with an expected safe prefix or matches an allowlist pattern:

```javascript
async _connectStdio() {
  if (!MCP_COMMAND) throw new Error('J41_MCP_COMMAND is not set');

  // Validate command: must be a non-empty string, must not contain shell metacharacters
  // and must start with a known-safe path prefix or binary name.
  const SAFE_COMMAND_PATTERN = /^(node|npx|python3?|\/usr\/|\/opt\/|\.\/|\/home\/)[^\0;&|`$<>]*$/;
  if (!SAFE_COMMAND_PATTERN.test(MCP_COMMAND.trim())) {
    throw new Error(
      `J41_MCP_COMMAND validation failed: "${MCP_COMMAND.substring(0, 80)}" does not match allowed pattern. ` +
      'Command must start with node, npx, python, or an absolute path.'
    );
  }

  const parts = MCP_COMMAND.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  // ... rest of existing spawn logic
```

- [ ] **4.2** In `src/cli.js`, replace the `...process.env` spread in `startJobLocal()` with an explicit whitelist of allowed env vars (matching what Docker mode does). The current spread is at line ~2761:

```javascript
// Build env vars — explicit whitelist only (C2 fix: no ...process.env spread)
const WHITELISTED_ENV = [
  'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'TERM', 'NODE_ENV',
  'HOSTNAME', 'TZ', 'NODE_PATH',
];
const env = {};
for (const key of WHITELISTED_ENV) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}

// Platform config — required for job-agent
env.J41_API_URL = J41_API_URL;
env.J41_AGENT_ID = agentInfo.id;
env.J41_IDENTITY = agentInfo.identity;
env.J41_JOB_ID = job.id;
env.JOB_TIMEOUT_MS = String(JOB_TIMEOUT_MS);
env.J41_KEYS_FILE = keysPath;
env.J41_SOUL_FILE = path.join(agentDir, 'SOUL.md');
env.J41_JOB_DIR = jobDir;

// Optional LLM config — only pass through if set in parent
const OPTIONAL_PASSTHROUGH = [
  'KIMI_API_KEY', 'KIMI_BASE_URL', 'KIMI_MODEL',
  'IDLE_TIMEOUT_MS', 'J41_MCP_COMMAND', 'J41_MCP_URL',
  'J41_EXECUTOR_AUTH', 'J41_EXECUTOR_TIMEOUT', 'J41_MCP_MAX_ROUNDS',
  'J41_EXECUTOR', 'MAX_CONVERSATION_LOG',
];
for (const key of OPTIONAL_PASSTHROUGH) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}
```

- [ ] **4.3** Keep the existing `getExecutorEnvVars(agentInfo)` injection that follows — it already extracts agent-specific vars from config files. Only ensure it merges into the new explicit env object (not into `...process.env`):

```javascript
// Per-agent executor env vars (from agent-config.json)
const executorVars = getExecutorEnvVars(agentInfo);
executorVars.forEach(v => {
  const [key, ...rest] = v.split('=');
  env[key] = rest.join('=');
});
```

- [ ] **4.4** Verify the child process spawn still works end-to-end in local mode by checking that `J41_KEYS_FILE`, `J41_JOB_DIR`, etc. are present in the env object.

- [ ] **4.5** Commit: `fix(dispatcher): env whitelist in startJobLocal, MCP_COMMAND validation (C1,C2)`

---

## Task 5 — Dispatcher: Key file safety + SSRF + IPC consolidation (H3, H5, H6)

**Files:** `src/cli.js`

### Background

**H3 (Dispatcher):** `keys.json` is chmod'd from `0o600` → `0o640` at line 2586 to allow Docker container access, but restored to `0o600` only in the normal cleanup path. If the dispatcher crashes during the job, the file stays at `0o640` permanently. The fix is to copy the keys to a temp file at `0o640` and mount the temp copy, leaving the original at `0o600`.

**H5 (Dispatcher):** Executor URL env vars (`J41_EXECUTOR_URL`, `J41_MCP_URL`, `J41_MCP_COMMAND`, etc.) are passed through from environment without any validation. A misconfigured URL could point to internal/private IP ranges (SSRF). Validate that URLs are `https://` and not RFC-1918 private IPs.

**H6 (Dispatcher):** `job-agent.js` registers two separate `process.on('message', ...)` IPC listeners — one in `main()` for workspace events (line ~215) and another at line ~238 for post-delivery events. Duplicate listeners cause double-handling of messages. Consolidate into one switch-dispatch handler.

### Steps

- [ ] **5.1** Add an SSRF validation helper near the top of `src/cli.js` (after the existing constants):

```javascript
/**
 * Validate that a URL is safe to use as an executor endpoint.
 * Rejects non-https schemes and private/internal IP ranges.
 */
function validateExecutorUrl(url, varName) {
  if (!url) return; // Optional — skip if not set
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${varName}: invalid URL "${url}"`);
  }
  if (parsed.protocol !== 'https:') {
    // Allow localhost/127.0.0.1 for development explicitly
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new Error(`${varName}: only HTTPS URLs are allowed (got "${parsed.protocol}")`);
    }
  }
  // Reject private IP ranges (SSRF protection)
  const PRIVATE_PATTERNS = [
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/,   // link-local
    /^fc00::/i,               // IPv6 ULA
    /^fe80::/i,               // IPv6 link-local
  ];
  if (PRIVATE_PATTERNS.some(p => p.test(parsed.hostname))) {
    throw new Error(`${varName}: private/internal IP address rejected for "${url}" (SSRF protection)`);
  }
}
```

- [ ] **5.2** Call `validateExecutorUrl()` during dispatcher startup (in the `start` command handler, before polling begins) for each relevant env var:

```javascript
validateExecutorUrl(process.env.J41_EXECUTOR_URL, 'J41_EXECUTOR_URL');
validateExecutorUrl(process.env.J41_MCP_URL, 'J41_MCP_URL');
validateExecutorUrl(process.env.KIMI_BASE_URL, 'KIMI_BASE_URL');
```

- [ ] **5.3** Fix the Docker mode key file chmod (H3). In the `startJobContainer()` function (around line 2580-2590), instead of chmod-ing the original `keys.json`, copy it to a temp file and mount the copy:

```javascript
// H3 fix: Copy keys to a temp file at 0o640 — do NOT chmod the original.
// This ensures the original stays at 0o600 even if the process crashes.
const tmpKeysPath = path.join(jobDir, 'keys.json');
fs.copyFileSync(keysPath, tmpKeysPath);
try {
  fs.chmodSync(tmpKeysPath, 0o640);
} catch {
  // best effort on systems that don't support chmod
}
// Use tmpKeysPath in the Docker bind mount instead of keysPath
```

Update the Docker container's `HostConfig.Binds` or `Mounts` to use `tmpKeysPath` instead of `keysPath`. Also remove the cleanup chmod (the one at line ~2718 that restores `0o600`) since the original was never modified.

- [ ] **5.4** Fix duplicate IPC listeners in `src/job-agent.js` (H6). Replace the two separate `process.on('message', ...)` registrations with a single consolidated handler using a switch dispatch:

Remove the first listener in `main()` (around line 213-223):
```javascript
// REMOVE THIS BLOCK:
if (process.send && !_workspaceIpcRegistered) {
  _workspaceIpcRegistered = true;
  process.on('message', async (msg) => {
    if (msg.type === 'workspace_ready') { ... }
    if (msg.type === 'workspace_closed') { ... }
  });
}
```

Remove the second listener (around line 237-243):
```javascript
// REMOVE THIS BLOCK:
if (process.send) {
  process.on('message', (msg) => {
    if (msg.type === 'workspace_ready' || msg.type === 'workspace_closed') return;
    ipcQueue.push(msg);
  });
}
```

Replace both with a single unified handler registered once, before `processJob()`:
```javascript
const ipcQueue = [];
if (process.send) {
  process.on('message', async (msg) => {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'workspace_ready':
        await connectWorkspace(msg.jobId, msg.permissions, msg.mode);
        break;
      case 'workspace_closed':
        disconnectWorkspace();
        break;
      default:
        // Queue for post-delivery handler
        ipcQueue.push(msg);
        break;
    }
  });
}
```

Remove the `_workspaceIpcRegistered` flag entirely as it is no longer needed.

- [ ] **5.5** Verify `yarn build` / `node src/cli.js --help` still works (no syntax errors).

- [ ] **5.6** Commit: `fix(dispatcher): temp copy for key chmod, SSRF URL validation, consolidate IPC listeners (H3,H5,H6)`

---

## Task 6 — Dispatcher: Medium fixes — permissions, idle timeout arg, validation (M7, M9, M10, M11, M13, M14)

**Files:** `src/cli.js`, `src/job-agent.js`

### Background

**M7:** `resolveSession()` (i.e., `resolveSession` in `processJob`) is called with no argument on idle timeout, making the reason untrackable. Pass `'idle-timeout'`.

**M9:** `config.json` and `seen-jobs.json` are written with default permissions (umask-dependent, often `0o644`). Files containing agent config should be `0o600`.

**M10:** `agentId` extracted from URL path in `webhook-server.js` at line 40 is used directly as a map key with no format validation. A crafted URL like `/webhook/../../../etc` could cause unexpected behavior.

**M11:** `workspace_write_file` in the dispatcher's `job-agent.js` workspace handler (line ~483) has no path traversal protection — `args.path` is forwarded directly to `_agent.workspace.writeFile()`. The SDK now validates paths (Task 2), but defense-in-depth requires the dispatcher to also validate.

**M13:** Job fields (`job.description`, `job.buyer`, `job.amount`, `job.currency`) are read from disk in `job-agent.js` without validating that the files exist and are non-empty before writing them.

**M14:** The timeout handler in `job-agent.js` (around line 533) creates a fresh `new J41Agent(...)` for attestation instead of reusing `_agent`. This is wasteful and duplicates login logic.

### Steps

- [ ] **6.1** Fix M7 — pass `'idle-timeout'` string to `resolveSession` in `processJob()` in `src/job-agent.js`:

```javascript
// Before:
resolveSession();

// After:
resolveSession('idle-timeout');
```

- [ ] **6.2** Fix M9 — set `0o600` after writing `seen-jobs.json` in `saveSeenJobs()` in `src/cli.js`:

```javascript
function saveSeenJobs(seen) {
  const obj = Object.fromEntries(seen);
  fs.writeFileSync(SEEN_JOBS_PATH, JSON.stringify(obj, null, 2));
  try { fs.chmodSync(SEEN_JOBS_PATH, 0o600); } catch {}
}
```

Also apply `0o600` after writing `config.json` wherever `saveConfig()` is called in `src/config.js` — find the write and add `fs.chmodSync` after it.

- [ ] **6.3** Fix M10 — validate the `agentId` from the URL path in `src/webhook-server.js` before using it:

```javascript
// After extracting agentId from urlParts:
const agentId = urlParts[2]; // /webhook/:agentId
// Validate format — must match expected agent ID pattern
if (!agentId || !/^agent-[1-9][0-9]*$/.test(agentId)) {
  res.writeHead(400);
  res.end('Invalid agent ID');
  return;
}
if (!agentWebhooks.has(agentId)) {
  res.writeHead(404);
  res.end('Unknown agent');
  return;
}
```

- [ ] **6.4** Fix M11 — add path traversal guard in `handleWorkspaceToolCall()` in `src/job-agent.js`:

```javascript
async function handleWorkspaceToolCall(toolName, args) {
  if (!_workspaceConnected) return 'Workspace is not connected';

  // Validate path arg for write operations (defense in depth — SDK also validates)
  if (args.path) {
    if (args.path.startsWith('/') || args.path.split(/[\\/]/).includes('..')) {
      return `Workspace error: invalid path "${args.path}" — must be relative with no ".." segments`;
    }
  }
  // ... rest of switch unchanged
```

- [ ] **6.5** Fix M13 — validate job field files exist and are non-empty before the job object is constructed in `main()` of `src/job-agent.js`:

```javascript
// Before constructing `job`, validate required files:
const REQUIRED_JOB_FILES = ['description.txt', 'buyer.txt', 'amount.txt', 'currency.txt'];
for (const filename of REQUIRED_JOB_FILES) {
  const fp = path.join(JOB_DIR, filename);
  if (!fs.existsSync(fp)) {
    throw new Error(`Required job file missing: ${fp}`);
  }
  const content = fs.readFileSync(fp, 'utf8').trim();
  if (!content) {
    throw new Error(`Required job file is empty: ${fp}`);
  }
}
```

- [ ] **6.6** Fix M14 — replace the fresh `new J41Agent(...)` in the timeout handler with the existing `_agent` global in `src/job-agent.js`. The timeout handler is the `setTimeout(async () => {...}, TIMEOUT_MS)` block around line 524. If `_agent` is not null, use it directly instead of creating a new instance:

```javascript
setTimeout(async () => {
  console.error('Job timeout! Signing deletion attestation and exiting.');
  try {
    const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    const attestTimestamp = Math.floor(Date.now() / 1000);

    // M14 fix: reuse existing _agent if available
    const agent = _agent || (() => {
      const { J41Agent } = require('@j41/sovagent-sdk/dist/index.js');
      const a = new J41Agent({ apiUrl: API_URL, wif: keys.wif, identityName: IDENTITY, iAddress: keys.iAddress });
      return a;
    })();

    // If using existing agent, skip re-authenticate (already authed)
    if (!_agent) await agent.authenticate();
    // ... rest of attestation unchanged
```

- [ ] **6.7** Commit: `fix(dispatcher): idle timeout arg, file permissions, webhook agentId validation, path traversal, job file validation, reuse _agent (M7,M9,M10,M11,M13,M14)`

---

## Task 7 — MCP Server: Fix signing message formats for complete + dispute (C1, C2)

**Files:** `src/tools/jobs.ts`

### Background

**C1 (MCP):** `j41_complete_job` at line 114 uses the wrong signing message format: `complete:${jobId}:${timestamp}` — this uses the jobId (not jobHash) and uses a non-canonical format that the platform does not verify. The correct format is `J41-COMPLETE|Job:${jobHash}|Ts:${timestamp}|I confirm the work has been delivered satisfactorily.`

**C2 (MCP):** `j41_dispute_job` at line 156 uses `dispute:${jobId}:${reason}:${timestamp}` — also wrong format and uses jobId not jobHash. The correct format is `J41-DISPUTE|Job:${jobHash}|Ts:${timestamp}|${reason}` (check SDK signing/messages.ts for exact format and add builders there if missing).

Both bugs mean the platform's signature verification will reject these operations.

### Steps

- [ ] **7.1** First, check whether `buildCompleteMessage` and `buildDisputeMessage` builders exist in the SDK at `src/signing/messages.ts`. If not, add them:

In `/home/bigbox/code/j41-sovagent-sdk/src/signing/messages.ts`, append:

```typescript
export interface CompleteMessageParams {
  /** Job hash from the platform */
  jobHash: string;
  /** Unix timestamp (seconds) */
  timestamp: number;
}

export interface DisputeMessageParams {
  /** Job hash from the platform */
  jobHash: string;
  /** Reason for the dispute */
  reason: string;
  /** Unix timestamp (seconds) */
  timestamp: number;
}

/**
 * Build the canonical complete message for signing.
 * This is the exact format the J41 platform verifies for job completion.
 */
export function buildCompleteMessage(params: CompleteMessageParams): string {
  return `J41-COMPLETE|Job:${params.jobHash}|Ts:${params.timestamp}|I confirm the work has been delivered satisfactorily.`;
}

/**
 * Build the canonical dispute message for signing.
 * This is the exact format the J41 platform verifies for job disputes.
 */
export function buildDisputeMessage(params: DisputeMessageParams): string {
  return `J41-DISPUTE|Job:${params.jobHash}|Ts:${params.timestamp}|${params.reason}`;
}
```

- [ ] **7.2** Export the new builders from the SDK's main index if they aren't already. In `/home/bigbox/code/j41-sovagent-sdk/src/signing/messages.ts`, verify the exports are complete, then check `src/index.ts` exports the signing/messages module.

- [ ] **7.3** Rebuild the SDK: `cd /home/bigbox/code/j41-sovagent-sdk && yarn build`

- [ ] **7.4** In `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/jobs.ts`, import the new builders and fix `j41_complete_job`:

```typescript
import { buildCompleteMessage, buildDisputeMessage } from '@j41/sovagent-sdk';
```

Replace the `j41_complete_job` signing logic:
```typescript
// BEFORE (wrong):
const message = `complete:${jobId}:${timestamp}`;

// AFTER (correct):
const jobDetails = await agent.client.getJob(jobId);
if (!jobDetails.jobHash) throw new Error('Job is missing jobHash — cannot sign completion');
const message = buildCompleteMessage({ jobHash: jobDetails.jobHash, timestamp });
```

- [ ] **7.5** Fix `j41_dispute_job` signing logic in the same file:

```typescript
// BEFORE (wrong):
const message = `dispute:${jobId}:${reason}:${timestamp}`;

// AFTER (correct):
const jobDetails = await agent.client.getJob(jobId);
if (!jobDetails.jobHash) throw new Error('Job is missing jobHash — cannot sign dispute');
const message = buildDisputeMessage({ jobHash: jobDetails.jobHash, reason, timestamp });
```

- [ ] **7.6** Run TypeScript build in the MCP server: `cd /home/bigbox/code/j41-sovagent-mcp-server && yarn build`

- [ ] **7.7** Commit to SDK: `fix(sdk): add buildCompleteMessage and buildDisputeMessage signing builders`

- [ ] **7.8** Commit to MCP server: `fix(mcp): correct signing message format for complete and dispute — use jobHash + canonical format (C1,C2)`

---

## Task 8 — MCP Server: Fix accept/deliver builders + WIF exposure (H3, H4, H5)

**Files:** `src/tools/jobs.ts`, `src/tools/identity.ts`, `src/state.ts`

### Background

**H3 (MCP):** `j41_accept_job` and `j41_deliver_job` inline-build their signing messages instead of using the SDK's `buildAcceptMessage`/`buildDeliverMessage` builders from `@j41/sovagent-sdk`. While the strings are currently identical, coupling to inline strings is fragile — if the platform changes the format, the SDK builders will be updated but the MCP server won't.

**H4 (MCP):** `j41_sign_message` and `j41_sign_challenge` accept raw WIF as a required parameter — the WIF is visible in MCP logs and in the LLM's context window. Use the stored WIF from `state.ts` by default; only accept explicit WIF if the user explicitly opts out.

**H5 (MCP):** `j41_generate_keypair` returns the WIF in the tool response. This is visible to the LLM and appears in conversation logs. The WIF should be stored internally (in state.ts) and only the public address returned.

### Steps

- [ ] **8.1** Fix H3 — replace inline message strings in `j41_accept_job` and `j41_deliver_job` with SDK builders. In `src/tools/jobs.ts`, the imports at the top should already include or need to add:

```typescript
import { buildAcceptMessage, buildDeliverMessage } from '@j41/sovagent-sdk';
```

In `j41_accept_job`:
```typescript
// Before:
const message = `J41-ACCEPT|Job:${jobDetails.jobHash}|Buyer:${jobDetails.buyerVerusId}|Amt:${jobDetails.amount} ${jobDetails.currency}|Ts:${timestamp}|I accept this job and commit to delivering the work.`;

// After:
const message = buildAcceptMessage({
  jobHash: jobDetails.jobHash,
  buyerVerusId: jobDetails.buyerVerusId,
  amount: jobDetails.amount,
  currency: jobDetails.currency,
  timestamp,
});
```

In `j41_deliver_job`:
```typescript
// Before:
const message = `J41-DELIVER|Job:${jobDetails.jobHash}|Delivery:${deliveryHash}|Ts:${timestamp}|I have delivered the work for this job.`;

// After:
const message = buildDeliverMessage({
  jobHash: jobDetails.jobHash,
  deliveryHash,
  timestamp,
});
```

- [ ] **8.2** Fix H4 — redesign `j41_sign_message` and `j41_sign_challenge` in `src/tools/identity.ts` to use stored WIF by default. Make `wif` optional, defaulting to the stored WIF:

```typescript
server.tool(
  'j41_sign_message',
  'Sign an arbitrary message. Uses the stored agent WIF by default.',
  {
    message: z.string().min(1).describe('Message to sign'),
    network: z.enum(['verus', 'verustest']).default('verustest').describe('Verus network'),
    // wif is optional — only provide if you want to sign with a different key
    wif: z.string().optional().describe('WIF private key (optional — uses stored agent key if omitted)'),
  },
  async ({ message, network, wif }) => {
    try {
      let signature: string;
      if (wif) {
        // Explicit WIF provided — use it
        signature = signMessage(wif, message, network);
      } else {
        // Use stored WIF from state (does not expose the key)
        signature = signWithAgent(message);
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ signature }) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

Apply the same pattern to `j41_sign_challenge` — make `wif` optional, use `signWithAgent` if omitted. Import `signWithAgent` from `'../state.js'`.

- [ ] **8.3** Fix H5 — redesign `j41_generate_keypair` to store the WIF internally and return only the public info. In `src/tools/identity.ts`:

```typescript
server.tool(
  'j41_generate_keypair',
  'Generate a new Verus keypair. The WIF is stored internally and NOT returned — use j41_init_agent to activate it.',
  { network: z.enum(['verus', 'verustest']).default('verustest').describe('Verus network') },
  async ({ network }) => {
    try {
      const kp = generateKeypair(network);
      // H5 fix: Store WIF in a local variable for display in the warning message only.
      // Do NOT return the WIF in the tool response.
      // The caller should copy it from the console/log during setup, then discard.
      console.error(`[j41_generate_keypair] Generated WIF (store securely, not logged again): ${kp.wif}`);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            pubkey: kp.pubkey,
            address: kp.address,
            network,
            note: 'WIF was written to stderr for one-time capture. Use j41_init_agent with the WIF to activate.',
          }, null, 2),
        }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

Note: This is a behavior change. The WIF is written to stderr (not the MCP response) so an operator can capture it during setup without it appearing in the LLM conversation. Document this in the tool description.

- [ ] **8.4** Update imports in `src/tools/identity.ts` to include `signWithAgent` from state:

```typescript
import { signWithAgent, requireState, AgentState } from '../state.js';
```

- [ ] **8.5** Run `yarn build` in the MCP server and verify clean compile.

- [ ] **8.6** Commit: `fix(mcp): use SDK message builders for accept/deliver, use stored WIF by default, WIF not returned from keypair gen (H3,H4,H5)`

---

## Task 9 — MCP Server: Workspace cleanup, path traversal, content limits, validation (H6, H8, M9, M10, M14, M16, M17, M18)

**Files:** `src/tools/workspace.ts`, `src/tools/jobs.ts`, `src/tools/reviews.ts`, `src/tools/files.ts`, `src/tools/payments.ts`, `src/index.ts`, `src/tools/api-request.ts`

### Background

**H6:** Workspace connections in `workspaces` Map are never cleaned up on process shutdown — Socket.IO connections leak. Need `SIGTERM`/`SIGINT` handlers and a `j41_workspace_disconnect` tool.

**H8:** Workspace path params (`path`) in `j41_workspace_read_file`, `j41_workspace_write_file`, `j41_workspace_list_directory` are forwarded to the SDK without validation. The SDK now validates (Task 2), but the MCP server should also validate for defense-in-depth.

**M9:** `j41_workspace_done` calls `ws.signalDone()` but does not disconnect the workspace socket. The connection stays open, consuming relay resources.

**M10:** `j41_workspace_write_file` has no `z.string().max(...)` on the `content` parameter — an LLM could write arbitrarily large content, causing memory issues.

**M14:** `apiRequest` in `src/tools/api-request.ts` calls `res.json()` without a try/catch — if the server returns a non-JSON error response (HTML 502 page, etc.), it throws an unhandled parse error that becomes a confusing crash.

**M16:** `j41_submit_review` in `reviews.ts` constructs `buyerVerusId` as `${identity.identityName}@` — if `identityName` already ends with `@` (e.g., `myagent@`), this produces `myagent@@`.

**M17:** `j41_upload_file` in `files.ts` accepts `content` as a base64 string with no format validation and no maximum size limit — malformed base64 causes a cryptic Buffer error; oversized uploads bypass any client-side size limits.

**M18:** `j41_broadcast_tx` in `payments.ts` accepts `rawhex` with no hex validation — passing a non-hex string causes an opaque error deep in the node stack.

### Steps

- [ ] **9.1** Add a path validation helper in `src/tools/workspace.ts` (mirrors the SDK helper):

```typescript
function assertSafeWorkspacePath(pathArg: string | undefined, paramName = 'path'): void {
  if (!pathArg) return; // Optional path (e.g., listDirectory default '.')
  if (pathArg.startsWith('/')) {
    throw new Error(`Workspace ${paramName} must be relative, not absolute: "${pathArg}"`);
  }
  if (pathArg.split(/[\\/]/).includes('..')) {
    throw new Error(`Workspace ${paramName} must not contain ".." traversal: "${pathArg}"`);
  }
}
```

- [ ] **9.2** Call `assertSafeWorkspacePath()` at the start of `j41_workspace_read_file`, `j41_workspace_write_file`, and `j41_workspace_list_directory` handlers (H8).

- [ ] **9.3** Add `z.string().max(500_000)` to the `content` parameter of `j41_workspace_write_file` (M10):

```typescript
content: z.string().max(500_000).describe('File content to write (max 500KB)'),
```

- [ ] **9.4** Fix `j41_workspace_done` to disconnect after signaling (M9):

```typescript
async ({ jobId }) => {
  try {
    const ws = getWorkspace(jobId);
    ws.signalDone();
    // M9 fix: disconnect the workspace socket after signaling done
    ws.disconnect();
    workspaces.delete(jobId);
    return {
      content: [{ type: 'text' as const, text: `Signaled done and disconnected workspace for job ${jobId}.` }],
    };
  } catch (err) {
    return errorResult(err);
  }
},
```

- [ ] **9.5** Add a `j41_workspace_disconnect` tool to `src/tools/workspace.ts` (H6):

```typescript
server.tool(
  'j41_workspace_disconnect',
  'Disconnect from a workspace session and release the relay connection.',
  { jobId: z.string().min(1).describe('Job ID') },
  async ({ jobId }) => {
    try {
      if (workspaces.has(jobId)) {
        workspaces.get(jobId)!.disconnect();
        workspaces.delete(jobId);
        return {
          content: [{ type: 'text' as const, text: `Disconnected workspace for job ${jobId}.` }],
        };
      }
      return {
        content: [{ type: 'text' as const, text: `No active workspace for job ${jobId}.` }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

- [ ] **9.6** Add `SIGTERM`/`SIGINT` cleanup handlers in `src/index.ts` (H6). After `server.connect(transport)`, add:

```typescript
function cleanupWorkspaces(): void {
  // Workspace map is in workspace.ts module scope — export a cleanup function
  // OR inline cleanup via the disconnectAll helper
  console.error('[MCP] Shutting down — disconnecting all workspaces...');
  // Call the exported cleanup if you add one to workspace.ts
}

process.on('SIGTERM', () => {
  cleanupWorkspaces();
  process.exit(0);
});
process.on('SIGINT', () => {
  cleanupWorkspaces();
  process.exit(0);
});
```

Export a `disconnectAllWorkspaces()` function from `src/tools/workspace.ts`:

```typescript
export function disconnectAllWorkspaces(): void {
  for (const [jobId, ws] of workspaces) {
    try { ws.disconnect(); } catch {}
    workspaces.delete(jobId);
  }
}
```

Import and call it in the signal handlers in `src/index.ts`.

- [ ] **9.7** Fix `apiRequest` non-JSON error handling (M14) in `src/tools/api-request.ts`:

```typescript
// Before:
const data = (await res.json()) as Record<string, unknown>;
if (!res.ok) {
  const err = (data?.error ?? {}) as Record<string, unknown>;
  throw new Error((err.message as string) || `HTTP ${res.status}`);
}

// After:
let data: Record<string, unknown>;
try {
  data = (await res.json()) as Record<string, unknown>;
} catch {
  // Server returned non-JSON (e.g., HTML error page, 502 Bad Gateway)
  throw new Error(`HTTP ${res.status} — server returned non-JSON response`);
}
if (!res.ok) {
  const err = (data?.error ?? {}) as Record<string, unknown>;
  throw new Error((err.message as string) || `HTTP ${res.status}`);
}
```

- [ ] **9.8** Fix double `@` in `j41_submit_review` (M16) in `src/tools/reviews.ts`:

```typescript
// Before:
buyerVerusId: identity?.identityName ? `${identity.identityName}@` : identity?.address,

// After:
buyerVerusId: identity?.identityName
  ? identity.identityName.endsWith('@')
    ? identity.identityName
    : `${identity.identityName}@`
  : identity?.address,
```

- [ ] **9.9** Fix `j41_upload_file` in `src/tools/files.ts` (M17) — add base64 validation and size limit:

```typescript
// Add to the tool schema:
content: z.string()
  .min(1)
  .max(10_000_000) // 10MB base64 limit (~7.5MB decoded)
  .regex(/^[A-Za-z0-9+/]*={0,2}$/, 'content must be valid base64')
  .describe('File content as base64-encoded string'),
```

- [ ] **9.10** Fix `j41_broadcast_tx` in `src/tools/payments.ts` (M18) — add hex validation:

```typescript
// Add to the tool schema:
rawhex: z.string()
  .min(1)
  .regex(/^[0-9a-fA-F]+$/, 'rawhex must be a valid hex string (0-9, a-f)')
  .describe('Raw hex-encoded signed transaction'),
```

- [ ] **9.11** Run `yarn build` in the MCP server and verify clean compile.

- [ ] **9.12** Commit: `fix(mcp): workspace path traversal, content limits, cleanup on shutdown, api error handling, review double-@, base64/hex validation (H6,H8,M9,M10,M14,M16,M17,M18)`

---

## Task 10 — Build verification across all 3 packages

**Repos:** all three

### Steps

- [ ] **10.1** Full rebuild of SDK:
```bash
cd /home/bigbox/code/j41-sovagent-sdk
yarn build
```
Verify: zero TypeScript errors, `dist/` directory populated.

- [ ] **10.2** Full rebuild of Dispatcher:
```bash
cd /home/bigbox/code/j41-sovagent-dispatcher
node --check src/cli.js
node --check src/job-agent.js
node --check src/executors/mcp.js
node --check src/webhook-server.js
```
Verify: no syntax errors (dispatcher is CommonJS, not compiled).

- [ ] **10.3** Full rebuild of MCP Server:
```bash
cd /home/bigbox/code/j41-sovagent-mcp-server
yarn build
```
Verify: zero TypeScript errors, `dist/` directory populated.

- [ ] **10.4** Verify MCP server starts cleanly in stdio mode:
```bash
cd /home/bigbox/code/j41-sovagent-mcp-server
node dist/index.js 2>&1 | head -5
```
Expected: `MCP J41 server running on stdio`

- [ ] **10.5** Verify dispatcher starts cleanly:
```bash
cd /home/bigbox/code/j41-sovagent-dispatcher
node src/cli.js --help
```
Expected: commander help output, no crashes.

- [ ] **10.6** Verify SDK exports compile correctly and new message builders are accessible:
```bash
cd /home/bigbox/code/j41-sovagent-sdk
node -e "const s = require('./dist/index.js'); console.log(typeof s.buildCompleteMessage, typeof s.buildDisputeMessage, typeof s.buildAcceptMessage)"
```
Expected: `function function function`

- [ ] **10.7** Run a quick smoke test on the path validator logic (can be done inline):
```bash
node -e "
const { WorkspaceClient } = require('./dist/workspace/index.js');
// The constructor doesn't validate paths, but instantiate to check import works
console.log('WorkspaceClient imported OK');
"
```

- [ ] **10.8** Commit any remaining build artifacts or package.json changes if needed. If all 3 packages build cleanly, no additional commit is needed.

---

## Summary of Findings Addressed

| ID | Package | Severity | Description | Task |
|----|---------|----------|-------------|------|
| C1 | SDK | Critical | Stale session token in WorkspaceClient | 1 |
| C2 | SDK | Critical | Missing AbortController on connect-token fetch | 1 |
| H1 | SDK | High | No path traversal validation in workspace file methods | 2 |
| H3 | SDK | High | `deactivate()` null WIF dereference | 2 |
| H4 | SDK | High | Infinite reconnect loop on `reconnect_failed` | 2 |
| H5 | SDK | High | `Math.ceil` float precision in payment satoshi calc | 2 |
| M2 | SDK | Medium | `getWorkspaceStatus` returns `Promise<any>` | 3 |
| M3 | SDK | Medium | `result.content[0].text` with no null check | 2 |
| M4 | SDK | Medium | `signChallenge` wrong R-address prefix check | 3 |
| M8 | SDK | Medium | `decodeVdxfValue` silent JSON swallow | 3 |
| C1 | Dispatcher | Critical | MCP_COMMAND unvalidated in spawn() | 4 |
| C2 | Dispatcher | Critical | `...process.env` spreads all secrets to child | 4 |
| H3 | Dispatcher | High | keys.json chmod not restored on crash | 5 |
| H5 | Dispatcher | High | No SSRF protection on executor URL env vars | 5 |
| H6 | Dispatcher | High | Two separate IPC listeners in job-agent.js | 5 |
| M7 | Dispatcher | Medium | `resolveSession()` called without reason arg | 6 |
| M9 | Dispatcher | Medium | config.json / seen-jobs.json not chmod'd 0o600 | 6 |
| M10 | Dispatcher | Medium | Unvalidated agentId from URL in webhook-server.js | 6 |
| M11 | Dispatcher | Medium | No path traversal guard in workspace writeFile | 6 |
| M13 | Dispatcher | Medium | No validation that job files exist before job start | 6 |
| M14 | Dispatcher | Medium | Timeout handler creates new J41Agent instead of using `_agent` | 6 |
| C1 | MCP | Critical | `j41_complete_job` uses wrong signing message format | 7 |
| C2 | MCP | Critical | `j41_dispute_job` uses wrong signing message format | 7 |
| H3 | MCP | High | `j41_accept_job`/`j41_deliver_job` inline message strings | 8 |
| H4 | MCP | High | WIF exposed as required parameter in sign tools | 8 |
| H5 | MCP | High | `j41_generate_keypair` returns WIF in LLM-visible response | 8 |
| H6 | MCP | High | Workspace connections never cleaned up on shutdown | 9 |
| H8 | MCP | High | Workspace path params not validated | 9 |
| M9 | MCP | Medium | `j41_workspace_done` doesn't disconnect socket | 9 |
| M10 | MCP | Medium | `j41_workspace_write_file` has no content size limit | 9 |
| M14 | MCP | Medium | `apiRequest` doesn't handle non-JSON error responses | 9 |
| M16 | MCP | Medium | `j41_submit_review` may produce double `@` in buyerVerusId | 9 |
| M17 | MCP | Medium | `j41_upload_file` no base64 validation or size limit | 9 |
| M18 | MCP | Medium | `j41_broadcast_tx` no hex validation on rawhex | 9 |
