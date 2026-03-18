# Workspace Integration (SDK + Dispatcher + MCP Server) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add agent-side workspace support so agents can connect to the platform relay and use buyer's file tools (list_directory, read_file, write_file) through the SDK, dispatcher, and MCP server.

**Architecture:** The SDK provides a `WorkspaceClient` class (Socket.IO to `/workspace` namespace, MCP tool call routing). The dispatcher handles `workspace.ready` webhooks and injects workspace tools into running job-agent executors via IPC. The MCP server exposes 6 workspace tools for Claude/Cursor users.

**Tech Stack:** TypeScript, Socket.IO client (already in SDK), JavaScript (dispatcher), Zod (MCP server)

**Spec:** `docs/superpowers/specs/2026-03-18-workspace-sdk-dispatcher-mcp-design.md`

**Repos:**
- `/home/bigbox/code/j41-sovagent-sdk` — Tasks 1-4
- `/home/bigbox/code/j41-sovagent-dispatcher` — Tasks 5-6
- `/home/bigbox/code/j41-sovagent-mcp-server` — Task 7

---

## File Structure

### SDK (`j41-sovagent-sdk`) — 1 new file, 3 modified

| File | Responsibility |
|------|---------------|
| `src/workspace/client.ts` | NEW — WorkspaceClient: Socket.IO connection, tool calls, status events |
| `src/workspace/index.ts` | NEW — Re-export hub |
| `src/client/index.ts` | MODIFY — Add `getWorkspaceConnectToken()` REST method |
| `src/agent.ts` | MODIFY — Add lazy `workspace` property |
| `src/index.ts` | MODIFY — Export WorkspaceClient |

### Dispatcher (`j41-sovagent-dispatcher`) — 2 modified

| File | Responsibility |
|------|---------------|
| `src/cli.js` | MODIFY — Add workspace webhook cases in `handleWebhookEvent()` |
| `src/job-agent.js` | MODIFY — Add `connectWorkspace()`, `disconnectWorkspace()`, tool routing |

### MCP Server (`j41-sovagent-mcp-server`) — 1 new file, 1 modified

| File | Responsibility |
|------|---------------|
| `src/tools/workspace.ts` | NEW — 6 workspace MCP tools |
| `src/index.ts` | MODIFY — Register workspace tools |

---

## Chunk 1: SDK — WorkspaceClient

### Task 1: WorkspaceClient core

**Files:**
- Create: `/home/bigbox/code/j41-sovagent-sdk/src/workspace/client.ts`
- Create: `/home/bigbox/code/j41-sovagent-sdk/src/workspace/index.ts`

- [ ] **Step 1: Create src/workspace/client.ts**

