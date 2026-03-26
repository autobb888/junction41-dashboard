# j41-connect Terminal Chat + Model-Adaptive Theming Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time chat to j41-connect CLI so buyers can talk to agents in the terminal, with model-adaptive theming.

**Architecture:** Chat piggybacks on the existing `/workspace` Socket.IO namespace. A shared chat pipeline extracted from ws-server.ts ensures identical safety guarantees for both dashboard and CLI chat. Agent metadata (name, model provider) sent on workspace connect drives prompt prefix/color theming.

**Tech Stack:** TypeScript, Socket.IO, chalk, Node.js readline

**Spec:** `docs/superpowers/specs/2026-03-26-j41-connect-terminal-chat-design.md`

---

## File Structure

**Backend (junction41) — 1 new, 2 modified:**
- Create: `src/chat/chat-pipeline.ts` — shared message processing (sanitize, scan, store, circuit breaker)
- Modify: `src/chat/ws-server.ts` — refactor to call chat-pipeline instead of inline logic
- Modify: `src/chat/workspace-relay.ts` — add `chat:message` events + agent metadata on connect

**j41-connect — 1 new, 5 modified:**
- Create: `src/chat.ts` — chat display, history fetch, model theming
- Modify: `src/types.ts` — add ChatMessage interface, extend operation union
- Modify: `src/relay-client.ts` — add chat send/receive methods, agent metadata
- Modify: `src/supervisor.ts` — `/command` prefix, route default input to chat
- Modify: `src/cli.ts` — wire chat into main loop, fetch history
- Modify: `src/feed.ts` — add chat message formatting

---

## Chunk 1: Backend — Shared Chat Pipeline

### Task 1: Create `chat-pipeline.ts`

**Files:**
- Create: `/home/bigbox/code/junction41/src/chat/chat-pipeline.ts`

This extracts the message processing pipeline from ws-server.ts lines 407-658 into a reusable module.

- [ ] **Step 1: Create the shared pipeline module**

