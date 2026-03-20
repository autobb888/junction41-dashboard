# Comprehensive Endpoint Gaps Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-03-21
**Scope:** All endpoint gaps identified in the analysis across backend, SDK, and MCP server
**Order:** Tasks 1-4 (critical), 5-7 (nice-to-have), 8-9 (coverage), 10 (docs), 11 (build)

---

## Architecture Reference

| Layer | Repo | Path | Language |
|-------|------|------|----------|
| Backend | junction41 | `/home/bigbox/code/junction41` | TypeScript / Fastify / Kysely / PostgreSQL |
| SDK | j41-sovagent-sdk | `/home/bigbox/code/j41-sovagent-sdk` | TypeScript |
| MCP Server | j41-sovagent-mcp-server | `/home/bigbox/code/j41-sovagent-mcp-server` | TypeScript |

**Deploy:** Everything via Docker (`sudo docker compose up -d --build`). Never run npm/node on host.
**Package manager:** yarn (never npm).

---

## Task 1: Balance Endpoint (CRITICAL)

**Why:** Agents need to check their on-chain balance before posting bounties, accepting jobs, or making payments. Currently requires raw RPC knowledge.

### Backend: `GET /v1/me/balance`

File: `/home/bigbox/code/junction41/src/api/routes/balance.ts` (new file)

- [ ] Create `src/api/routes/balance.ts` with the following structure:

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getRpcClient } from '../../indexer/rpc-client.js';
import { getSessionFromRequest } from './auth.js';
import { logger } from '../../utils/logger.js';

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  (request as any).session = session;
}

export async function balanceRoutes(fastify: FastifyInstance): Promise<void> {
  const rpc = getRpcClient();

  // GET /v1/me/balance — currency balances for authenticated identity
  fastify.get('/v1/me/balance', {
    preHandler: requireAuth,
    config: {
      rateLimit: { max: 30, timeWindow: 60_000 },
    },
  }, async (request, reply) => {
    const session = (request as any).session;

    try {
      const rawBalances = await rpc.rpcCall<Record<string, number>>(
        'getcurrencybalance', [session.verusId]
      );

      // getcurrencybalance returns { "currencyname": amount } or array format
      // Normalize to array of { currency, amount }
      let balances: Array<{ currency: string; amount: number }>;

      if (Array.isArray(rawBalances)) {
        balances = rawBalances.map((b: any) => ({
          currency: b.currencyid || b.currency || 'unknown',
          amount: b.amount ?? 0,
        }));
      } else if (rawBalances && typeof rawBalances === 'object') {
        balances = Object.entries(rawBalances).map(([currency, amount]) => ({
          currency,
          amount: typeof amount === 'number' ? amount : 0,
        }));
      } else {
        balances = [];
      }

      return reply.send({
        data: {
          verusId: session.verusId,
          balances,
        },
      });
    } catch (error: any) {
      logger.error({ err: error, verusId: session.verusId }, 'getcurrencybalance error');
      return reply.code(502).send({
        error: { code: 'RPC_ERROR', message: 'Failed to fetch balance from chain' },
      });
    }
  });
}
```

- [ ] Register in `src/api/server.ts`:
  - Add import: `import { balanceRoutes } from './routes/balance.js';`
  - Add registration: `await fastify.register(balanceRoutes);` (after `workspaceRoutes`)

### SDK: `getBalance()` method

File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`

- [ ] Add method to `J41Client` class (in the Transaction endpoints section, after `getTxStatus`):

```typescript
/** Get currency balances for authenticated identity */
async getBalance(): Promise<BalanceResponse> {
  const res = await this.request<{ data: BalanceResponse }>('GET', '/v1/me/balance');
  return res.data;
}
```

- [ ] Add type definition (in the Types section, after `TxStatus`):

```typescript
export interface CurrencyBalance {
  currency: string;
  amount: number;
}

export interface BalanceResponse {
  verusId: string;
  balances: CurrencyBalance[];
}
```

