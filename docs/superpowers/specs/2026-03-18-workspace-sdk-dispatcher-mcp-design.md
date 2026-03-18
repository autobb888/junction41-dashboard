# Workspace Integration — SDK + Dispatcher + MCP Server

## Overview

Agent-side workspace integration across 3 repos. The backend relay, dashboard panel, and buyer CLI (`j41-connect`) are already built. This spec adds the agent's ability to connect to a workspace and use the buyer's file tools.

**Architecture:** The SDK provides the core workspace client (Socket.IO to `/workspace` relay, MCP tool calls). The dispatcher automates workspace connection when a webhook arrives. The MCP server exposes workspace tools to Claude/Cursor users.

```
SDK (core)        → WorkspaceClient: connect, readFile, writeFile, listDirectory, sendToolCall
Dispatcher (auto) → handles workspace.ready webhook, injects tools into running executor
MCP Server (AI)   → exposes workspace tools as MCP protocol tools for Claude/Cursor
```

**Key principle:** The agent runs on the agent operator's machine. The buyer runs `j41-connect` on their machine. The platform relay routes tool calls between them. Docker, SovGuard, and supervised mode all run on the buyer's side. The agent side is just a Socket.IO client that sends `mcp:call` and receives `mcp:result`.

## 1. SDK (`j41-sovagent-sdk`)

### New: `src/workspace/client.ts`

`WorkspaceClient` class — handles the agent side of the workspace relay connection.

**Constructor:**
```typescript
const workspace = new WorkspaceClient(agent: J41Agent);
```

Takes the authenticated J41Agent instance. Uses its API URL and auth session to get connect tokens.

**Methods:**

| Method | Description |
|--------|-------------|
| `connect(jobId: string)` | Get connect token via REST, connect Socket.IO to `/workspace` namespace |
| `disconnect()` | Disconnect from workspace relay |
| `isConnected()` | Check connection status |
| `readFile(path: string)` | Read a file from the buyer's workspace. Returns file content string. |
| `writeFile(path: string, content: string)` | Write a file to the buyer's workspace. Returns success/error. |
| `listDirectory(path?: string)` | List files/dirs at path. Returns array of entries. |
| `sendToolCall(tool: string, params: object)` | Low-level: send mcp:call, wait for mcp:result. Returns raw result. |
| `signalDone()` | Emit `workspace:agent_done` to tell buyer the agent is finished |
| `onStatusChanged(handler)` | Listen for workspace status changes (paused, aborted, completed) |
| `onDisconnected(handler)` | Listen for unexpected disconnection |
| `getAvailableTools()` | Returns tool definitions in OpenAI function-calling format (for executor injection) |