```typescript
// /home/bigbox/code/junction41/src/chat/chat-pipeline.ts
import { randomUUID } from 'crypto';
import { jobMessageQueries } from '../db/index.js';
import { logger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface ChatPipelineResult {
  id: string;
  content: string;
  safetyScore: number | null;
  safetyWarning: boolean;
  safetyDetail: { classification: string; flags: string[] } | null;
  held: boolean;
  createdAt: string;
}

export interface ChatPipelineBlocked {
  blocked: true;
  reason: string;
}

export interface ChatPipelineOptions {
  jobId: string;
  senderVerusId: string;
  content: string;
  signed?: boolean;
  signature?: string;
  /** SovGuard inbound scan engine (optional — skips if null) */
  sovguardEngine?: SovGuardEngine | null;
  /** SovGuard output scan engine (optional — skips if null) */
  outputScanEngine?: OutputScanEngine | null;
  /** Whether SovGuard is enabled for this job */
  safechatEnabled?: boolean;
  /** Job details needed for output scanning */
  job?: { buyer_verus_id: string; seller_verus_id: string; payment_address?: string };
}

export interface SovGuardEngine {
  scan(message: string): Promise<{
    score: number;
    safe: boolean;
    classification: string;
    flags: string[];
  }>;
}

export interface OutputScanEngine {
  scanOutput(message: string, context: {
    jobId: string;
    agentVerusId?: string;
    whitelistedAddresses?: Set<string>;
  }): Promise<{
    safe: boolean;
    score: number;
    classification: string;
    flags: Array<{ type: string; severity: string; detail: string; action: string; evidence?: string }>;
  }>;
}

// ── Sanitization ───────────────────────────────────────────

export function sanitizeMessage(content: string): string {
  return content
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[\u200B-\u200F\u2028-\u2029\u202A-\u202E\u2060-\u2064\u2066-\u206F]/g, '')
    .replace(/[\uFFF0-\uFFFF]/g, '')
    .trim();
}

// ── Session Scorer (crescendo detection) ───────────────────

class SessionScorer {
  private sessions = new Map<string, Array<{ score: number; timestamp: number }>>();
  constructor(private opts: {
    windowSize: number;
    sumThreshold: number;
    minFlaggedForEscalation: number;
    maxAgeMs: number;
    maxSessions?: number;
  }) {}

  record(sessionId: string, score: number) {
    const now = Date.now();
    let scores = this.sessions.get(sessionId);
    if (!scores) { scores = []; }
    scores.push({ score, timestamp: now });

    const cutoff = now - this.opts.maxAgeMs;
    const windowed = scores
      .filter(s => s.timestamp >= cutoff)
      .slice(-this.opts.windowSize);

    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, windowed);

    const max = this.opts.maxSessions ?? 10000;
    while (this.sessions.size > max) {
      const oldest = this.sessions.keys().next().value;
      if (oldest !== undefined) this.sessions.delete(oldest); else break;
    }

    const rollingSum = windowed.reduce((s, e) => s + e.score, 0);
    const flaggedCount = windowed.filter(e => e.score > 0.3).length;
    return {
      escalated: rollingSum >= this.opts.sumThreshold && flaggedCount >= this.opts.minFlaggedForEscalation,
      rollingSum: Math.round(rollingSum * 1000) / 1000,
      windowSize: windowed.length,
      flaggedCount,
    };
  }
}

const sessionScorer = new SessionScorer({
  windowSize: 10,
  sumThreshold: 2.0,
  minFlaggedForEscalation: 3,
  maxAgeMs: 3600000,
});

// ── Circuit Breaker ────────────────────────────────────────

interface RoomMessageTracker {
  messages: Array<{ sender: string; timestamp: number }>;
  paused: boolean;
  pausedAt: number;
}

const CIRCUIT_BREAKER_WINDOW_MS = 60 * 1000;
const CIRCUIT_BREAKER_THRESHOLD = 20;
const CIRCUIT_BREAKER_PAUSE_MAX_MS = 5 * 60 * 1000;

const roomTrackers = new Map<string, RoomMessageTracker>();

export function checkCircuitBreaker(room: string, sender: string): { allowed: boolean; paused: boolean } {
  let tracker = roomTrackers.get(room);
  if (!tracker) {
    tracker = { messages: [], paused: false, pausedAt: 0 };
    roomTrackers.set(room, tracker);
  }

  const now = Date.now();

  if (tracker.paused) {
    if (tracker.pausedAt && now - tracker.pausedAt > CIRCUIT_BREAKER_PAUSE_MAX_MS) {
      tracker.paused = false;
      tracker.pausedAt = 0;
      tracker.messages = [];
    } else {
      return { allowed: false, paused: true };
    }
  }

  tracker.messages = tracker.messages.filter(m => now - m.timestamp < CIRCUIT_BREAKER_WINDOW_MS);
  tracker.messages.push({ sender, timestamp: now });

  if (tracker.messages.length >= CIRCUIT_BREAKER_THRESHOLD) {
    const senders = new Set(tracker.messages.map(m => m.sender));
    if (senders.size <= 2) {
      tracker.paused = true;
      tracker.pausedAt = now;
      return { allowed: false, paused: true };
    }
  }

  return { allowed: true, paused: false };
}

// Cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [room, tracker] of roomTrackers) {
    tracker.messages = tracker.messages.filter(m => now - m.timestamp < CIRCUIT_BREAKER_WINDOW_MS);
    if (tracker.messages.length === 0 && !tracker.paused) {
      roomTrackers.delete(room);
    }
    if (tracker.paused && (tracker.messages.length === 0 || (tracker.pausedAt && now - tracker.pausedAt > CIRCUIT_BREAKER_PAUSE_MAX_MS))) {
      tracker.paused = false;
      tracker.pausedAt = 0;
      tracker.messages = [];
    }
  }
}, 60 * 1000);

// ── Flag Titles ────────────────────────────────────────────

const FLAG_TITLES: Record<string, string> = {
  pii_detected: 'Personal information detected in agent response',
  suspicious_url: 'Suspicious URL detected in agent response',
  malicious_code: 'Potentially malicious code in agent response',
  cross_contamination: 'Cross-job data leak detected',
  financial_manipulation: 'Financial manipulation attempt detected',
  agent_exfiltration: 'Data exfiltration attempt detected',
  data_uri: 'Embedded data URI detected in agent response',
};

// ── Main Pipeline ──────────────────────────────────────────

export async function processChatMessage(
  opts: ChatPipelineOptions
): Promise<ChatPipelineResult | ChatPipelineBlocked> {
  const { jobId, senderVerusId, content, signed, signature, sovguardEngine, outputScanEngine, safechatEnabled, job } = opts;

  // 1. Sanitize
  const sanitized = sanitizeMessage(content);
  if (!sanitized) {
    return { blocked: true, reason: 'Empty message after sanitization' };
  }
  if (sanitized.length > 4000) {
    return { blocked: true, reason: 'Message too long (max 4000 chars)' };
  }

  let safetyScore: number | null = null;
  let safetyWarning = false;
  let safetyDetail: { classification: string; flags: string[] } | null = null;
  let outputWarning = false;

  // 2. Circuit breaker
  const cbRoom = `chat:${jobId}`;
  const cbResult = checkCircuitBreaker(cbRoom, senderVerusId);
  if (!cbResult.allowed) {
    return { blocked: true, reason: 'Chat paused: unusual activity detected' };
  }

  // 3. SovGuard inbound scan
  if (sovguardEngine && safechatEnabled) {
    try {
      const result = await sovguardEngine.scan(sanitized);
      safetyScore = result.score;

      if (result.score > 0.8) {
        return { blocked: true, reason: 'Message blocked by safety filter' };
      }

      if (result.score >= 0.4) {
        safetyWarning = true;
        safetyDetail = {
          classification: result.classification,
          flags: (result.flags || []).slice(0, 3),
        };
      }

      // Multi-turn session scoring
      const sessionKey = `${senderVerusId}:${jobId}`;
      const escalation = sessionScorer.record(sessionKey, result.score);
      if (escalation.escalated) {
        logger.info({ sessionKey, rollingSum: escalation.rollingSum, flaggedCount: escalation.flaggedCount }, 'SovGuard crescendo escalation detected');
        return { blocked: true, reason: 'Messages blocked: unusual pattern detected' };
      }
    } catch (err) {
      logger.warn({ err }, 'SovGuard inbound scan failed, allowing message');
    }
  }

  // 4. Store message
  const messageId = await jobMessageQueries.insert({
    job_id: jobId,
    sender_verus_id: senderVerusId,
    content: sanitized,
    signed: !!signed,
    signature: signature || null,
    safety_score: safetyScore,
  });

  const createdAt = new Date().toISOString();

  // 5. Output scan (agent → buyer messages only)
  if (outputScanEngine && safechatEnabled && job) {
    const isSeller = senderVerusId === job.seller_verus_id;
    if (isSeller) {
      try {
        const whitelistedAddresses = new Set<string>();
        if (job.payment_address) whitelistedAddresses.add(job.payment_address);
        if (job.seller_verus_id) whitelistedAddresses.add(job.seller_verus_id);

        const outResult = await outputScanEngine.scanOutput(sanitized, {
          jobId,
          agentVerusId: senderVerusId,
          whitelistedAddresses,
        });

        if (outResult.score >= 0.6) {
          // Hold message
          const { holdMessage } = await import('./hold-queue.js');
          await holdMessage({
            jobId,
            senderVerusId,
            content: sanitized,
            safetyScore: outResult.score,
            flags: outResult.flags,
          });

          // Create alert
          const blockFlag = outResult.flags[0];
          if (blockFlag) {
            const { createAlert } = await import('../api/routes/alerts.js');
            await createAlert({
              jobId,
              buyerVerusId: job.buyer_verus_id,
              agentVerusId: senderVerusId,
              type: blockFlag.type as any,
              severity: outResult.score >= 0.8 ? 'critical' : 'warning',
              title: FLAG_TITLES[blockFlag.type] || 'Message flagged by SovGuard',
              detail: blockFlag.detail + (blockFlag.evidence ? ` (${blockFlag.evidence})` : ''),
              suggestedAction: outResult.score >= 0.8 ? 'report' : 'caution',
            });
          }

          return {
            id: messageId,
            content: sanitized,
            safetyScore: outResult.score,
            safetyWarning: true,
            safetyDetail: { classification: outResult.classification, flags: outResult.flags.map(f => f.type).slice(0, 3) },
            held: true,
            createdAt,
          };
        }

        if (outResult.score >= 0.3) {
          outputWarning = true;
          safetyWarning = true;
        }
      } catch (err) {
        logger.warn({ err }, 'Output scan failed, allowing message');
      }
    }
  }

  return {
    id: messageId,
    content: sanitized,
    safetyScore,
    safetyWarning: safetyWarning || outputWarning,
    safetyDetail,
    held: false,
    createdAt,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `cd /home/bigbox/code/junction41 && sudo docker compose up -d --build`
Expected: Build succeeds, no import errors

- [ ] **Step 3: Commit**

```bash
cd /home/bigbox/code/junction41
git add src/chat/chat-pipeline.ts
git commit -m "feat: extract shared chat pipeline from ws-server"
```

---

### Task 2: Refactor `ws-server.ts` to use shared pipeline

**Files:**
- Modify: `/home/bigbox/code/junction41/src/chat/ws-server.ts`

Replace the inline message processing (lines 407-658) with a call to `processChatMessage()`. The SessionScorer class (lines 81-116) and circuit breaker (lines 172-207) can be removed from ws-server.ts since they now live in chat-pipeline.ts.

- [ ] **Step 1: Add import and refactor message handler**

At the top of ws-server.ts, add:
```typescript
import { processChatMessage, sanitizeMessage, checkCircuitBreaker } from './chat-pipeline.js';
```

Replace the message handler body (the section after rate limiting and input validation, roughly lines 440-650) with:
```typescript
// Fetch job for safechat check
const chatJob = await jobQueries.getById(jobId);
if (!chatJob) { socket.emit('error', { message: 'Job not found' }); return; }
if (chatJob.status === 'paused') { socket.emit('error', { message: 'Job is paused' }); return; }
const safechatEnabled = chatJob.sovguard_enabled !== false;