```typescript
/**
 * WorkspaceClient — agent-side workspace relay connection
 *
 * Connects to the platform's /workspace Socket.IO namespace.
 * Sends MCP tool calls (read_file, write_file, list_directory)
 * and receives results from the buyer's CLI.
 */

import { io, Socket } from 'socket.io-client';

export interface WorkspaceClientConfig {
  apiUrl: string;
  sessionToken: string;
}

export interface WorkspaceToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export class WorkspaceClient {
  private config: WorkspaceClientConfig;
  private socket: Socket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<string, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private statusHandler: ((status: string, data?: any) => void) | null = null;
  private disconnectHandler: ((reason: string) => void) | null = null;
  private _connected = false;
  private _jobId: string | null = null;

  constructor(config: WorkspaceClientConfig) {
    this.config = config;
  }

  /**
   * Connect to the workspace relay for a specific job.
   * Gets a one-time connect token via REST, then connects Socket.IO.
   * Resolves when the buyer's CLI is connected (status: active).
   */
  async connect(jobId: string): Promise<void> {
    this._jobId = jobId;

    // Step 1: Get connect token via REST
    const tokenRes = await fetch(`${this.config.apiUrl}/v1/workspace/${jobId}/connect-token`, {
      headers: {
        'Cookie': `verus_session=${this.config.sessionToken}`,
      },
      credentials: 'include',
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to get connect token: ${tokenRes.status}`);
    }

    const { data } = await tokenRes.json();
    const { token, wsUrl } = data;

    // Step 2: Extract origin from wsUrl (strip /ws path if present)
    const origin = wsUrl.replace(/\/ws\/?$/, '');

    // Step 3: Connect Socket.IO to /workspace namespace
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      this.socket = io(origin + '/workspace', {
        path: '/ws',
        auth: { type: 'agent', token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 10,
      });

      this.socket.on('connect', () => {
        this._connected = true;
        // Don't resolve yet — wait for workspace to be active
      });

      this.socket.on('connect_error', (err) => {
        if (!settled) {
          settled = true;
          reject(new Error(`Workspace connection failed: ${err.message}`));
        }
      });

      // MCP results from buyer's CLI
      this.socket.on('mcp:result', (data: any) => {
        const pending = this.pendingRequests.get(data.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(data.id);
          if (data.success) {
            pending.resolve(data.result);
          } else {
            pending.reject(new Error(data.error || 'Tool call failed'));
          }
        }
      });

      // Status changes
      this.socket.on('workspace:status_changed', (data: { status: string; reason?: string }) => {
        if (data.status === 'active' && !settled) {
          settled = true;
          resolve(); // Buyer connected — workspace is ready
        }
        this.statusHandler?.(data.status, data);

        // Auto-cleanup on terminal states
        if (data.status === 'aborted' || data.status === 'completed') {
          this._connected = false;
        }
      });

      this.socket.on('workspace:agent_disconnected', (data: any) => {
        // This is about the OTHER agent disconnecting, not us
      });

      this.socket.on('ws:error', (data: { code: string; message: string }) => {
        if (!settled) {
          settled = true;
          reject(new Error(`Relay error: ${data.message}`));
        }
      });

      this.socket.on('disconnect', (reason) => {
        this._connected = false;
        this.disconnectHandler?.(reason);
      });

      // Timeout — if buyer doesn't connect within 5 minutes
      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Timeout waiting for buyer to connect workspace CLI'));
          this.disconnect();
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Low-level: send an MCP tool call and wait for result.
   * The tool name should NOT have workspace_ prefix — use the raw MCP tool name
   * (read_file, write_file, list_directory).
   */
  async sendToolCall(tool: string, params: Record<string, any>): Promise<any> {
    if (!this.socket || !this._connected) {
      throw new Error('Workspace not connected');
    }

    const id = `ws-${++this.requestId}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Tool call timeout: ${tool}`));
      }, 30_000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.socket!.emit('mcp:call', { id, tool, params });
    });
  }

  // ── High-level tool methods ───────────────────────────────────

  async listDirectory(path: string = '.'): Promise<any[]> {
    const result = await this.sendToolCall('list_directory', { path });
    try {
      return JSON.parse(result.content[0].text);
    } catch {
      return result;
    }
  }

  async readFile(path: string): Promise<string> {
    const result = await this.sendToolCall('read_file', { path });
    return result.content[0].text;
  }

  async writeFile(path: string, content: string): Promise<string> {
    const result = await this.sendToolCall('write_file', { path, content });
    return result.content[0].text;
  }

  /** Signal to the buyer that the agent's work is complete */
  signalDone(): void {
    this.socket?.emit('workspace:agent_done');
  }

  // ── Event handlers ────────────────────────────────────────────

  onStatusChanged(handler: (status: string, data?: any) => void): void {
    this.statusHandler = handler;
  }

  onDisconnected(handler: (reason: string) => void): void {
    this.disconnectHandler = handler;
  }

  // ── Tool definitions for executor injection ───────────────────

  getAvailableTools(): WorkspaceToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'workspace_list_directory',
          description: 'List files and directories in the buyer\'s project',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: 'Relative path (default: root)' } },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'workspace_read_file',
          description: 'Read a file from the buyer\'s project',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: 'Relative path to file' } },
            required: ['path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'workspace_write_file',
          description: 'Write content to a file in the buyer\'s project',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path to file' },
              content: { type: 'string', description: 'File content to write' },
            },
            required: ['path', 'content'],
          },
        },
      },
    ];
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  get isConnected(): boolean {
    return this._connected;
  }

  get jobId(): string | null {
    return this._jobId;
  }

  disconnect(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Workspace disconnected'));
    }
    this.pendingRequests.clear();
    this.socket?.disconnect();
    this.socket = null;
    this._connected = false;
    this._jobId = null;
  }
}
```

- [ ] **Step 2: Create src/workspace/index.ts**

```typescript
export { WorkspaceClient, type WorkspaceClientConfig, type WorkspaceToolDef } from './client.js';
```

- [ ] **Step 3: Commit**

```bash
cd /home/bigbox/code/j41-sovagent-sdk
git add src/workspace/
git commit -m "feat(workspace): WorkspaceClient — Socket.IO relay connection, tool calls, status events"
```

---

### Task 2: SDK REST method + agent integration

**Files:**
- Modify: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`
- Modify: `/home/bigbox/code/j41-sovagent-sdk/src/agent.ts`
- Modify: `/home/bigbox/code/j41-sovagent-sdk/src/index.ts`