**Internal flow for `connect(jobId)`:**
1. Call `GET /v1/workspace/:jobId/connect-token` using agent's authenticated session
2. Receive `{ token, wsUrl, namespace }` — note: `wsUrl` includes `/ws` path, so extract the origin
3. Connect Socket.IO: `io(origin + '/workspace', { path: '/ws', auth: { type: 'agent', token } })` where `origin` is `wsUrl` with the `/ws` path stripped
4. Listen for `mcp:result`, `workspace:status_changed` events
5. Wait for `workspace:status_changed` with `status: 'active'` before resolving (buyer may not have connected yet — the webhook fires at token generation, not when buyer's CLI connects)
6. Socket.IO reconnection enabled by default — on reconnect failure, re-fetch connect token via REST and retry
7. Return when buyer is connected and workspace is active

**Timing note:** The `workspace.ready` webhook fires when the buyer generates a token on the dashboard, NOT when the buyer's CLI actually connects. The agent should call `connect(jobId)` on receiving the webhook, but workspace tools should only be injected into the executor after the buyer's CLI connects (signaled by `workspace:status_changed` with `status: 'active'`).

**Internal flow for `readFile(path)`:**
1. Generate unique request ID
2. Emit `mcp:call` with `{ id, tool: 'read_file', params: { path } }`
3. Wait for `mcp:result` with matching ID (timeout: 30s)
4. If `success: true`, return `result.content[0].text`
5. If `success: false`, throw error with message

**Tool definitions for executor injection:**
```typescript
workspace.getAvailableTools()
// Returns:
[
  {
    type: 'function',
    function: {
      name: 'workspace_list_directory',
      description: 'List files in the buyer\'s project directory',
      parameters: { type: 'object', properties: { path: { type: 'string' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'workspace_read_file',
      description: 'Read a file from the buyer\'s project',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'workspace_write_file',
      description: 'Write content to a file in the buyer\'s project',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content']
      }
    }
  }
]
```

### Modified: `src/client/index.ts`

Add one REST method:

```typescript
async getWorkspaceConnectToken(jobId: string): Promise<{ token: string; wsUrl: string; namespace: string }>
```

Calls `GET /v1/workspace/:jobId/connect-token` with the agent's authenticated session.

### Modified: `src/agent.ts`

Add workspace client as a lazy property:

```typescript
class J41Agent {
  private _workspace: WorkspaceClient | null = null;

  get workspace(): WorkspaceClient {
    if (!this._workspace) {
      this._workspace = new WorkspaceClient(this);
    }
    return this._workspace;
  }
}
```

### Modified: `src/index.ts`

Export `WorkspaceClient` from the package index.

## 2. Dispatcher (`j41-sovagent-dispatcher`)

### Modified: `src/cli.js` (handleWebhookEvent function)

Add handler for `workspace.ready` webhook event in the `handleWebhookEvent()` switch statement:

> **Docker mode limitation:** IPC (`process.send()`) only works in local mode where job-agents are spawned as child processes. In Docker mode, there is no IPC channel to containers. For v1, workspace is supported in **local mode only**. Docker mode workspace support (via HTTP sidecar or file-based signaling) is deferred to v2.

```javascript
case 'workspace.ready':
  // Find the running job-agent for this jobId
  const jobAgent = activeJobs.get(data.jobId);
  if (jobAgent && jobAgent.process) {
    // Send IPC message to the running job-agent
    jobAgent.process.send({
      type: 'workspace_ready',
      jobId: data.jobId,
      sessionId: data.sessionId,
      permissions: data.permissions,
      mode: data.mode,
    });
    logger.info({ jobId: data.jobId }, 'Workspace ready — notified job-agent');
  }
  break;
```

Also handle `workspace.disconnected` and `workspace.completed`:

```javascript
case 'workspace.disconnected':
case 'workspace.completed':
  const agent = activeJobs.get(data.jobId);
  if (agent && agent.process) {
    agent.process.send({
      type: 'workspace_closed',
      jobId: data.jobId,
      reason: event, // 'workspace.disconnected' or 'workspace.completed'
    });
  }
  break;
```

### Modified: `src/job-agent.js`

Add workspace connection handling in the job-agent process:

**IPC message handler:**
```javascript
process.on('message', async (msg) => {
  if (msg.type === 'workspace_ready') {
    await connectWorkspace(msg.jobId, msg.permissions, msg.mode);
  }
  if (msg.type === 'workspace_closed') {
    disconnectWorkspace();
  }
  // ... existing dispute handling ...
});
```

**`connectWorkspace()` function:**
1. Call `agent.workspace.connect(jobId)` (SDK method)
2. Get tool definitions: `agent.workspace.getAvailableTools()`
3. Add workspace tools to the executor's available tool set
4. Send chat message to buyer: "I now have access to your project files. Starting work."
5. Register tool call handler so when the executor's LLM calls `workspace_read_file`, it routes to `agent.workspace.readFile(path)`

**`disconnectWorkspace()` function:**
1. Remove workspace tools from executor
2. Call `agent.workspace.disconnect()`
3. Log status change

**Tool routing in executor:**
When the LLM calls a workspace tool (e.g., `workspace_read_file`), the job-agent intercepts it and routes to the SDK. The `workspace_` prefix is stripped when constructing the relay `mcp:call` (SDK handles this internally):

```javascript
if (toolName.startsWith('workspace_')) {
  try {
    switch (toolName) {
      case 'workspace_list_directory':
        return await agent.workspace.listDirectory(args.path);
      case 'workspace_read_file':
        return await agent.workspace.readFile(args.path);
      case 'workspace_write_file':
        return await agent.workspace.writeFile(args.path, args.content);
    }
  } catch (err) {
    // Graceful error — don't crash the executor
    return `Workspace error: ${err.message}`;
  }
}
```

**Error handling:** All workspace tool calls must be wrapped in try/catch. If the buyer disconnects or the call times out (30s), return a graceful error string to the executor. If the workspace is paused (`SESSION_NOT_ACTIVE`), the error message should indicate the workspace is paused.

**Reconnection:** Socket.IO's built-in reconnection handles transient network issues. If the agent's connection drops permanently, the relay sends a `workspace.disconnected` webhook. The dispatcher should attempt to re-call `workspace.connect(jobId)` once. If that fails, remove workspace tools and notify via chat.

**Docker mode limitation:** IPC (`process.send()`) only works in local mode. For v1, workspace is supported in **local mode only**. Docker mode workspace support deferred to v2.

## 3. MCP Server (`j41-sovagent-mcp-server`)

### New: `src/tools/workspace.ts`

6 new MCP tools for Claude/Cursor users managing workspace sessions:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `workspace_connect` | `jobId: string` | Connect to a workspace session. Returns connection status. |
| `workspace_read_file` | `jobId: string, path: string` | Read a file from the buyer's workspace |
| `workspace_write_file` | `jobId: string, path: string, content: string` | Write a file to the buyer's workspace |
| `workspace_list_directory` | `jobId: string, path?: string` | List files/dirs in the buyer's workspace |
| `workspace_status` | `jobId: string` | Get workspace session status + operation counts |
| `workspace_done` | `jobId: string` | Signal work is complete, prompt buyer to accept |

**Why `jobId` on every tool?** The MCP server may handle multiple jobs. Each tool call needs to know which workspace to use. The server maintains a map of `jobId → WorkspaceClient` connections.

**Note:** The MCP server defines its own tool schemas (with `jobId` parameter) rather than reusing the SDK's `getAvailableTools()` output (which omits `jobId` since the dispatcher knows which job it's working on).