const result = await processChatMessage({
  jobId,
  senderVerusId: socket.verusId,
  content,
  signed: !!signature,
  signature,
  sovguardEngine: sovguardEngine || null,
  outputScanEngine: outputScanEngine || null,
  safechatEnabled,
  job: {
    buyer_verus_id: chatJob.buyer_verus_id,
    seller_verus_id: chatJob.seller_verus_id,
    payment_address: chatJob.payment_address,
  },
});

if ('blocked' in result) {
  socket.emit('error', { message: result.reason });
  return;
}

if (result.held) {
  // Message held — notify agent generically, alert buyer
  socket.emit('message_held', { jobId, message: 'Message held for review' });
  return;
}

// Broadcast
const payload = {
  id: result.id,
  jobId,
  senderVerusId: socket.verusId,
  content: result.content,
  signed: !!signature,
  signature: signature || null,
  safetyScore: result.safetyScore,
  safetyWarning: result.safetyWarning,
  safetyDetail: result.safetyDetail,
  createdAt: result.createdAt,
};
io.to(room).emit('message', payload);
```

Keep the rate limiting and input validation that comes before. Keep the webhook/notification calls that come after. Remove the inline SessionScorer class, circuit breaker function, and sanitization function (they're now in chat-pipeline.ts).

- [ ] **Step 2: Remove duplicated code from ws-server.ts**

Remove from ws-server.ts:
- The `SessionScorer` class (lines 81-116) — now in chat-pipeline.ts
- The `sessionScorer` instance (lines 111-116) — now in chat-pipeline.ts
- The `checkCircuitBreaker` function (lines 172-207) — now in chat-pipeline.ts
- The `roomTrackers` map and `RoomMessageTracker` interface — now in chat-pipeline.ts
- The `roomTrackerCleanup` interval (lines 741-757) — now in chat-pipeline.ts
- The inline sanitization regex (lines 470-474) — now `sanitizeMessage()` in chat-pipeline.ts

Note: If the `checkCircuitBreaker` or `sanitizeMessage` are used elsewhere in ws-server.ts (e.g., for system messages), keep the import and use the shared version.

- [ ] **Step 3: Verify build + existing chat still works**

Run: `cd /home/bigbox/code/junction41 && sudo docker compose up -d --build`
Expected: Build succeeds. Test chat in dashboard — messages still flow, SovGuard scanning works.

- [ ] **Step 4: Commit**

```bash
cd /home/bigbox/code/junction41
git add src/chat/ws-server.ts
git commit -m "refactor: ws-server uses shared chat-pipeline"
```

---

### Task 3: Add chat events + agent metadata to workspace-relay.ts

**Files:**
- Modify: `/home/bigbox/code/junction41/src/chat/workspace-relay.ts`

- [ ] **Step 1: Add imports**

At the top of workspace-relay.ts:
```typescript
import { processChatMessage, type SovGuardEngine, type OutputScanEngine } from './chat-pipeline.js';
import { jobQueries } from '../db/index.js';
```

- [ ] **Step 2: Add agent metadata to buyer connect response**

In `handleBuyerConnect()`, after the session is fetched (around line 209), add an agent data lookup:

```typescript
// Fetch agent metadata for chat theming
const agentMeta = await db
  .selectFrom('agents')
  .select(['name', 'verus_id'])
  .where('verus_id', '=', session.agent_verus_id)
  .executeTakeFirst();