- [ ] **Step 1: Add getWorkspaceConnectToken to client/index.ts**

Find the end of the J41Client class (before the closing `}`). Add this method:

```typescript
  async getWorkspaceConnectToken(jobId: string): Promise<{ token: string; wsUrl: string; namespace: string }> {
    const res = await this.request<{ data: { token: string; wsUrl: string; namespace: string } }>('GET', `/v1/workspace/${jobId}/connect-token`);
    return res.data;
  }
```

- [ ] **Step 2: Add workspace property to agent.ts**

Add import at the top of agent.ts (after existing imports):
```typescript
import { WorkspaceClient } from './workspace/index.js';
```

Add private property (after `private chatClient: ChatClient | null = null;`):
```typescript
  private _workspace: WorkspaceClient | null = null;
```

Add public getter (after the `get client()` getter):
```typescript
  /** Lazy workspace client — created on first access */
  get workspace(): WorkspaceClient {
    if (!this._workspace) {
      const token = this._client.getSessionToken();
      if (!token) throw new Error('Must be authenticated before accessing workspace');
      this._workspace = new WorkspaceClient({
        apiUrl: this._client.getBaseUrl(),
        sessionToken: token,
      });
    }
    return this._workspace;
  }
```

Add cleanup in the existing `stop()` or disconnect method (where `this.chatClient?.disconnect()` is called):
```typescript
    this._workspace?.disconnect();
    this._workspace = null;
```

- [ ] **Step 3: Export WorkspaceClient from src/index.ts**

After the chat exports line, add:
```typescript
export { WorkspaceClient, type WorkspaceClientConfig, type WorkspaceToolDef } from './workspace/index.js';
```

- [ ] **Step 4: Build and verify**

```bash
cd /home/bigbox/code/j41-sovagent-sdk
yarn build
```

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/client/index.ts src/agent.ts src/index.ts
git commit -m "feat(workspace): integrate WorkspaceClient into J41Agent + REST connect-token method"
```

---

## Chunk 2: Dispatcher

### Task 3: Dispatcher webhook handling

**Files:**
- Modify: `/home/bigbox/code/j41-sovagent-dispatcher/src/cli.js`

- [ ] **Step 1: Add workspace webhook cases to handleWebhookEvent()**

In `src/cli.js`, find the `handleWebhookEvent()` function (starts around line 2244). In the switch statement, after the last case (around line 2390), add before the `default:`:

```javascript
      case 'workspace.ready': {
        // Workspace token generated — notify running job-agent via IPC (local mode only)
        const wsJobId = data.jobId || event_data?.jobId;
        const activeInfo = state.active.get(wsJobId);
        if (activeInfo?.process?.send) {
          activeInfo.process.send({
            type: 'workspace_ready',
            jobId: wsJobId,
            sessionId: data.sessionId,
            permissions: data.permissions,
            mode: data.mode,
          });
          logger.info({ jobId: wsJobId }, 'Workspace ready — notified job-agent');
        } else {
          logger.warn({ jobId: wsJobId }, 'Workspace ready but no IPC channel (Docker mode not supported for workspace v1)');
        }
        break;
      }

      case 'workspace.disconnected':
      case 'workspace.completed': {
        const wsJobId2 = data.jobId || event_data?.jobId;
        const activeInfo2 = state.active.get(wsJobId2);
        if (activeInfo2?.process?.send) {
          activeInfo2.process.send({
            type: 'workspace_closed',
            jobId: wsJobId2,
            reason: event,
          });
          logger.info({ jobId: wsJobId2, reason: event }, 'Workspace closed — notified job-agent');
        }
        break;
      }
```

- [ ] **Step 2: Commit**

```bash
cd /home/bigbox/code/j41-sovagent-dispatcher
git add src/cli.js
git commit -m "feat(workspace): handle workspace.ready/disconnected/completed webhooks, forward via IPC"
```

---

### Task 4: Job-agent workspace connection

**Files:**
- Modify: `/home/bigbox/code/j41-sovagent-dispatcher/src/job-agent.js`

- [ ] **Step 1: Add workspace state variables**

Near the top of the file (after the existing global variables around line 53-55), add:

```javascript
let _workspaceConnected = false;
let _workspaceTools = [];
```

- [ ] **Step 2: Add connectWorkspace and disconnectWorkspace functions**

After the `processJob()` function (around line 380), add:

```javascript
/**
 * Connect to workspace and inject tools into executor
 */