**State management:**
```typescript
const workspaces = new Map<string, WorkspaceClient>();

// workspace_connect creates and stores the connection
// All other tools look up by jobId
// workspace_done signals completion and removes from map
```

### Modified: `src/index.ts`

Import and register workspace tools alongside existing tool groups.

## Data Flow

```
1. Buyer generates workspace token on dashboard
2. Buyer runs: j41-connect ./project --uid <token> --read --write --supervised
3. Platform sends workspace.ready webhook to agent's dispatcher
4. Dispatcher forwards IPC to running job-agent
5. Job-agent calls agent.workspace.connect(jobId) (SDK)
6. SDK gets connect token via REST, connects Socket.IO to /workspace namespace
7. Workspace tools injected into executor's LLM tool set
8. LLM calls workspace_read_file → SDK sends mcp:call → relay → buyer CLI
9. Buyer CLI reads file in Docker → sends mcp:result → relay → SDK → LLM
10. For writes in supervised mode: buyer sees diff, approves Y/N
11. LLM signals done → agent.workspace.signalDone() → buyer types 'accept'
12. Platform signs attestation, workspace closes
```

## What Each Repo Touches

| Repo | Files Changed | New Files |
|------|--------------|-----------|
| `j41-sovagent-sdk` | `src/agent.ts`, `src/client/index.ts`, `src/index.ts` | `src/workspace/client.ts` |
| `j41-sovagent-dispatcher` | `src/webhook-server.js`, `src/job-agent.js`, `src/cli.js` | — |
| `j41-sovagent-mcp-server` | `src/index.ts` | `src/tools/workspace.ts` |

## Prerequisites

- Backend `workspace.ts` line 130 still references `@j41/workspace` — update to `@j41/connect` before shipping

## Not In Scope

- Agent-side Docker (agent runs normally, Docker is buyer-side only)
- Agent-side SovGuard scanning (SovGuard runs on buyer's CLI)
- New executor type (workspace tools are injected into existing executors)
- Workspace token generation (buyer does this on dashboard)
- Dispatcher Docker mode workspace support (local mode only for v1 — IPC limitation)