const agentPolicy = await db
  .selectFrom('agent_data_policies')
  .select(['model_info'])
  .where('agent_verus_id', '=', session.agent_verus_id)
  .executeTakeFirst();

let modelProvider: string | null = null;
let modelName: string | null = null;
if (agentPolicy?.model_info) {
  try {
    const mi = JSON.parse(agentPolicy.model_info);
    modelProvider = mi.provider || null;
    modelName = mi.model || null;
  } catch {}
}
```

Then modify the `workspace:status_changed` emit on buyer connect (line 281) to include the metadata:

```typescript
ns.to(`ws:${session.id}`).emit('workspace:status_changed', {
  status: 'active',
  agentName: agentMeta?.name || null,
  agentVerusId: session.agent_verus_id,
  modelProvider,
  modelName,
  jobId: session.job_id,
});
```

- [ ] **Step 3: Add chat:message handler for buyer**

Inside `registerBuyerHandlers()` (after the mcp:result handler around line 436), add:

```typescript
socket.on('chat:message', async (data: any) => {
  // Validate
  if (!data || typeof data.content !== 'string' || !data.content.trim() || data.content.length > 4000) {
    socket.emit('ws:error', { code: 'INVALID_PAYLOAD', message: 'Invalid chat message' });
    return;
  }

  // Rate limit (reuse existing checkOpRate)
  if (!checkOpRate(socket.wsSessionId)) {
    socket.emit('ws:error', { code: 'RATE_LIMITED', message: 'Rate limit exceeded' });
    return;
  }

  // Verify session active
  const current = await getSessionById(socket.wsSessionId);
  if (!current || !['active', 'paused'].includes(current.status)) {
    socket.emit('ws:error', { code: 'SESSION_NOT_ACTIVE', message: 'Workspace session not active' });
    return;
  }

  // Fetch job for safety context
  const chatJob = await jobQueries.getById(socket.wsJobId);
  if (!chatJob) return;

  // Process through shared pipeline
  const result = await processChatMessage({
    jobId: socket.wsJobId,
    senderVerusId: socket.wsVerusId,
    content: data.content,
    sovguardEngine: (globalThis as any).__sovguardEngine || null,
    outputScanEngine: (globalThis as any).__outputScanEngine || null,
    safechatEnabled: chatJob.sovguard_enabled !== false,
    job: {
      buyer_verus_id: chatJob.buyer_verus_id,
      seller_verus_id: chatJob.seller_verus_id,
      payment_address: chatJob.payment_address,
    },
  });

  if ('blocked' in result) {
    socket.emit('ws:error', { code: 'MESSAGE_BLOCKED', message: result.reason });
    return;
  }

  if (result.held) {
    socket.emit('ws:error', { code: 'MESSAGE_HELD', message: 'Message held for review' });
    return;
  }

  // Broadcast to room (agent + buyer both see it)
  ns.to(`ws:${socket.wsSessionId}`).emit('chat:message', {
    id: result.id,
    senderVerusId: socket.wsVerusId,
    content: result.content,
    safetyScore: result.safetyScore,
    safetyWarning: result.safetyWarning,
    safetyDetail: result.safetyDetail,
    createdAt: result.createdAt,
  });
});
```

- [ ] **Step 4: Add chat:message handler for agent**

Inside `registerAgentHandlers()` (after the mcp:call handler around line 705), add the same handler pattern but for agent-side:

```typescript
socket.on('chat:message', async (data: any) => {
  if (!data || typeof data.content !== 'string' || !data.content.trim() || data.content.length > 4000) {
    socket.emit('ws:error', { code: 'INVALID_PAYLOAD', message: 'Invalid chat message' });
    return;
  }

  if (!checkOpRate(socket.wsSessionId)) {
    socket.emit('ws:error', { code: 'RATE_LIMITED', message: 'Rate limit exceeded' });
    return;
  }

  const current = await getSessionById(socket.wsSessionId);
  if (!current || !['active', 'paused'].includes(current.status)) {
    socket.emit('ws:error', { code: 'SESSION_NOT_ACTIVE', message: 'Workspace session not active' });
    return;
  }

  const chatJob = await jobQueries.getById(socket.wsJobId);
  if (!chatJob) return;

  const result = await processChatMessage({
    jobId: socket.wsJobId,
    senderVerusId: socket.wsVerusId,
    content: data.content,
    sovguardEngine: (globalThis as any).__sovguardEngine || null,
    outputScanEngine: (globalThis as any).__outputScanEngine || null,
    safechatEnabled: chatJob.sovguard_enabled !== false,
    job: {
      buyer_verus_id: chatJob.buyer_verus_id,
      seller_verus_id: chatJob.seller_verus_id,
      payment_address: chatJob.payment_address,
    },
  });

  if ('blocked' in result) {
    socket.emit('ws:error', { code: 'MESSAGE_BLOCKED', message: result.reason });
    return;
  }

  if (result.held) {
    socket.emit('ws:error', { code: 'MESSAGE_HELD', message: 'Message held for review' });
    return;
  }

  ns.to(`ws:${socket.wsSessionId}`).emit('chat:message', {
    id: result.id,
    senderVerusId: socket.wsVerusId,
    content: result.content,
    safetyScore: result.safetyScore,
    safetyWarning: result.safetyWarning,
    safetyDetail: result.safetyDetail,
    createdAt: result.createdAt,
  });
});
```

- [ ] **Step 5: Pass SovGuard engines to globalThis**

In ws-server.ts where the SovGuard engines are initialized, store them on globalThis so workspace-relay.ts can access them:

```typescript
// In ws-server.ts, after sovguardEngine and outputScanEngine are created:
(globalThis as any).__sovguardEngine = sovguardEngine;
(globalThis as any).__outputScanEngine = outputScanEngine;
```

Alternative: If SovGuard engines are passed into `initWebSocket()`, pass them into `initWorkspaceRelay()` too and store as module-level variables. Check how ws-server.ts receives its engines and follow the same pattern.

- [ ] **Step 6: Build and verify**

Run: `cd /home/bigbox/code/junction41 && sudo docker compose up -d --build`
Expected: Build succeeds. No runtime errors in logs.

- [ ] **Step 7: Commit**

```bash
cd /home/bigbox/code/junction41
git add src/chat/workspace-relay.ts src/chat/ws-server.ts
git commit -m "feat: chat:message events on workspace relay + agent metadata"
```

---

## Chunk 2: j41-connect — Terminal Chat Client

### Task 4: Add types and relay-client chat support

**Files:**
- Modify: `/home/bigbox/code/j41-connect/src/types.ts`
- Modify: `/home/bigbox/code/j41-connect/src/relay-client.ts`

- [ ] **Step 1: Add chat types**

In `/home/bigbox/code/j41-connect/src/types.ts`, add after the existing interfaces:

```typescript
export interface ChatMessage {
  id: string;
  senderVerusId: string;
  content: string;
  safetyScore: number | null;
  safetyWarning: boolean;
  safetyDetail?: { classification: string; flags: string[] } | null;
  createdAt: string;
}