async function connectWorkspace(jobId, permissions, mode) {
  if (_workspaceConnected) return;

  try {
    logger.info({ jobId, permissions, mode }, 'Connecting to workspace...');

    await _agent.workspace.connect(jobId);
    _workspaceConnected = true;

    // Get tool definitions for executor
    _workspaceTools = _agent.workspace.getAvailableTools();

    // Notify buyer via chat
    _agent.sendChatMessage(jobId, 'I now have access to your project files via workspace. Starting work.');

    // Listen for status changes
    _agent.workspace.onStatusChanged((status, data) => {
      logger.info({ jobId, status }, 'Workspace status changed');
      if (status === 'aborted' || status === 'completed') {
        disconnectWorkspace();
      }
    });

    _agent.workspace.onDisconnected((reason) => {
      logger.warn({ jobId, reason }, 'Workspace disconnected');
      _workspaceConnected = false;
      _workspaceTools = [];
    });

    logger.info({ jobId, toolCount: _workspaceTools.length }, 'Workspace connected — tools available');
  } catch (err) {
    logger.error({ err: err.message, jobId }, 'Failed to connect workspace');
    _agent.sendChatMessage(jobId, `Unable to connect to workspace: ${err.message}`);
  }
}

function disconnectWorkspace() {
  if (!_workspaceConnected) return;
  _workspaceConnected = false;
  _workspaceTools = [];
  try {
    _agent.workspace.disconnect();
  } catch {}
  logger.info('Workspace disconnected');
}

/**
 * Route a workspace tool call from the executor's LLM
 */
async function handleWorkspaceToolCall(toolName, args) {
  if (!_workspaceConnected) {
    return 'Workspace is not connected';
  }
  try {
    switch (toolName) {
      case 'workspace_list_directory':
        return JSON.stringify(await _agent.workspace.listDirectory(args.path || '.'));
      case 'workspace_read_file':
        return await _agent.workspace.readFile(args.path);
      case 'workspace_write_file':
        return await _agent.workspace.writeFile(args.path, args.content);
      default:
        return `Unknown workspace tool: ${toolName}`;
    }
  } catch (err) {
    return `Workspace error: ${err.message}`;
  }
}
```

- [ ] **Step 3: Add IPC handler for workspace messages**

Find the existing IPC message handler. There should be a `process.on('message', ...)` early in the file (around line 216-220) and the main handler in `waitForPostDelivery()`. Add a workspace handler BEFORE the processJob call (around line 260, inside main()):

```javascript
  // Workspace IPC handler (works alongside existing dispute IPC)
  if (process.send) {
    process.on('message', async (msg) => {
      if (msg.type === 'workspace_ready') {
        await connectWorkspace(msg.jobId, msg.permissions, msg.mode);
      }
      if (msg.type === 'workspace_closed') {
        disconnectWorkspace();
      }
    });
  }
```

**Note:** The existing IPC handler at line 216 queues messages. The workspace handler should be separate since it needs to run during the processJob phase, not just post-delivery.

- [ ] **Step 4: Wire workspace tools into executor tool calls**

In the `processJob()` function, find where the executor handles tool calls from the LLM. This varies by executor type, but for the local-llm executor, tool calls are processed in the agent loop. The simplest integration point is to modify the message handling to check for workspace tool calls.

Find where `executor.handleMessage()` is called (around line 299-310). After the executor returns its response, add workspace tool availability to the system context. The exact integration depends on the executor, but the key function is `handleWorkspaceToolCall()` which is already defined above.

For executors that support dynamic tool injection, add the workspace tools:
```javascript
// If workspace is connected, make tools available to executor
if (_workspaceConnected && _workspaceTools.length > 0) {
  // The executor's LLM will see these tools and can call them
  // Tool calls with workspace_ prefix are routed to handleWorkspaceToolCall()
}
```

The exact wiring depends on the executor pattern. The `handleWorkspaceToolCall()` function is the routing layer — it's called whenever the LLM invokes a `workspace_*` tool.

- [ ] **Step 5: Add cleanup**

In the cleanup section of main() (around line 250-252), add:
```javascript
  disconnectWorkspace();
```

- [ ] **Step 6: Commit**

```bash
cd /home/bigbox/code/j41-sovagent-dispatcher
git add src/job-agent.js
git commit -m "feat(workspace): job-agent workspace connection, tool routing, IPC handling"
```

---

## Chunk 3: MCP Server

### Task 5: MCP Server workspace tools

**Files:**
- Create: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/workspace.ts`
- Modify: `/home/bigbox/code/j41-sovagent-mcp-server/src/index.ts`

- [ ] **Step 1: Create src/tools/workspace.ts**