### MCP: `j41_get_balance` tool

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/payments.ts`

- [ ] Add tool to `registerPaymentTools` function (after `j41_get_payment_qr`):

```typescript
server.tool(
  'j41_get_balance',
  'Get currency balances for the authenticated agent.',
  {},
  async () => {
    try {
      requireState(AgentState.Authenticated);
      const agent = getAgent();
      const result = await agent.client.getBalance();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

**Commit:** `feat: add GET /v1/me/balance endpoint with SDK and MCP support`

---

## Task 2: Payment Address Endpoint (CRITICAL)

**Why:** Buyers need to know where to send payment before creating a transaction. Currently they have to call `getidentity` RPC directly.

### Backend: `GET /v1/agents/:verusId/payment-address`

File: `/home/bigbox/code/junction41/src/api/routes/agents.ts`

- [ ] Add route to `agentRoutes` function (after the `/v1/agents/:id/capabilities` route):

```typescript
// Get agent payment address (public)
fastify.get('/v1/agents/:verusId/payment-address', {
  config: { rateLimit: { max: 30, timeWindow: 60_000 } },
}, async (request, reply) => {
  const { verusId } = request.params as { verusId: string };

  if (!verusId || verusId.length > 100) {
    return reply.code(400).send({
      error: { code: 'INVALID_PARAMS', message: 'verusId is required' },
    });
  }

  try {
    const rpc = getRpcClient();
    const identity = await rpc.getIdentity(verusId);

    if (!identity?.identity) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Identity not found on chain' },
      });
    }

    const primaryAddress = identity.identity.primaryaddresses?.[0] || null;
    const iAddress = identity.identity.identityaddress || null;

    if (!primaryAddress && !iAddress) {
      return reply.code(404).send({
        error: { code: 'NO_ADDRESS', message: 'No payment address found for this identity' },
      });
    }

    return reply.send({
      data: {
        address: primaryAddress,
        iAddress,
        verusId,
      },
    });
  } catch (error: any) {
    request.log.error({ err: error, verusId }, 'getidentity error for payment address');
    return reply.code(502).send({
      error: { code: 'RPC_ERROR', message: 'Failed to resolve payment address from chain' },
    });
  }
});
```

- [ ] Ensure `getRpcClient` is already imported (it is in agents.ts)

### SDK: `getAgentPaymentAddress(verusId)` method

File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`

- [ ] Add method (in Agent/Service endpoints section, after `registerAgent`):

```typescript
/** Get payment address for an agent (public, no auth required) */
async getAgentPaymentAddress(verusId: string): Promise<PaymentAddressResponse> {
  const res = await this.request<{ data: PaymentAddressResponse }>('GET', `/v1/agents/${encodeURIComponent(verusId)}/payment-address`);
  return res.data;
}
```

- [ ] Add type (in Types section):

```typescript
export interface PaymentAddressResponse {
  address: string | null;
  iAddress: string | null;
  verusId: string;
}
```

### MCP: `j41_get_payment_address` tool

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/discovery.ts`

- [ ] Add tool (after `j41_get_public_stats`):

```typescript
server.tool(
  'j41_get_payment_address',
  'Get the payment address for an agent (public, no auth required).',
  {
    verusId: z.string().min(1).describe('Agent VerusID (e.g. "agentname@")'),
  },
  async ({ verusId }) => {
    try {
      const result = await apiRequest<{ data: unknown }>(
        'GET',
        `/v1/agents/${encodeURIComponent(verusId)}/payment-address`,
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

**Commit:** `feat: add GET /v1/agents/:verusId/payment-address with SDK and MCP`

---

## Task 3: Verify Payment Endpoint (CRITICAL)

**Why:** After a buyer sends a payment, the seller/agent needs to verify the TX actually sent the right amount to the right address. Currently requires raw RPC calls.

### Backend: `GET /v1/tx/verify-payment`

File: `/home/bigbox/code/junction41/src/api/routes/transactions.ts`

- [ ] Add route to `transactionRoutes` function (after the `/v1/tx/status/:txid` route):

```typescript
// ------------------------------------------
// GET /v1/tx/verify-payment
// Verifies a transaction sent the expected amount to the expected address.
// ------------------------------------------
fastify.get('/v1/tx/verify-payment', {
  preHandler: requireAuth,
  config: {
    rateLimit: { max: 30, timeWindow: 60_000 },
  },
}, async (request, reply) => {
  const query = request.query as {
    txid?: string;
    expectedAddress?: string;
    expectedAmount?: string;
    expectedCurrency?: string;
  };

  if (!query.txid || !TXID_REGEX.test(query.txid)) {
    return reply.code(400).send({
      error: { code: 'INVALID_TXID', message: 'txid must be a 64-character hex string' },
    });
  }
  if (!query.expectedAddress) {
    return reply.code(400).send({
      error: { code: 'MISSING_PARAM', message: 'expectedAddress is required' },
    });
  }
  if (!query.expectedAmount || !Number.isFinite(parseFloat(query.expectedAmount)) || parseFloat(query.expectedAmount) <= 0) {
    return reply.code(400).send({
      error: { code: 'INVALID_AMOUNT', message: 'expectedAmount must be a positive number' },
    });
  }

  const expectedAmount = parseFloat(query.expectedAmount);
  const expectedCurrency = query.expectedCurrency || 'VRSCTEST';

  try {
    const tx = await rpc.rpcCall<{
      txid: string;
      confirmations?: number;
      vout?: Array<{ value: number; valueSat?: number; scriptPubKey: { addresses?: string[] } }>;
    }>('getrawtransaction', [query.txid, 1]);

    // Sum outputs going to expectedAddress
    let actualAmount = 0;
    let toAddress: string | null = null;

    for (const vout of tx.vout || []) {
      const addresses = vout.scriptPubKey?.addresses || [];
      if (addresses.includes(query.expectedAddress)) {
        actualAmount += vout.value || 0;
        toAddress = query.expectedAddress;
      }
    }

    // Verify within 0.01% tolerance (floating point)
    const tolerance = expectedAmount * 0.0001;
    const verified = toAddress !== null && Math.abs(actualAmount - expectedAmount) <= tolerance;

    return reply.send({
      data: {
        verified,
        actualAmount,
        expectedAmount,
        confirmations: tx.confirmations || 0,
        toAddress,
        txid: query.txid,
        currency: expectedCurrency,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('No information available')) {
      return reply.code(404).send({
        error: { code: 'TX_NOT_FOUND', message: 'Transaction not found' },
      });
    }

    logger.error({ err: error, txid: query.txid }, 'verify-payment error');
    return reply.code(502).send({
      error: { code: 'RPC_ERROR', message: 'Failed to verify payment on chain' },
    });
  }
});
```

### SDK: `verifyPayment()` method

File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`

- [ ] Add method (in Transaction endpoints section, after `getBalance`):

```typescript
/** Verify a payment transaction matches expected address and amount */
async verifyPayment(txid: string, expectedAddress: string, expectedAmount: number, currency?: string): Promise<PaymentVerification> {
  const query = new URLSearchParams({
    txid,
    expectedAddress,
    expectedAmount: String(expectedAmount),
  });
  if (currency) query.set('expectedCurrency', currency);
  const res = await this.request<{ data: PaymentVerification }>('GET', `/v1/tx/verify-payment?${query}`);
  return res.data;
}
```

- [ ] Add type:

```typescript
export interface PaymentVerification {
  verified: boolean;
  actualAmount: number;
  expectedAmount: number;
  confirmations: number;
  toAddress: string | null;
  txid: string;
  currency: string;
}
```

### MCP: `j41_verify_payment` tool

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/payments.ts`

- [ ] Add tool (after `j41_get_balance`):

```typescript
server.tool(
  'j41_verify_payment',
  'Verify a payment transaction sent the expected amount to the expected address.',
  {
    txid: z.string().regex(/^[0-9a-fA-F]{64}$/).describe('Transaction ID (64-char hex)'),
    expectedAddress: z.string().min(1).describe('Expected recipient address'),
    expectedAmount: z.number().positive().describe('Expected payment amount'),
    currency: z.string().optional().describe('Currency (default: VRSCTEST)'),
  },
  async ({ txid, expectedAddress, expectedAmount, currency }) => {
    try {
      requireState(AgentState.Authenticated);
      const agent = getAgent();
      const result = await agent.client.verifyPayment(txid, expectedAddress, expectedAmount, currency);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

**Commit:** `feat: add GET /v1/tx/verify-payment endpoint with SDK and MCP`

---

## Task 4: Supported Currencies Endpoint (CRITICAL)

**Why:** Agents and buyers need to know which currencies the platform supports for pricing and payments.

### Backend: `GET /v1/currencies`

File: `/home/bigbox/code/junction41/src/api/routes/currencies.ts` (new file)

- [ ] Create `src/api/routes/currencies.ts`:

```typescript
import { FastifyInstance } from 'fastify';

// Supported currencies with their system IDs on Verus
const SUPPORTED_CURRENCIES = [
  { id: 'VRSCTEST', name: 'Verus Testnet', systemId: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq', network: 'testnet', decimals: 8 },
  { id: 'VRSC', name: 'Verus', systemId: 'i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV', network: 'mainnet', decimals: 8 },
  { id: 'tBTC.vETH', name: 'Test Bitcoin (bridged)', systemId: '', network: 'testnet', decimals: 8 },
  { id: 'vETH', name: 'Verus Bridged ETH', systemId: '', network: 'mainnet', decimals: 18 },
  { id: 'Bridge.vETH', name: 'Bridge.vETH', systemId: '', network: 'mainnet', decimals: 8 },
  { id: 'DAI.vETH', name: 'DAI (bridged)', systemId: '', network: 'mainnet', decimals: 18 },
  { id: 'MKR.vETH', name: 'MKR (bridged)', systemId: '', network: 'mainnet', decimals: 18 },
];

export async function currencyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/currencies', {
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
  }, async (_request, reply) => {
    return reply.send({
      data: SUPPORTED_CURRENCIES,
      meta: { count: SUPPORTED_CURRENCIES.length },
    });
  });
}
```

- [ ] Register in `src/api/server.ts`:
  - Add import: `import { currencyRoutes } from './routes/currencies.js';`
  - Add registration: `await fastify.register(currencyRoutes);`

### SDK: `getCurrencies()` method

File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`

- [ ] Add method (in Transaction endpoints section):

```typescript
/** Get supported currencies (public, no auth required) */
async getCurrencies(): Promise<SupportedCurrency[]> {
  const res = await this.request<{ data: SupportedCurrency[] }>('GET', '/v1/currencies');
  return res.data;
}
```

- [ ] Add type:

```typescript
export interface SupportedCurrency {
  id: string;
  name: string;
  systemId: string;
  network: 'testnet' | 'mainnet';
  decimals: number;
}
```

### MCP: `j41_get_currencies` tool

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/discovery.ts`

- [ ] Add tool (after `j41_get_payment_address`):

```typescript
server.tool(
  'j41_get_currencies',
  'Get list of supported currencies on the platform. Public, no auth required.',
  {},
  async () => {
    try {
      const result = await apiRequest<{ data: unknown }>(
        'GET',
        '/v1/currencies',
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

**Commit:** `feat: add GET /v1/currencies endpoint with SDK and MCP`

---

## Task 5: Agent Earnings Summary (NICE-TO-HAVE)

**Why:** Agents want a dashboard view of their earnings across all completed jobs.

### Backend: `GET /v1/me/earnings`

File: `/home/bigbox/code/junction41/src/api/routes/jobs.ts` (add to existing file)

- [ ] Add route to `jobRoutes` function (at the end, before closing brace):

```typescript
// ------------------------------------------
// GET /v1/me/earnings
// Earnings summary for authenticated agent
// ------------------------------------------
fastify.get('/v1/me/earnings', {
  preHandler: requireAuth,
  config: { rateLimit: { max: 30, timeWindow: 60_000 } },
}, async (request, reply) => {
  const session = (request as any).session;

  try {
    const db = getDb();

    // Get completed jobs as seller
    const completed = await db.selectFrom('jobs')
      .select([
        sql<number>`COUNT(*)::int`.as('count'),
        'currency',
        sql<number>`COALESCE(SUM(amount), 0)`.as('total'),
      ])
      .where('seller_verus_id', '=', session.verusId)
      .where('status', '=', 'completed')
      .groupBy('currency')
      .execute();

    // Get pending jobs as seller
    const pending = await db.selectFrom('jobs')
      .select(sql<number>`COUNT(*)::int`.as('count'))
      .where('seller_verus_id', '=', session.verusId)
      .where('status', 'in', ['requested', 'accepted', 'in_progress', 'delivered'])
      .executeTakeFirstOrThrow();

    const totalEarned: Record<string, number> = {};
    let completedJobs = 0;
    let totalAmount = 0;

    for (const row of completed) {
      totalEarned[row.currency] = Number(row.total);
      completedJobs += row.count;
      totalAmount += Number(row.total);
    }

    const avgJobValue = completedJobs > 0 ? totalAmount / completedJobs : 0;

    return reply.send({
      data: {
        totalEarned,
        pendingJobs: pending.count,
        completedJobs,
        avgJobValue: Math.round(avgJobValue * 100) / 100,
      },
    });
  } catch (error: any) {
    request.log.error({ err: error }, 'earnings query error');
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to compute earnings' },
    });
  }
});
```

- [ ] Ensure `sql` from `kysely` and `getDb` are already imported (they are in jobs.ts)

### SDK: `getMyEarnings()` method

File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`

- [ ] Add method (after `getMyJobs`):

```typescript
/** Get earnings summary for authenticated agent */
async getMyEarnings(): Promise<EarningsSummary> {
  const res = await this.request<{ data: EarningsSummary }>('GET', '/v1/me/earnings');
  return res.data;
}
```

- [ ] Add type:

```typescript
export interface EarningsSummary {
  totalEarned: Record<string, number>;
  pendingJobs: number;
  completedJobs: number;
  avgJobValue: number;
}
```

### MCP: `j41_get_earnings` tool

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/jobs.ts`

- [ ] Add tool (after the last existing tool in the file):

```typescript
server.tool(
  'j41_get_earnings',
  'Get earnings summary for the authenticated agent (total earned, pending jobs, average job value).',
  {},
  async () => {
    try {
      requireState(AgentState.Authenticated);
      const agent = getAgent();
      const result = await agent.client.getMyEarnings();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

**Commit:** `feat: add GET /v1/me/earnings endpoint with SDK and MCP`

---

## Task 6: Check Name Availability (NICE-TO-HAVE)

**Why:** Before onboarding, agents want to know if their desired name is available on the agentplatform namespace.

### Backend: `GET /v1/agents/check-name/:name`

File: `/home/bigbox/code/junction41/src/api/routes/agents.ts`

- [ ] Add route to `agentRoutes` function (before the `/v1/agents/:id` route to avoid route conflict):

```typescript
// Check if agent name is available on chain
fastify.get('/v1/agents/check-name/:name', {
  config: { rateLimit: { max: 30, timeWindow: 60_000 } },
}, async (request, reply) => {
  const { name } = request.params as { name: string };

  if (!name || name.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    return reply.code(400).send({
      error: { code: 'INVALID_NAME', message: 'Name must be 1-64 alphanumeric characters (plus _ and -)' },
    });
  }

  const fullName = name.includes('@') ? name : `${name}.agentplatform@`;

  try {
    const rpc = getRpcClient();
    const identity = await rpc.getIdentity(fullName);

    if (identity?.identity) {
      return reply.send({
        data: {
          available: false,
          name: fullName,
          existingId: identity.identity.identityaddress || null,
        },
      });
    }

    return reply.send({
      data: {
        available: true,
        name: fullName,
      },
    });
  } catch (error: any) {
    // getidentity throws when identity doesn't exist — that means available
    if (error.message?.includes('Identity not found') || error.message?.includes('identity not found')) {
      return reply.send({
        data: {
          available: true,
          name: fullName,
        },
      });
    }

    request.log.error({ err: error, name }, 'check-name error');
    return reply.code(502).send({
      error: { code: 'RPC_ERROR', message: 'Failed to check name availability' },
    });
  }
});
```

### SDK: `checkAgentName(name)` method

File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`

- [ ] Add method (in Agent/Service endpoints section, after `getAgentPaymentAddress`):

```typescript
/** Check if an agent name is available (public, no auth required) */
async checkAgentName(name: string): Promise<NameAvailability> {
  const res = await this.request<{ data: NameAvailability }>('GET', `/v1/agents/check-name/${encodeURIComponent(name)}`);
  return res.data;
}
```

- [ ] Add type:

```typescript
export interface NameAvailability {
  available: boolean;
  name: string;
  existingId?: string;
}
```

### MCP: `j41_check_name` tool

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/discovery.ts`

- [ ] Add tool (after `j41_get_currencies`):

```typescript
server.tool(
  'j41_check_name',
  'Check if an agent name is available on the platform. Public, no auth required.',
  {
    name: z.string().min(1).max(64).describe('Agent name to check (without @ suffix)'),
  },
  async ({ name }) => {
    try {
      const result = await apiRequest<{ data: unknown }>(
        'GET',
        `/v1/agents/check-name/${encodeURIComponent(name)}`,
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

**Commit:** `feat: add GET /v1/agents/check-name/:name with SDK and MCP`

---

## Task 7: My Bounties Filter (NICE-TO-HAVE)

**Why:** Agents and posters need to see bounties relevant to them without scanning all bounties.

### Backend: `GET /v1/me/bounties`

File: `/home/bigbox/code/junction41/src/api/routes/bounties.ts`

- [ ] Add route to `bountyRoutes` function (after the `GET /v1/bounties/:id` route):

```typescript
// ── GET /v1/me/bounties — bounties where caller is poster or applicant ──
fastify.get('/v1/me/bounties', {
  preHandler: requireAuth,
  config: { rateLimit: { max: 30, timeWindow: 60_000 } },
}, async (request, reply) => {
  const session = (request as any).session;
  const query = request.query as { role?: string; limit?: string; offset?: string };

  const role = query.role; // 'poster' | 'applicant' | undefined (both)
  const limit = Number.isFinite(Number(query.limit)) ? Math.min(Number(query.limit), 100) : 20;
  const offset = Number.isFinite(Number(query.offset)) ? Number(query.offset) : 0;

  const db = getDb();

  try {
    let baseQuery = db.selectFrom('bounties')
      .selectAll();

    if (role === 'poster') {
      baseQuery = baseQuery.where('poster_verus_id', '=', session.verusId);
    } else if (role === 'applicant') {
      baseQuery = baseQuery.where('id', 'in',
        db.selectFrom('bounty_applications')
          .select('bounty_id')
          .where('applicant_verus_id', '=', session.verusId)
      );
    } else {
      // Both: poster OR has application
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb('poster_verus_id', '=', session.verusId),
          eb('id', 'in',
            db.selectFrom('bounty_applications')
              .select('bounty_id')
              .where('applicant_verus_id', '=', session.verusId)
          ),
        ])
      );
    }

    const bounties = await baseQuery
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return reply.send({
      data: bounties,
      meta: {
        total: bounties.length,
        limit,
        offset,
        role: role || 'all',
      },
    });
  } catch (error: any) {
    request.log.error({ err: error }, 'my bounties query error');
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch your bounties' },
    });
  }
});
```

### SDK: `getMyBounties(role?)` method

File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`

- [ ] Add method (after `cancelBounty`):

```typescript
/** Get bounties where caller is poster or applicant (authenticated) */
async getMyBounties(role?: 'poster' | 'applicant'): Promise<{ data: Bounty[]; meta: Record<string, unknown> }> {
  const query = new URLSearchParams();
  if (role) query.set('role', role);
  const qs = query.toString();
  return this.request<{ data: Bounty[]; meta: Record<string, unknown> }>('GET', `/v1/me/bounties${qs ? `?${qs}` : ''}`);
}
```

### MCP: `j41_get_my_bounties` tool

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/bounties.ts`

- [ ] Add tool (after the last existing tool in the file):

```typescript
server.tool(
  'j41_get_my_bounties',
  'Get bounties where the authenticated agent is the poster or an applicant.',
  {
    role: z.enum(['poster', 'applicant']).optional().describe('Filter by role (poster or applicant). Omit for both.'),
  },
  async ({ role }) => {
    try {
      requireState(AgentState.Authenticated);
      const params = new URLSearchParams();
      if (role) params.set('role', role);
      const qs = params.toString();
      const result = await apiRequest<{ data: unknown }>(
        'GET',
        `/v1/me/bounties${qs ? `?${qs}` : ''}`,
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

- [ ] Add import for `apiRequest` if not already present in bounties.ts (check top of file)

**Commit:** `feat: add GET /v1/me/bounties with role filter, SDK and MCP`

---

## Task 8: Missing SDK Methods for Existing Endpoints

**Why:** Several backend endpoints exist but have no SDK wrapper, forcing consumers to make raw HTTP calls.

File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`

### SDK methods to add:

- [ ] `rejectDelivery(jobId, reason)` -- `POST /v1/jobs/:id/reject-delivery`

```typescript
/** Reject a delivery (buyer only, returns job to in_progress) */
async rejectDelivery(jobId: string, reason: string): Promise<Job> {
  const res = await this.request<{ data: Job }>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/reject-delivery`, { reason });
  return res.data;
}
```

- [ ] `recordPaymentCombined(jobId, txid)` -- `POST /v1/jobs/:id/payment-combined`

```typescript
/** Record a combined payment TX (agent + platform fee in one transaction) */
async recordPaymentCombined(jobId: string, txid: string): Promise<{ data: Job; meta: { verificationNote: string } }> {
  return this.request<{ data: Job; meta: { verificationNote: string } }>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/payment-combined`, { txid });
}
```

- [ ] `getFeaturedServices()` -- `GET /v1/services/featured`

```typescript
/** Get featured services (public, no auth required) */
async getFeaturedServices(): Promise<Service[]> {
  const res = await this.request<{ data: Service[] }>('GET', '/v1/services/featured');
  return res.data;
}
```

- [ ] `getTrendingServices()` -- `GET /v1/services/trending`

```typescript
/** Get trending services (public, no auth required) */
async getTrendingServices(): Promise<Service[]> {
  const res = await this.request<{ data: Service[] }>('GET', '/v1/services/trending');
  return res.data;
}
```

- [ ] `getMyIdentity()` -- `GET /v1/me/identity`

```typescript
/** Get decoded on-chain identity for authenticated user */
async getMyIdentity(): Promise<Record<string, unknown>> {
  const res = await this.request<{ data: Record<string, unknown> }>('GET', '/v1/me/identity');
  return res.data;
}
```

- [ ] `retryOnboard(onboardId)` -- `POST /v1/onboard/retry/:id`

```typescript
/** Retry a failed onboarding registration */
async retryOnboard(onboardId: string): Promise<OnboardStatus> {
  return this.request<OnboardStatus>('POST', `/v1/onboard/retry/${encodeURIComponent(onboardId)}`);
}
```

### MCP tools to add for important existing endpoints:

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/payments.ts`

- [ ] `j41_get_tx_status` -- check transaction confirmations

```typescript
server.tool(
  'j41_get_tx_status',
  'Get transaction status and confirmation count.',
  {
    txid: z.string().regex(/^[0-9a-fA-F]{64}$/).describe('Transaction ID (64-char hex)'),
  },
  async ({ txid }) => {
    try {
      requireState(AgentState.Authenticated);
      const agent = getAgent();
      const result = await agent.client.getTxStatus(txid);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/discovery.ts`

- [ ] `j41_get_featured_services` -- trending/featured for discovery

```typescript
server.tool(
  'j41_get_featured_services',
  'Get featured services on the platform (top rated). Public, no auth required.',
  {},
  async () => {
    try {
      const result = await apiRequest<{ data: unknown }>(
        'GET',
        '/v1/services/featured',
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/identity.ts`

- [ ] `j41_get_my_identity` -- decoded on-chain identity

```typescript
server.tool(
  'j41_get_my_identity',
  'Get the authenticated agent\'s decoded on-chain VerusID identity with VDXF labels.',
  {},
  async () => {
    try {
      requireState(AgentState.Authenticated);
      const agent = getAgent();
      const result = await agent.client.getMyIdentity();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

**Commit:** `feat: add missing SDK methods and MCP tools for existing backend endpoints`

---

## Task 9: MCP Tools for Existing SDK Methods Not Yet Exposed

**Why:** Several SDK methods exist but have no MCP tool, meaning LLM agents cannot use them.

### Already exist (skip these):
- `j41_reject_delivery` -- already in `tools/jobs.ts`
- `j41_pay_extension` -- already in `tools/extensions.ts`

### MCP tools to add:

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/payments.ts`

- [ ] `j41_record_payment_combined` -- combined agent+fee payment

```typescript
server.tool(
  'j41_record_payment_combined',
  'Record a combined payment transaction (agent payment + platform fee in a single TX).',
  {
    jobId: z.string().min(1).describe('Job ID'),
    txid: z.string().min(1).describe('Transaction ID for the combined payment'),
  },
  async ({ jobId, txid }) => {
    try {
      requireState(AgentState.Authenticated);
      const agent = getAgent();
      const result = await agent.client.recordPaymentCombined(jobId, txid);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/chat.ts`

- [ ] `j41_get_held_messages` -- view SovGuard-held messages

```typescript
server.tool(
  'j41_get_held_messages',
  'Get messages held by SovGuard for a job (pending moderation review).',
  {
    jobId: z.string().min(1).describe('Job ID'),
  },
  async ({ jobId }) => {
    try {
      requireState(AgentState.Authenticated);
      const agent = getAgent();
      const result = await agent.client.getHeldMessages(jobId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

- [ ] `j41_appeal_held_message` -- appeal a held message

```typescript
server.tool(
  'j41_appeal_held_message',
  'Appeal a SovGuard-held message with a reason.',
  {
    jobId: z.string().min(1).describe('Job ID'),
    messageId: z.string().min(1).describe('Held message ID'),
    reason: z.string().min(1).max(1000).describe('Reason for the appeal'),
  },
  async ({ jobId, messageId, reason }) => {
    try {
      requireState(AgentState.Authenticated);
      const agent = getAgent();
      const result = await agent.client.appealHeldMessage(jobId, messageId, reason);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

- [ ] `j41_release_held_message` -- buyer releases held message

```typescript
server.tool(
  'j41_release_held_message',
  'Release a SovGuard-held message (buyer only — approves the held content).',
  {
    jobId: z.string().min(1).describe('Job ID'),
    messageId: z.string().min(1).describe('Held message ID to release'),
  },
  async ({ jobId, messageId }) => {
    try {
      requireState(AgentState.Authenticated);
      const agent = getAgent();
      const result = await agent.client.releaseHeldMessage(jobId, messageId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

- [ ] `j41_reject_held_message` -- buyer rejects held message

```typescript
server.tool(
  'j41_reject_held_message',
  'Reject a SovGuard-held message (buyer only — permanently blocks the content).',
  {
    jobId: z.string().min(1).describe('Job ID'),
    messageId: z.string().min(1).describe('Held message ID to reject'),
  },
  async ({ jobId, messageId }) => {
    try {
      requireState(AgentState.Authenticated);
      const agent = getAgent();
      const result = await agent.client.rejectHeldMessage(jobId, messageId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

**Commit:** `feat: add MCP tools for existing SDK methods (combined payment, held messages)`

---

## Task 10: Update README and skills.md

**Why:** Documentation must reflect the actual API surface for developers and AI agents.

### Backend README

File: `/home/bigbox/code/junction41/README.md`

- [ ] Add new endpoints to the API reference tables:
  - `GET /v1/me/balance` (auth) -- Get currency balances
  - `GET /v1/agents/:verusId/payment-address` (public) -- Get payment address
  - `GET /v1/tx/verify-payment` (auth) -- Verify payment TX
  - `GET /v1/currencies` (public) -- Supported currencies
  - `GET /v1/me/earnings` (auth) -- Earnings summary
  - `GET /v1/agents/check-name/:name` (public) -- Check name availability
  - `GET /v1/me/bounties` (auth) -- My bounties

- [ ] Document the 19 previously undocumented existing endpoints:
  - `GET /v1/tx/info` (public)
  - `GET /v1/tx/status/:txid` (auth)
  - `GET /v1/services/featured` (public)
  - `GET /v1/services/trending` (public)
  - `GET /v1/me/identity` (auth)
  - `GET /v1/me/identity/raw` (auth)
  - `POST /v1/onboard/retry/:id` (public)
  - `POST /v1/jobs/:id/reject-delivery` (auth)
  - `POST /v1/jobs/:id/payment-combined` (auth)
  - `PATCH /v1/me/agent` (auth)
  - `GET /v1/me/unread-jobs` (auth)
  - `GET /v1/hold-queue/stats` (auth)
  - `POST /v1/jobs/:id/held-messages/:mid/appeal` (auth)
  - `POST /v1/jobs/:id/held-messages/:mid/release` (auth)
  - `POST /v1/jobs/:id/held-messages/:mid/reject` (auth)
  - `GET /v1/me/canary` (auth)
  - `DELETE /v1/me/canary/:id` (auth)
  - `GET /v1/me/communication-policy` (auth)
  - `GET /v1/me/inbox/count` (auth)

### MCP Server README

File: `/home/bigbox/code/j41-sovagent-mcp-server/README.md`

- [ ] Update tool count (add ~10 new tools)
- [ ] Add new tools to the tool list table

### Dashboard skills.md (DevelopersPage)

File: `/home/bigbox/code/junction41-dashboard/src/pages/DevelopersPage.jsx`

- [ ] Update SDK method count
- [ ] Update MCP tool count
- [ ] Add new categories/tools to the skills breakdown if applicable

**Commit:** `docs: update READMEs and skills.md with new endpoint coverage`

---

## Task 11: Build and Verify All 3 Packages

**Why:** All changes must compile and pass health checks before we can consider them deployed.

### Build steps:

- [ ] **Backend build + deploy:**
```bash
cd /home/bigbox/code/junction41
sudo docker compose up -d --build
```

- [ ] **Backend health check:**
```bash
curl -s http://localhost:3000/v1/health | jq .
```

- [ ] **Verify new backend endpoints respond:**
```bash
# Public endpoints (no auth)
curl -s http://localhost:3000/v1/currencies | jq .
curl -s http://localhost:3000/v1/agents/check-name/testname | jq .
curl -s http://localhost:3000/v1/agents/testname.agentplatform@/payment-address | jq .

# Auth endpoints (need session cookie -- test manually or via SDK)
# curl -s -b "verus_session=<token>" http://localhost:3000/v1/me/balance | jq .
# curl -s -b "verus_session=<token>" http://localhost:3000/v1/me/earnings | jq .
```

- [ ] **SDK build:**
```bash
cd /home/bigbox/code/j41-sovagent-sdk
yarn build
```

- [ ] **SDK verify no type errors:**
  - Ensure all new methods have correct return types
  - Ensure all new interfaces are exported

- [ ] **MCP server build:**
```bash
cd /home/bigbox/code/j41-sovagent-mcp-server
yarn build
```

- [ ] **MCP verify no type errors:**
  - Ensure all new tools use correct SDK method signatures
  - Ensure all imports are resolved

**Commit:** (no commit needed -- build verification only)

---

## Summary

| Task | Priority | New Backend Endpoints | New SDK Methods | New MCP Tools |
|------|----------|----------------------|-----------------|---------------|
| 1. Balance | CRITICAL | 1 | 1 | 1 |
| 2. Payment address | CRITICAL | 1 | 1 | 1 |
| 3. Verify payment | CRITICAL | 1 | 1 | 1 |
| 4. Currencies | CRITICAL | 1 | 1 | 1 |
| 5. Earnings | Nice | 1 | 1 | 1 |
| 6. Check name | Nice | 1 | 1 | 1 |
| 7. My bounties | Nice | 1 | 1 | 1 |
| 8. SDK + MCP gaps | Coverage | 0 | 6 | 3 |
| 9. MCP tool gaps | Coverage | 0 | 0 | 5 |
| 10. Docs | Docs | 0 | 0 | 0 |
| 11. Build | Verify | 0 | 0 | 0 |
| **Total** | | **7** | **13** | **15** |

### Files Modified (per repo):

**Backend (`/home/bigbox/code/junction41`):**
- `src/api/routes/balance.ts` (NEW)
- `src/api/routes/currencies.ts` (NEW)
- `src/api/routes/agents.ts` (modified -- 2 new routes)
- `src/api/routes/transactions.ts` (modified -- 1 new route)
- `src/api/routes/jobs.ts` (modified -- 1 new route)
- `src/api/routes/bounties.ts` (modified -- 1 new route)
- `src/api/server.ts` (modified -- 2 new imports + registrations)
- `README.md` (modified)

**SDK (`/home/bigbox/code/j41-sovagent-sdk`):**
- `src/client/index.ts` (modified -- 13 new methods + 5 new interfaces)

**MCP Server (`/home/bigbox/code/j41-sovagent-mcp-server`):**
- `src/tools/payments.ts` (modified -- 4 new tools)
- `src/tools/discovery.ts` (modified -- 4 new tools)
- `src/tools/jobs.ts` (modified -- 1 new tool)
- `src/tools/chat.ts` (modified -- 4 new tools)
- `src/tools/identity.ts` (modified -- 1 new tool)
- `src/tools/bounties.ts` (modified -- 1 new tool)
- `README.md` (modified)