export interface AgentMeta {
  agentName: string | null;
  agentVerusId: string | null;
  modelProvider: string | null;
  modelName: string | null;
  jobId: string | null;
}
```

- [ ] **Step 2: Add chat methods to relay-client.ts**

In `/home/bigbox/code/j41-connect/src/relay-client.ts`:

Add import:
```typescript
import type { ChatMessage, AgentMeta } from './types.js';
```

Add handler properties (after existing private handlers around line 17):
```typescript
private onChatMsg: ((msg: ChatMessage) => void) | null = null;
public agentMeta: AgentMeta = { agentName: null, agentVerusId: null, modelProvider: null, modelName: null, jobId: null };
```

In `connect()`, add socket listener after the existing event registrations (after line 62):
```typescript
this.socket.on('chat:message', (data: ChatMessage) => {
  this.onChatMsg?.(data);
});
```

Also in `connect()`, modify the `workspace:status_changed` handler to capture agent metadata:
```typescript
this.socket.on('workspace:status_changed', (data: any) => {
  // Capture agent metadata from initial connect
  if (data.agentName !== undefined) {
    this.agentMeta = {
      agentName: data.agentName ?? null,
      agentVerusId: data.agentVerusId ?? null,
      modelProvider: data.modelProvider ?? null,
      modelName: data.modelName ?? null,
      jobId: data.jobId ?? null,
    };
  }
  this.onStatusChanged?.(data.status, data);
});
```

Add send method (after existing send methods around line 88):
```typescript
sendChatMessage(content: string): void {
  this.socket?.emit('chat:message', { content });
}
```

Add handler registration (after existing registrations around line 93):
```typescript
onChatMessageReceived(handler: (msg: ChatMessage) => void): void {
  this.onChatMsg = handler;
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/bigbox/code/j41-connect
git add src/types.ts src/relay-client.ts
git commit -m "feat: chat message types + relay-client chat support"
```

---

### Task 5: Create chat.ts module

**Files:**
- Create: `/home/bigbox/code/j41-connect/src/chat.ts`

- [ ] **Step 1: Create the chat display + history + theming module**

```typescript
// /home/bigbox/code/j41-connect/src/chat.ts
import chalk from 'chalk';
import type { ChatMessage, AgentMeta } from './types.js';

// ── Model-Adaptive Theming ─────────────────────────────────

interface Theme {
  prefix: string;
  color: (s: string) => string;
}

const THEMES: Record<string, Theme> = {
  anthropic: { prefix: 'claude', color: chalk.hex('#E87B35') },
  openai:    { prefix: 'gpt',    color: chalk.green },
  google:    { prefix: 'gemini', color: chalk.blue },
  xai:       { prefix: 'grok',   color: chalk.white },
  mistral:   { prefix: 'mistral', color: chalk.hex('#FF7000') },
  deepseek:  { prefix: 'deepseek', color: chalk.cyan },
  moonshot:  { prefix: 'kimi',   color: chalk.hex('#6366f1') },
  meta:      { prefix: 'llama',  color: chalk.hex('#0084FF') },
};

const DEFAULT_THEME: Theme = { prefix: 'agent', color: chalk.hex('#818cf8') };
const BUYER_COLOR = chalk.hex('#34d399');

function getAgentTheme(meta: AgentMeta): Theme {
  if (meta.modelProvider) {
    const key = meta.modelProvider.toLowerCase();
    if (THEMES[key]) return THEMES[key];
  }
  return DEFAULT_THEME;
}

// ── Display ────────────────────────────────────────────────

export function formatChatMessage(
  msg: ChatMessage,
  buyerVerusId: string,
  meta: AgentMeta,
): string {
  const isBuyer = msg.senderVerusId === buyerVerusId;
  const theme = getAgentTheme(meta);

  let prefix: string;
  if (isBuyer) {
    prefix = BUYER_COLOR('you ›');
  } else {
    prefix = theme.color(`${theme.prefix} ›`);
  }

  let line = `${prefix} ${msg.content}`;

  // Safety warning
  if (msg.safetyWarning && msg.safetyDetail) {
    const flags = msg.safetyDetail.flags.join(', ');
    line = `${chalk.yellow('⚠')} ${prefix} ${chalk.dim(`[${flags}]`)} ${msg.content}`;
  }

  return line;
}

export function printChatHistory(
  messages: ChatMessage[],
  buyerVerusId: string,
  meta: AgentMeta,
): void {
  if (messages.length === 0) return;

  console.log(chalk.dim('─── chat history ─────────────────────────────────'));
  for (const msg of messages) {
    console.log(formatChatMessage(msg, buyerVerusId, meta));
  }
  console.log(chalk.dim('─── live ─────────────────────────────────────────'));
}

export function printChatLine(
  msg: ChatMessage,
  buyerVerusId: string,
  meta: AgentMeta,
): void {
  console.log(formatChatMessage(msg, buyerVerusId, meta));
}

// ── History Fetch ──────────────────────────────────────────

export async function fetchChatHistory(
  apiUrl: string,
  jobId: string,
  sessionToken: string,
): Promise<ChatMessage[]> {
  try {
    const url = `${apiUrl}/v1/jobs/${jobId}/messages?limit=15`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!res.ok) return [];
    const body = await res.json() as any;
    const messages: ChatMessage[] = (body.data || []).map((m: any) => ({
      id: m.id,
      senderVerusId: m.senderVerusId || m.sender_verus_id,
      content: m.content,
      safetyScore: m.safetyScore ?? m.safety_score ?? null,
      safetyWarning: (m.safetyScore ?? m.safety_score ?? 0) >= 0.4,
      safetyDetail: m.safetyDetail || null,
      createdAt: m.createdAt || m.created_at,
    }));
    // API returns DESC, we want oldest first
    return messages.reverse();
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/bigbox/code/j41-connect
git add src/chat.ts
git commit -m "feat: chat display, history fetch, model-adaptive theming"
```

---

### Task 6: Modify supervisor, feed, and cli for chat input

**Files:**
- Modify: `/home/bigbox/code/j41-connect/src/supervisor.ts`
- Modify: `/home/bigbox/code/j41-connect/src/feed.ts`
- Modify: `/home/bigbox/code/j41-connect/src/cli.ts`

- [ ] **Step 1: Modify supervisor.ts for /command prefix + chat routing**

In `supervisor.ts`, add a chat handler property (around line 19):
```typescript
private chatHandler: ((msg: string) => void) | null = null;
```

Add a registration method (after `onCommand` around line 69):
```typescript
onChat(handler: (msg: string) => void): void {
  this.chatHandler = handler;
}
```

Modify the line handler (lines 33-64). The current logic:
1. Checks for `abort` (any state)
2. If `APPROVAL_PENDING`, checks for `y`/`n`
3. If `IDLE`, checks for `pause`/`resume`/`accept`

Change it to:
1. Check for `abort` → becomes `/abort`
2. If `APPROVAL_PENDING`, check for `y`/`n` (unchanged)
3. If line starts with `/`, extract command name, route to commandHandler
4. Otherwise, route to chatHandler

```typescript
// Replace the line handler (lines 33-64) with:
this.rl.on('line', (raw: string) => {
  const line = raw.trim();
  if (!line) return; // ignore empty

  // Approval mode: Y/N only (plus /abort)
  if (this.state === 'APPROVAL_PENDING') {
    const lower = line.toLowerCase();
    if (lower === '/abort') {
      this.commandHandler?.('abort');
      return;
    }
    if (lower === 'y' || lower === 'yes') {
      this.pendingResolve?.(true);
      this.state = 'IDLE';
      return;
    }
    if (lower === 'n' || lower === 'no') {
      this.pendingResolve?.(false);
      this.state = 'IDLE';
      return;
    }
    // Ignore other input during approval
    return;
  }

  // Command: starts with /
  if (line.startsWith('/')) {
    const cmd = line.slice(1).toLowerCase().trim();
    if (['abort', 'pause', 'resume', 'accept'].includes(cmd)) {
      this.commandHandler?.(cmd);
    } else {
      console.log(chalk.dim(`Unknown command: ${line}. Available: /accept /abort /pause /resume`));
    }
    return;
  }

  // Default: chat message
  this.chatHandler?.(line);
});
```

Add chalk import at the top if not already present:
```typescript
import chalk from 'chalk';
```

- [ ] **Step 2: Also update the standard mode readline in cli.ts**

In `cli.ts`, the standard mode (non-supervised) has its own readline around lines 527-539. Update it similarly:

```typescript
// Replace standard mode readline handler (lines 527-539):
stdModeRl = createRL({ input: process.stdin, terminal: false });
stdModeRl.on('line', (raw: string) => {
  const line = raw.trim();
  if (!line) return;

  if (line.startsWith('/')) {
    const cmd = line.slice(1).toLowerCase().trim();
    switch (cmd) {
      case 'pause': relay.sendPause(); feed.logStatus('Pausing...'); break;
      case 'resume': relay.sendResume(); feed.logStatus('Resuming...'); break;
      case 'accept': relay.sendAccept(); feed.logStatus('Accepting...'); break;
      case 'abort': relay.sendAbort(); feed.logStatus('Aborting...'); break;
      default: console.log(chalk.dim(`Unknown command: ${line}. Available: /accept /abort /pause /resume`));
    }
    return;
  }

  // Default: chat message
  relay.sendChatMessage(line);
});
```

- [ ] **Step 3: Wire chat into cli.ts main loop**

In `cli.ts`, after relay connection and event registration (around line 330), add:

```typescript
// Import at top of cli.ts:
import { fetchChatHistory, printChatHistory, printChatLine } from './chat.js';

// After relay.connect() succeeds and status_changed fires (around line 340):

// Fetch and display chat history
if (relay.agentMeta.jobId) {
  const history = await fetchChatHistory(
    config.apiUrl,
    relay.agentMeta.jobId,
    auth.uid || '',  // use the workspace UID as token context
  );
  printChatHistory(history, config.buyerVerusId || '', relay.agentMeta);
}

// Register incoming chat message handler
relay.onChatMessageReceived((msg) => {
  // Don't echo back our own messages
  if (msg.senderVerusId === config.buyerVerusId) return;
  printChatLine(msg, config.buyerVerusId || '', relay.agentMeta);
});

// Wire supervisor chat handler (supervised mode)
if (supervisor) {
  supervisor.onChat((text) => {
    relay.sendChatMessage(text);
    // Echo our own message locally
    printChatLine({
      id: '',
      senderVerusId: config.buyerVerusId || '',
      content: text,
      safetyScore: null,
      safetyWarning: false,
      createdAt: new Date().toISOString(),
    }, config.buyerVerusId || '', relay.agentMeta);
  });
}
```

Note: `config.buyerVerusId` may need to be derived from the auth context. Check what's available in the `config` object — if the buyer's verusId isn't there, it can be parsed from the workspace session or passed as a CLI argument. If not available, use an empty string and the "you ›" prefix still works (it just won't match incoming messages to suppress echo).

- [ ] **Step 4: Add chat prompt indicator**

In `feed.ts`, add a method to show the chat-ready prompt:

```typescript
logChatReady(): void {
  console.log(chalk.dim('Chat enabled. Type to message agent. Commands: /accept /abort /pause /resume'));
}
```

Call this from cli.ts after chat wiring is complete.

- [ ] **Step 5: Build and verify**

Run: `cd /home/bigbox/code/j41-connect && yarn build`
Expected: TypeScript compiles without errors.

- [ ] **Step 6: Commit**

```bash
cd /home/bigbox/code/j41-connect
git add src/supervisor.ts src/cli.ts src/feed.ts
git commit -m "feat: terminal chat input with /command prefix and chat routing"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Build and deploy backend**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
```

- [ ] **Step 2: Build j41-connect**

```bash
cd /home/bigbox/code/j41-connect && yarn build
```

- [ ] **Step 3: Test end-to-end**

1. Create a job via dashboard, get workspace UID
2. Launch j41-connect with the UID
3. Verify chat history appears (if messages exist)
4. Verify agent metadata shows correct model theming
5. Type a message in terminal → verify it appears in dashboard chat
6. Send message from dashboard → verify it appears in terminal
7. Type `/pause` → verify workspace pauses
8. Type `/resume` → verify workspace resumes
9. In supervised mode, verify Y/N approval still works for writes
10. Type `/accept` → verify session completes

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: terminal chat adjustments from e2e testing"
```

---

## Critical Files Summary

**Backend (junction41):**
| File | Action | Purpose |
|------|--------|---------|
| `src/chat/chat-pipeline.ts` | CREATE | Shared safety pipeline (sanitize, scan, store, circuit breaker) |
| `src/chat/ws-server.ts` | MODIFY | Refactor to use chat-pipeline |
| `src/chat/workspace-relay.ts` | MODIFY | Add chat:message events + agent metadata on connect |

**j41-connect:**
| File | Action | Purpose |
|------|--------|---------|
| `src/chat.ts` | CREATE | Display formatting, history fetch, model theming |
| `src/types.ts` | MODIFY | ChatMessage + AgentMeta interfaces |
| `src/relay-client.ts` | MODIFY | Chat send/receive + agent meta capture |
| `src/supervisor.ts` | MODIFY | /command prefix, chat-as-default input |
| `src/cli.ts` | MODIFY | Wire chat into main loop |
| `src/feed.ts` | MODIFY | Chat-ready status message |
