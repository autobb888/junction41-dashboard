# j41-connect Terminal Chat + Model-Adaptive Theming

## Goal

Add real-time chat to j41-connect so buyers can talk to agents directly in the terminal without switching to the browser dashboard. Messages and file operations interleave in one chronological stream. Prompt prefix and colors adapt to the agent's model provider.

## Architecture

Chat piggybacks on the existing `/workspace` Socket.IO namespace — no second WebSocket connection. A shared chat pipeline extracted from ws-server.ts ensures identical safety guarantees (SovGuard scanning, sanitization, rate limiting, hold queue, circuit breaker) for both dashboard and CLI chat paths. Agent metadata (name, model provider, model name) is sent to the buyer on workspace connect for theming.

## Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Auth | Piggyback on workspace relay | One socket, shared auth, no second connection |
| Layout | Inline interleaved | Ops + chat in one stream, simplest terminal approach |
| Input | `/` prefix for commands | Chat is default, commands are rare (`/accept`, `/abort`, `/pause`, `/resume`) |
| Model info | Backend sends on connect | Added to `workspace:status_changed` payload, zero extra API calls |
| Source distinction | Transparent | Agent sees same message regardless of source |
| Chat history | Last 15 messages on connect | REST fetch, displayed above live stream with divider |
| Dual input | Both work simultaneously | No disabling, simplest for launch |

## Backend Changes

### New: `src/chat/chat-pipeline.ts`

Extract message processing from ws-server.ts into shared module:

```typescript
interface ProcessedMessage {
  id: string;
  content: string;
  safetyScore: number | null;
  safetyWarning: boolean;
  safetyDetail?: { classification: string; flags: string[] };
  held: boolean;
}

async function processChatMessage(params: {
  jobId: string;
  senderVerusId: string;
  content: string;
  signed?: boolean;
  signature?: string;
}): Promise<ProcessedMessage | { blocked: true; reason: string }>
```

Pipeline steps (identical to current ws-server.ts):
1. Sanitize (control chars, zero-width, bidi overrides)
2. Inbound SovGuard scan (block if > 0.8, warn if >= 0.4)
3. Multi-turn session scoring (crescendo detection)
4. Store in `job_messages` table
5. Output scan for agent→buyer messages (hold if >= 0.6)
6. Circuit breaker check (20+ msgs in 60s from 2 senders = pause)

### Modified: `src/chat/ws-server.ts`

Refactor to call `processChatMessage()` instead of inline logic. Behavior unchanged.

### Modified: `src/chat/workspace-relay.ts`

New events on `/workspace` namespace:

- `chat:message` (buyer→server): `{ content: string }`
- `chat:message` (server→room): `{ id, senderVerusId, content, safetyScore, safetyWarning, safetyDetail?, createdAt }`

Rate limit: 30 messages/min per socket.

Agent metadata added to buyer connect response:

```typescript
{
  agentName: string;
  agentVerusId: string;
  modelProvider: string | null;
  modelName: string | null;
}
```

Looked up from agents table + data policy on connect. One query.

## j41-connect Changes

### New: `src/chat.ts` (~120 lines)

**History fetch:**
- `GET /v1/jobs/:id/messages?limit=15` on connect
- Displayed oldest-first with `─── chat history ───` divider
- Silent failure (chat still works for new messages)

**Display:**
```
─── chat history ───────────────────────────────
agent › I've read the codebase. Starting refactor.
you › focus on the utils module first
─── live ───────────────────────────────────────
14:32:01  READ   src/utils.ts                  ✓
agent › Found 3 functions to consolidate.
14:32:05  WRITE  src/utils.ts       4.2KB      ✓
agent › Done. Want me to add tests?
you › yes, vitest
```

Safety warnings inline: `⚠ agent › [flagged] message content`

**Model-adaptive theming:**

| Provider | Prefix | Color |
|----------|--------|-------|
| anthropic | `claude ›` | orange (#E87B35) |
| openai | `gpt ›` | green |
| google | `gemini ›` | blue |
| xai | `grok ›` | white |
| mistral | `mistral ›` | #FF7000 |
| deepseek | `deepseek ›` | cyan |
| default | `agent ›` | indigo (#818cf8) |

Buyer prompt always: `you ›` in green (#34d399).

### Modified: `src/supervisor.ts`

- Default input mode: chat (text sent as `chat:message`)
- Commands prefixed with `/`: `/accept`, `/abort`, `/pause`, `/resume`
- Write approval `Y/N` unchanged (state machine `APPROVAL_PENDING` pauses chat input)
- Empty input ignored

### Modified: `src/relay-client.ts`

- `sendChatMessage(content: string)` — emits `chat:message`
- `onChatMessage(handler)` — listens for incoming `chat:message`
- `agentMeta` property from connect response

### Modified: `src/cli.ts`

- Wire chat module into main loop
- Fetch history after relay connect
- Display incoming chat messages via feed

## Out of Scope (Deferred)

- Split pane with scan status bar (v2)
- Multi-agent cluster UX (v2)
- Dashboard chat disabling when CLI connected (post-launch)
- Typing indicators / read receipts (not useful in CLI)
- Rich markdown rendering in terminal
- Source tagging (cli vs dashboard)

## Verification

1. Start job, launch j41-connect — chat history appears from dashboard
2. Type message in terminal — appears in dashboard chat
3. Type in dashboard — appears in terminal feed inline with ops
4. Agent model theming: correct prefix + color for provider
5. `/accept`, `/abort`, `/pause`, `/resume` commands work
6. Write approval `Y/N` works during APPROVAL_PENDING
7. SovGuard block (score > 0.8) — error shown in terminal
8. Safety warning (score >= 0.4) — `⚠` shown inline
9. Existing j41-connect functionality unbroken (pre-scan, MCP forwarding, supervised mode)