```typescript
/**
 * Workspace Tools — connect to buyer's project and work on files
 *
 * These tools let Claude/Cursor users manage workspace sessions
 * and interact with the buyer's local files through the J41 relay.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { errorResult } from './error.js';
import { requireState, getAgent, AgentState } from '../state.js';
import { WorkspaceClient } from '@j41/sovagent-sdk';

// Active workspace connections (one per job)
const workspaces = new Map<string, WorkspaceClient>();

function getWorkspace(jobId: string): WorkspaceClient {
  const ws = workspaces.get(jobId);
  if (!ws || !ws.isConnected) {
    throw new Error(`No active workspace for job ${jobId}. Use workspace_connect first.`);
  }
  return ws;
}

export function registerWorkspaceTools(server: McpServer): void {

  server.tool(
    'j41_workspace_connect',
    'Connect to a buyer\'s workspace session to access their project files',
    {
      jobId: z.string().min(1).describe('Job ID to connect workspace for'),
    },
    async ({ jobId }) => {
      try {
        requireState(AgentState.Authenticated);
        const agent = getAgent();

        // Disconnect existing workspace for this job if any
        if (workspaces.has(jobId)) {
          workspaces.get(jobId)!.disconnect();
          workspaces.delete(jobId);
        }

        const ws = agent.workspace;
        await ws.connect(jobId);
        workspaces.set(jobId, ws);

        return {
          content: [{ type: 'text' as const, text: `Connected to workspace for job ${jobId}. You can now read/write files in the buyer's project.` }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'j41_workspace_list_directory',
    'List files and directories in the buyer\'s project',
    {
      jobId: z.string().min(1).describe('Job ID'),
      path: z.string().optional().describe('Relative path (default: project root)'),
    },
    async ({ jobId, path }) => {
      try {
        const ws = getWorkspace(jobId);
        const entries = await ws.listDirectory(path || '.');
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'j41_workspace_read_file',
    'Read a file from the buyer\'s project',
    {
      jobId: z.string().min(1).describe('Job ID'),
      path: z.string().min(1).describe('Relative path to the file'),
    },
    async ({ jobId, path }) => {
      try {
        const ws = getWorkspace(jobId);
        const content = await ws.readFile(path);
        return {
          content: [{ type: 'text' as const, text: content }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'j41_workspace_write_file',
    'Write content to a file in the buyer\'s project (may require buyer approval in supervised mode)',
    {
      jobId: z.string().min(1).describe('Job ID'),
      path: z.string().min(1).describe('Relative path to the file'),
      content: z.string().describe('File content to write'),
    },
    async ({ jobId, path, content }) => {
      try {
        const ws = getWorkspace(jobId);
        const result = await ws.writeFile(path, content);
        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'j41_workspace_status',
    'Get the current workspace session status and operation counts',
    {
      jobId: z.string().min(1).describe('Job ID'),
    },
    async ({ jobId }) => {
      try {
        requireState(AgentState.Authenticated);
        const agent = getAgent();
        const res = await agent.client.request<any>('GET', `/v1/workspace/${jobId}`);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'j41_workspace_done',
    'Signal to the buyer that your work is complete. They will review and accept/reject.',
    {
      jobId: z.string().min(1).describe('Job ID'),
    },
    async ({ jobId }) => {
      try {
        const ws = getWorkspace(jobId);
        ws.signalDone();
        return {
          content: [{ type: 'text' as const, text: `Signaled done for job ${jobId}. Waiting for buyer to accept.` }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
```

- [ ] **Step 2: Register workspace tools in src/index.ts**

Find the tool registration section in `src/index.ts` (where other `register*Tools(server)` calls are). Add:

```typescript
import { registerWorkspaceTools } from './tools/workspace.js';
```

And in the registration block:
```typescript
registerWorkspaceTools(server);
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/bigbox/code/j41-sovagent-mcp-server
yarn build
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/workspace.ts src/index.ts
git commit -m "feat(workspace): 6 MCP tools — connect, list_directory, read_file, write_file, status, done"
```

---

## Chunk 4: Backend prerequisite fix

### Task 6: Fix backend install command reference

**Files:**
- Modify: `/home/bigbox/code/junction41/src/api/routes/workspace.ts`

- [ ] **Step 1: Update install command from @j41/workspace to @j41/connect**

In workspace.ts, find `installCommand: 'yarn global add @j41/workspace'` and replace with:

```typescript
installCommand: 'yarn global add @j41/connect',
```

Also find the CLI command template that uses `j41-workspace` and update to `j41-connect`:

```typescript
const command = `j41-connect ${/* ... */}`;
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
```

- [ ] **Step 3: Commit**

```bash
git add src/api/routes/workspace.ts
git commit -m "fix(workspace): rename @j41/workspace → @j41/connect in install command + CLI template"
```
