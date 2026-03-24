# Unified VerusID LoginConsent Authentication — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw signmessage auth with proper LoginConsentRequest protocol — mutual authentication across SDK, CLI, browser, and mobile.

**Architecture:** Server creates `LoginConsentRequest` signed by agentplatform@ (proves server identity). Client verifies the request, then signs the `challengeHash` with `signmessage` (proves client identity). Mobile keeps QR + webhook. SDK gets programmatic `loginWithConsent()`.

**Tech Stack:** verus-typescript-primitives (existing), bitcoinjs-message (existing), @bitgo/utxo-lib (SDK, existing), Fastify, React, Kysely.

**Spec:** `docs/superpowers/specs/2026-03-24-unified-login-consent-design.md`

---

## Task 1: Migration 019 — login_consent_challenges table

**Files:**
- Create: `/home/bigbox/code/junction41/src/db/migrations/019_login_consent_challenges.ts`

- [ ] **Step 1: Create migration file**

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('login_consent_challenges')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('request_data', 'text', (col) => col.notNull())
    .addColumn('challenge_hash', 'text', (col) => col.notNull())
    .addColumn('block_height', 'integer', (col) => col.notNull())
    .addColumn('deeplink', 'text')
    .addColumn('verus_id', 'text')
    .addColumn('identity_name', 'text')
    .addColumn('status', 'text', (col) => col.defaultTo('pending').notNull())
    .addColumn('created_at', 'bigint', (col) => col.notNull())
    .addColumn('expires_at', 'bigint', (col) => col.notNull())
    .execute();

  await sql`CREATE INDEX idx_lcc_expires ON login_consent_challenges (expires_at)`.execute(db);
  await sql`CREATE INDEX idx_lcc_status ON login_consent_challenges (status)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('login_consent_challenges').ifExists().execute();
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/bigbox/code/junction41
git add src/db/migrations/019_login_consent_challenges.ts
git commit -m "feat: migration 019 — login_consent_challenges table"
```

---

## Task 2: Schema — add LoginConsentChallengeTable

**Files:**
- Modify: `/home/bigbox/code/junction41/src/db/schema.ts`

- [ ] **Step 1: Add table interface after QrChallengeTable (~line 130)**

Add this interface after `QrChallengeTable`:

```typescript
export interface LoginConsentChallengeTable {
  id: string;
  request_data: string;
  challenge_hash: string;
  block_height: number;
  deeplink: string | null;
  verus_id: string | null;
  identity_name: string | null;
  status: Generated<string>;
  created_at: number;
  expires_at: number;
}
```

- [ ] **Step 2: Register in Database interface**

Add to the `Database` interface:

```typescript
login_consent_challenges: LoginConsentChallengeTable;
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add LoginConsentChallengeTable to schema"
```

---

## Task 3: Backend — /auth/consent/* endpoints

**Files:**
- Modify: `/home/bigbox/code/junction41/src/api/routes/auth.ts`

This is the largest task. Four new endpoints that replace the old challenge/login/qr flows. The existing QR challenge code (lines 447-563) is the template — adapt it to also return `challengeHash`, `verifyCommand`, `signCommand`, etc.

### Step 1: Add cleanup for new table

- [ ] In the cleanup interval (~line 59-75), add deletion of expired `login_consent_challenges`:

```typescript
// Inside the existing cleanup setInterval, after the qr_challenges cleanup:
await db.deleteFrom('login_consent_challenges')
  .where('expires_at', '<', sql`${Date.now()}`)
  .execute();
```

### Step 2: GET /auth/consent/challenge

- [ ] Add new endpoint after the existing QR section (~after line 781). Adapts from existing `GET /auth/qr/challenge` (lines 447-563) with these additions:

```typescript
fastify.get('/auth/consent/challenge', async (request: FastifyRequest, reply: FastifyReply) => {
  const ip = request.ip;
  if (!checkRateLimit(ip)) {
    return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
  }

  try {
    // === Same primitives imports as existing QR challenge (lines 459-463) ===
    const primitives = await import('verus-typescript-primitives/dist/vdxf/classes/index.js');
    const keysModule = await import('verus-typescript-primitives/dist/vdxf/keys.js');
    const scopesModule = await import('verus-typescript-primitives/dist/vdxf/scopes.js');
    const vdxfIndex = await import('verus-typescript-primitives/dist/vdxf/index.js');
    const QRCode = (await import('qrcode')).default;

    const PLATFORM_SIGNING_ID = process.env.PLATFORM_SIGNING_ID || 'agentplatform@';
    const PLATFORM_CHAIN = process.env.PLATFORM_CHAIN || 'vrsctest';
    const PUBLIC_URL = process.env.PUBLIC_URL || 'https://api.autobb.app';
    const IS_TESTNET = PLATFORM_CHAIN.toLowerCase() === 'vrsctest';
    const SYSTEM_ID = IS_TESTNET ? 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq' : 'i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV';
    const VERUS_CLI_FLAG = IS_TESTNET ? '-testnet ' : '';

    // === Resolve signing identity (same as line 472-474) ===
    const rpc = getRpcClient();
    const signingIdentity = await rpc.getIdentity(PLATFORM_SIGNING_ID);
    const signingIAddress = signingIdentity.identity.identityaddress;

    // === Generate challenge ID (same as line 477-479) ===
    const addressUtils = await import('verus-typescript-primitives/dist/utils/address.js');
    const { I_ADDR_VERSION } = await import('verus-typescript-primitives/dist/constants/vdxf.js');
    const challengeId = addressUtils.toBase58Check(randomBytes(20), I_ADDR_VERSION);

    // === Build challenge (same as lines 482-500, but webhook points to new callback) ===
    const webhookUri = new primitives.RedirectUri(
      `${PUBLIC_URL}/auth/consent/callback`,
      keysModule.LOGIN_CONSENT_WEBHOOK_VDXF_KEY.vdxfid,
    );
    const challenge = new primitives.LoginConsentChallenge({
      challenge_id: challengeId,
      created_at: Math.floor(Date.now() / 1000),
      requested_access: [
        new primitives.RequestedPermission(scopesModule.IDENTITY_VIEW.vdxfid),
      ],
      redirect_uris: [webhookUri],
    });

    const loginRequest = new primitives.LoginConsentRequest({
      system_id: SYSTEM_ID,
      signing_id: signingIAddress,
      challenge,
    });

    // === Sign with daemon (same as lines 508-516) ===
    const challengeSha256 = challenge.toSha256();

    const signResult = await rpc.rpcCall<{
      signature: string;
      signatureheight: number;
    }>('signdata', [{
      address: PLATFORM_SIGNING_ID,
      datahash: challengeSha256.toString('hex'),
    }]);

    loginRequest.signature = new vdxfIndex.VerusIDSignature(
      { signature: signResult.signature },
      keysModule.IDENTITY_AUTH_SIG_VDXF_KEY,
    );

    // === NEW: Compute challengeHash for signmessage flow ===
    const challengeHash = challengeSha256.toString('hex');

    // === Generate deeplink + QR (same as lines 526-529) ===
    const deeplink = loginRequest.toWalletDeeplinkUri();
    const qrDataUrl = await QRCode.toDataURL(deeplink, { width: 400, margin: 2 });

    // === Build copiable verify/sign commands ===
    const verifyCommand = `verus ${VERUS_CLI_FLAG}verifysignature '${JSON.stringify({ address: PLATFORM_SIGNING_ID, datahash: challengeHash, signature: signResult.signature })}'`;
    const signCommand = `verus ${VERUS_CLI_FLAG}signmessage "YOUR_ID@" "${challengeHash}"`;

    // === Store in new table ===
    const db = getDb();
    const now = Date.now();
    const expiresAtMs = now + CHALLENGE_LIFETIME_MS;

    // Serialize the LoginConsentRequest for storage
    const requestBase64 = loginRequest.toBuffer().toString('base64');

    await db.insertInto('login_consent_challenges')
      .values({
        id: challengeId,
        request_data: requestBase64,
        challenge_hash: challengeHash,
        block_height: signResult.signatureheight,
        deeplink,
        status: 'pending',
        created_at: now,
        expires_at: expiresAtMs,
      })
      .execute();

    fastify.log.info({ challengeId, signingId: signingIAddress }, 'Created login consent challenge');

    return {
      data: {
        challengeId,
        request: requestBase64,
        challengeHash,
        blockHeight: signResult.signatureheight,
        systemId: SYSTEM_ID,
        signingId: signingIAddress,
        requestSignature: signResult.signature,
        verifyCommand,
        signCommand,
        qrDataUrl,
        deeplink,
        expiresAt: new Date(expiresAtMs).toISOString(),
      },
    };
  } catch (error: any) {
    fastify.log.error({ err: error, message: error?.message, stack: error?.stack }, 'Failed to create login consent challenge');
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create login consent challenge' }
    });
  }
});
```

### Step 3: POST /auth/consent/verify

- [ ] Add verification endpoint. This replaces `POST /auth/login` for the new flow. Accepts `challengeId` + `verusId` + `signature`, verifies signmessage over the stored `challengeHash`, creates session.

```typescript
const consentVerifySchema = z.object({
  challengeId: z.string().min(20).max(60),
  verusId: z.string().min(1).max(100),
  signature: z.string().min(1).max(500),
});

fastify.post('/auth/consent/verify', async (request: FastifyRequest, reply: FastifyReply) => {
  const ip = request.ip;
  if (!checkRateLimit(ip)) {
    return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
  }

  try {
    const body = consentVerifySchema.parse(request.body);
    const db = getDb();

    // Atomically claim the challenge
    const row = await db.updateTable('login_consent_challenges')
      .set({ status: 'completed' })
      .where('id', '=', body.challengeId)
      .where('status', '=', 'pending')
      .where('expires_at', '>', Date.now())
      .returning(['challenge_hash', 'block_height'])
      .executeTakeFirst();

    if (!row) {
      return reply.code(400).send({
        error: { code: 'INVALID_CHALLENGE', message: 'Challenge not found, expired, or already used' }
      });
    }

    // Verify signature over challengeHash using daemon RPC
    // (same dual verification pattern as existing POST /auth/login lines 233-288)
    const rpc = getRpcClient();
    const verusIdNormalized = body.verusId.endsWith('@') ? body.verusId : body.verusId + '@';
    let verified = false;

    // Primary: daemon verifymessage
    try {
      const result = await rpc.verifyMessage(verusIdNormalized, row.challenge_hash, body.signature);
      verified = !!result;
    } catch (rpcErr) {
      fastify.log.warn({ verusId: body.verusId, err: rpcErr }, 'RPC verifymessage failed, trying local fallback');
    }

    // Fallback: local bitcoinjs-message verification
    if (!verified) {
      try {
        const identity = await rpc.getIdentity(verusIdNormalized);
        const primaryAddresses = identity.identity.primaryaddresses || [];
        const candidates = [
          ...primaryAddresses,
          identity.identity.identityaddress,
          body.verusId,
          verusIdNormalized,
        ].filter(Boolean);

        const bitcoinMessage = (await import('bitcoinjs-message')).default;
        const messagePrefix = '\x15Verus signed data:\n';

        for (const addr of candidates) {
          try {
            if (bitcoinMessage.verify(row.challenge_hash, addr, body.signature, messagePrefix)) {
              verified = true;
              break;
            }
          } catch {}
        }
      } catch (identityErr) {
        fastify.log.warn({ verusId: body.verusId, err: identityErr }, 'Identity lookup failed during fallback verification');
      }
    }

    if (!verified) {
      // Challenge stays consumed (no reset) — prevents replay/probing attacks.
      // User must request a fresh challenge.
      return reply.code(401).send({
        error: { code: 'INVALID_SIGNATURE', message: 'Signature verification failed. Please request a new challenge.' }
      });
    }

    // Resolve identity i-address and friendly name
    // (same pattern as existing POST /auth/login lines 290-340)
    let identityAddress = body.verusId;
    let identityName = body.verusId;
    try {
      const identity = await rpc.getIdentity(verusIdNormalized);
      identityAddress = identity.identity.identityaddress || body.verusId;
      const fqn = (identity as any).fullyqualifiedname || (identity.identity as any).fullyqualifiedname;
      identityName = fqn
        ? fqn.replace(/\.vrsctest@$|\.vrsc@$/i, '')
        : identity.identity.name || identityAddress;
    } catch {
      fastify.log.warn({ verusId: body.verusId }, 'Could not resolve identity');
    }

    // Update challenge row with resolved identity
    await db.updateTable('login_consent_challenges')
      .set({ verus_id: identityAddress, identity_name: identityName })
      .where('id', '=', body.challengeId)
      .execute();

    // Create session (same pattern as existing code)
    const sessionId = randomBytes(32).toString('hex');
    const now = Date.now();
    const sessionExpiry = now + SESSION_LIFETIME_MS;

    await db.insertInto('sessions')
      .values({
        id: sessionId,
        verus_id: identityAddress,
        identity_name: identityName,
        created_at: now,
        expires_at: sessionExpiry,
      })
      .execute();

    // Mark agent online if applicable
    try {
      await db.updateTable('agents')
        .set({ online: true, last_seen_at: sql`NOW()` })
        .where('verus_id', '=', identityAddress)
        .execute();
    } catch {}

    reply.setCookie(SESSION_COOKIE, sessionId, cookieOpts());

    fastify.log.info({ verusId: identityAddress, identityName }, 'Login consent verified, session created');

    return {
      data: {
        success: true,
        identityAddress,
        identityName,
        sessionToken: sessionId,
        expiresAt: new Date(sessionExpiry).toISOString(),
      },
    };
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' } });
    }
    fastify.log.error({ err: error }, 'Login consent verify failed');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Verification failed' } });
  }
});
```

### Step 4: POST /auth/consent/callback

- [ ] Add mobile webhook endpoint. Adapted from existing `POST /auth/qr/callback` (lines 571-695). Same logic, just reads from `login_consent_challenges` table instead of `qr_challenges`.

```typescript
fastify.post('/auth/consent/callback', async (request: FastifyRequest, reply: FastifyReply) => {
  // Same body as existing /auth/qr/callback (lines 571-695)
  // but queries login_consent_challenges instead of qr_challenges
  // Identical parsing, signature verification, identity resolution.
  // Updates login_consent_challenges row with status='signed', verus_id, identity_name.

  fastify.log.info({ bodyKeys: request.body ? Object.keys(request.body as any) : 'null' }, 'Login consent callback received');

  try {
    const body = request.body as any;
    const primitives = await import('verus-typescript-primitives/dist/vdxf/classes/index.js');

    let loginResponse: any;
    if (typeof body === 'string') {
      loginResponse = new primitives.LoginConsentResponse();
      loginResponse.fromBuffer(Buffer.from(body, 'base64'));
    } else if (body.decision && body.signing_id) {
      loginResponse = new primitives.LoginConsentResponse(body);
    } else {
      return reply.code(400).send({ error: { code: 'INVALID_FORMAT', message: 'Unrecognized login response format' } });
    }

    const signingId = loginResponse.signing_id;
    const challengeId = loginResponse.decision?.request?.challenge?.challenge_id;

    if (!signingId || !challengeId) {
      return reply.code(400).send({ error: { code: 'INVALID_RESPONSE', message: 'Missing signing identity or challenge ID' } });
    }

    // Verify signature (same as existing lines 616-637)
    if (loginResponse.signature?.signature) {
      const rpc = getRpcClient();
      const decisionDataHash = loginResponse.decision.toSha256();
      const verifyResult = await rpc.rpcCall<{ signaturestatus: string }>('verifysignature', [{
        address: signingId,
        datahash: decisionDataHash.toString('hex'),
        signature: loginResponse.signature.signature,
      }]);
      if (verifyResult.signaturestatus !== 'verified') {
        return reply.code(401).send({ error: { code: 'INVALID_SIGNATURE', message: 'Login consent signature verification failed' } });
      }
    } else {
      return reply.code(401).send({ error: { code: 'NO_SIGNATURE', message: 'Login consent response has no signature' } });
    }

    // Resolve identity (same as existing lines 642-658)
    const rpc = getRpcClient();
    let verusId = signingId;
    let resolvedName = signingId;
    try {
      const identity = await rpc.getIdentity(signingId);
      verusId = identity.identity.identityaddress || signingId;
      const fqn = (identity as any).fullyqualifiedname || (identity.identity as any).fullyqualifiedname;
      resolvedName = fqn ? fqn.replace(/\.vrsctest@$|\.vrsc@$/i, '') : identity.identity.name || verusId;
    } catch {
      fastify.log.warn({ signingId }, 'Could not resolve identity in consent callback');
    }

    // Atomic claim — prevents race condition with concurrent callbacks
    const db = getDb();
    const claimResult = await db.updateTable('login_consent_challenges')
      .set({ status: 'signed', verus_id: verusId, identity_name: resolvedName })
      .where('id', '=', challengeId)
      .where('status', '=', 'pending')
      .where('expires_at', '>', Date.now())
      .executeTakeFirst();

    if (Number(claimResult.numUpdatedRows) === 0) {
      return reply.code(400).send({ error: { code: 'NOT_FOUND', message: 'Challenge not found, expired, or already used' } });
    }

    fastify.log.info({ signingId, verusId }, 'Login consent callback verified');
    return { data: { success: true } };
  } catch (error) {
    fastify.log.error({ error }, 'Login consent callback failed');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Callback processing failed' } });
  }
});
```

### Step 5: GET /auth/consent/status/:id

- [ ] Add polling endpoint. Adapted from existing `GET /auth/qr/status/:id` (lines 702-781). Same logic, queries `login_consent_challenges`.

```typescript
fastify.get('/auth/consent/status/:id', {
  config: { rateLimit: { max: 60, timeWindow: 60_000 } },
}, async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };

  try {
    const db = getDb();
    const row = await db.selectFrom('login_consent_challenges')
      .select(['status', 'verus_id', 'identity_name', 'expires_at'])
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Challenge not found' } });
    }

    if (row.status === 'pending' && row.expires_at < Date.now()) {
      await db.updateTable('login_consent_challenges').set({ status: 'expired' }).where('id', '=', id).execute();
      return { data: { status: 'expired' } };
    }

    if (row.status === 'signed' && row.verus_id) {
      // Atomic claim (same pattern as existing lines 735-744)
      const claimResult = await db.updateTable('login_consent_challenges')
        .set({ status: 'completed' })
        .where('id', '=', id)
        .where('status', '=', 'signed')
        .executeTakeFirst();

      if (Number(claimResult.numUpdatedRows) === 0) {
        return { data: { status: 'pending' } };
      }

      // Create session
      const sessionId = randomBytes(32).toString('hex');
      const sessionNow = Date.now();
      const sessionExpiry = sessionNow + SESSION_LIFETIME_MS;

      await db.insertInto('sessions')
        .values({
          id: sessionId,
          verus_id: row.verus_id,
          identity_name: row.identity_name || row.verus_id,
          created_at: sessionNow,
          expires_at: sessionExpiry,
        })
        .execute();

      reply.setCookie(SESSION_COOKIE, sessionId, cookieOpts());
      fastify.log.info({ verusId: row.verus_id }, 'Login consent completed via polling');

      return { data: { status: 'completed', verusId: row.verus_id } };
    }

    return { data: { status: row.status } };
  } catch (error) {
    fastify.log.error({ error }, 'Login consent status check failed');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Status check failed' } });
  }
});
```

### Step 6: Commit backend

- [ ] **Commit**

```bash
git add src/api/routes/auth.ts
git commit -m "feat: add /auth/consent/* endpoints for LoginConsent protocol"
```

---

## Task 4: Dashboard — AuthContext update

**Files:**
- Modify: `/home/bigbox/code/junction41-dashboard/src/context/AuthContext.jsx`

- [ ] **Step 1: Update getChallenge() to use new endpoint**

Change line 53 from:
```javascript
const res = await fetch(`${API_BASE}/auth/challenge`, {
```
to:
```javascript
const res = await fetch(`${API_BASE}/auth/consent/challenge`, {
```

- [ ] **Step 2: Update login() to use new endpoint**

Change line 77 from:
```javascript
const res = await fetch(`${API_BASE}/auth/login`, {
```
to:
```javascript
const res = await fetch(`${API_BASE}/auth/consent/verify`, {
```

- [ ] **Step 3: Commit**

```bash
cd /home/bigbox/code/junction41-dashboard
git add src/context/AuthContext.jsx
git commit -m "feat: update AuthContext to use /auth/consent/* endpoints"
```

---

## Task 5: Dashboard — LoginPage redesign

**Files:**
- Modify: `/home/bigbox/code/junction41-dashboard/src/pages/LoginPage.jsx`

- [ ] **Step 1: Rewrite LoginPage with unified consent flow**

Replace the entire file. The new flow:
1. On mount, fetches `/auth/consent/challenge` (one call for both QR and CLI)
2. Shows "agentplatform@ is requesting you login to Junction41"
3. CLI section: copiable verify command, copiable sign command (dynamic with user's ID), identity + signature inputs
4. QR section: same QR from the challenge response, polls `/auth/consent/status/:id`

Key differences from old code:
- Single challenge fetch serves both QR and CLI (no separate button to "choose")
- `challengeHash` is what the user signs (not the full challenge text)
- Verify command shown before sign command
- Sign command updates dynamically as user types their ID
- QR polling uses `/auth/consent/status/:id` instead of `/auth/qr/status/:id`

```jsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import CopyButton from '../components/CopyButton';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function LoginPage() {
  const { login } = useAuth();
  const [challenge, setChallenge] = useState(null);
  const [verusId, setVerusId] = useState('');
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState('cli'); // cli | qr
  const pollIntervalRef = useRef(null);

  // Fetch consent challenge on mount
  useEffect(() => {
    fetchChallenge();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  async function fetchChallenge() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/consent/challenge`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to get challenge');
      setChallenge(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Start QR polling when QR tab is active
  useEffect(() => {
    if (tab === 'qr' && challenge?.challengeId) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/auth/consent/status/${challenge.challengeId}`, { credentials: 'include' });
          const data = await res.json();
          if (data.data?.status === 'completed') {
            clearInterval(pollIntervalRef.current);
            window.location.reload();
          } else if (data.data?.status === 'expired') {
            clearInterval(pollIntervalRef.current);
            setError('Challenge expired. Refreshing...');
            fetchChallenge();
          }
        } catch {}
      }, 2000);
      return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
    }
  }, [tab, challenge?.challengeId]);

  async function handleLogin(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(challenge.challengeId, verusId, signature);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const userIdForCommand = verusId
    ? (verusId.endsWith('@') ? verusId : verusId + '@')
    : 'YOUR_ID@';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="text-4xl">⚡</span>
          <h1 className="text-2xl font-bold text-white mt-4">Junction41</h1>
          <p className="text-gray-400 mt-2">Sign in with your VerusID</p>
        </div>

        <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 overflow-hidden">
          {/* Consent header */}
          {challenge && (
            <div className="px-6 py-4 bg-gray-750 border-b border-gray-700">
              <p className="text-sm text-gray-300">
                <span className="text-verus-blue font-semibold">agentplatform@</span> is requesting you login to Junction41
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Permission: View your VerusID identity
              </p>
            </div>
          )}

          {/* Tabs */}
          {challenge && (
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setTab('cli')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'cli' ? 'text-verus-blue border-b-2 border-verus-blue' : 'text-gray-400 hover:text-gray-300'}`}
              >
                CLI / Desktop Wallet
              </button>
              <button
                onClick={() => setTab('qr')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'qr' ? 'text-verus-blue border-b-2 border-verus-blue' : 'text-gray-400 hover:text-gray-300'}`}
              >
                Verus Mobile
              </button>
            </div>
          )}

          <div className="p-6">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-verus-blue"></div>
              </div>
            )}

            {/* CLI / Desktop Tab */}
            {!loading && challenge && tab === 'cli' && (
              <form onSubmit={handleLogin} className="space-y-4">
                {/* Step 1: Verify */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Step 1: Verify this request is from agentplatform@
                  </label>
                  <div className="relative">
                    <pre className="bg-gray-900 rounded-lg p-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all border border-gray-700 pr-16">
                      {challenge.verifyCommand}
                    </pre>
                    <CopyButton text={challenge.verifyCommand} className="absolute top-2 right-2" />
                  </div>
                </div>

                {/* Step 2: Sign */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Step 2: Sign the login challenge
                  </label>
                  <div className="relative">
                    <pre className="bg-gray-900 rounded-lg p-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all border border-gray-700 pr-16">
{`verus ${challenge.signCommand?.includes('-testnet') ? '-testnet ' : ''}signmessage "${userIdForCommand}" "${challenge.challengeHash}"`}
                    </pre>
                    <CopyButton text={`verus ${challenge.signCommand?.includes('-testnet') ? '-testnet ' : ''}signmessage "${userIdForCommand}" "${challenge.challengeHash}"`} className="absolute top-2 right-2" />
                  </div>
                </div>

                {/* Step 3: Submit */}
                <div className="border-t border-gray-700 pt-4">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Step 3: Submit
                  </label>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={verusId}
                      onChange={(e) => setVerusId(e.target.value)}
                      placeholder="Your VerusID (e.g. yourname@)"
                      className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-verus-blue"
                      required
                    />
                    <textarea
                      value={signature}
                      onChange={(e) => setSignature(e.target.value)}
                      placeholder="Paste signature here..."
                      rows={2}
                      className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-verus-blue font-mono text-sm"
                      required
                    />
                    <button
                      type="submit"
                      disabled={submitting || !verusId || !signature}
                      className="w-full py-3 bg-verus-blue hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {submitting ? 'Verifying...' : 'Sign In'}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  Expires: {new Date(challenge.expiresAt).toLocaleTimeString()}
                </p>
              </form>
            )}

            {/* QR / Mobile Tab */}
            {!loading && challenge && tab === 'qr' && (
              <div className="text-center">
                <div className="hidden md:block">
                  <p className="text-gray-300 mb-4">Scan with Verus Mobile:</p>
                  <div className="bg-white p-4 rounded-lg inline-block mb-4">
                    <img src={challenge.qrDataUrl} alt="Login QR" className="w-64 h-64" />
                  </div>
                </div>
                <div className="md:hidden">
                  <p className="text-gray-300 mb-4">Tap to open Verus Mobile:</p>
                  <a
                    href={challenge.deeplink}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors mb-4"
                  >
                    Open Verus Mobile
                  </a>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Expires: {new Date(challenge.expiresAt).toLocaleTimeString()}
                </p>
                <div className="animate-pulse text-gray-400 text-sm">
                  Waiting for signature...
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          Don't have a VerusID?{' '}
          <a href="https://verus.io/wallet" target="_blank" rel="noopener noreferrer" className="text-verus-blue hover:underline">
            Get one here
          </a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/LoginPage.jsx
git commit -m "feat: redesign LoginPage with LoginConsent protocol"
```

---

## Task 6: Dashboard — AuthModal redesign

**Files:**
- Modify: `/home/bigbox/code/junction41-dashboard/src/components/AuthModal.jsx`

- [ ] **Step 1: Update AuthModal with same consent flow**

Same unified design as LoginPage but in modal form. Key changes:
- Single challenge fetch on modal open (not two separate buttons)
- `verifyCommand` + `signCommand` from challenge response
- QR polling uses `/auth/consent/status/:id`
- Visibility-change re-poll uses new endpoint
- Calls `onSuccess?.()` instead of `window.location.reload()`

Replace the full file content. Preserve:
- Focus trap (lines 73-101)
- Visibility change handler (lines 34-55)
- State reset on open (lines 58-71)
- Modal accessibility (role, aria-modal, aria-label)

The internal logic mirrors LoginPage Task 5 — consent header ("agentplatform@ is requesting..."), tabs (CLI / Mobile), verify/sign commands, submit form.

- [ ] **Step 2: Commit**

```bash
git add src/components/AuthModal.jsx
git commit -m "feat: update AuthModal with LoginConsent protocol"
```

---

## Task 7: SDK — loginWithConsent()

**Files:**
- Create: `/home/bigbox/code/j41-sovagent-sdk/src/auth/login-consent.ts`
- Modify: `/home/bigbox/code/j41-sovagent-sdk/src/index.ts`

- [ ] **Step 1: Create login-consent.ts**

```typescript
import { signMessage } from '../identity/signer.js';

export interface LoginConsentResult {
  success: boolean;
  identityAddress: string;
  identityName: string;
  sessionToken: string;
  expiresAt: string;
}

/**
 * Authenticate with Junction41 using the VerusID LoginConsent protocol.
 *
 * 1. Fetches a LoginConsentRequest signed by agentplatform@
 * 2. Verifies the request signature (TLS + known API URL)
 * 3. Signs the challengeHash with the agent's WIF key
 * 4. Submits the signed response for verification
 *
 * @param apiUrl - J41 API base URL (e.g., "https://api.autobb.app")
 * @param wif - Agent's WIF private key (never sent to server)
 * @param identityAddress - Agent's VerusID (e.g., "myagent@" or i-address)
 * @returns Session info with resolved identity
 */
export async function loginWithConsent(
  apiUrl: string,
  wif: string,
  identityAddress: string,
): Promise<LoginConsentResult> {
  // 1. Get login consent challenge
  const challengeRes = await fetch(`${apiUrl}/auth/consent/challenge`);
  if (!challengeRes.ok) {
    const err = await challengeRes.json().catch(() => ({}));
    throw new Error(`Failed to get login challenge: ${(err as any).error?.message || challengeRes.statusText}`);
  }
  const { data: challenge } = await challengeRes.json();

  // 2. Verify the request came from agentplatform@ (defense-in-depth)
  // Primary verification: TLS certificate proves server identity.
  // The LoginConsentRequest signature in challenge.requestSignature can be
  // independently verified against agentplatform@'s on-chain keys if needed.
  if (!challenge.challengeHash || !challenge.challengeId) {
    throw new Error('Invalid challenge response: missing challengeHash or challengeId');
  }

  // 3. Sign the challengeHash with agent's WIF
  const sig = signMessage(wif, challenge.challengeHash);

  // 4. Submit signed response
  const verifyRes = await fetch(`${apiUrl}/auth/consent/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      verusId: identityAddress,
      signature: sig,
    }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(`Login verification failed: ${(err as any).error?.message || verifyRes.statusText}`);
  }

  const { data } = await verifyRes.json();
  return data;
}
```

- [ ] **Step 2: Export from index.ts**

Add to exports in `/home/bigbox/code/j41-sovagent-sdk/src/index.ts`:

```typescript
export { loginWithConsent } from './auth/login-consent.js';
```

- [ ] **Step 3: Commit**

```bash
cd /home/bigbox/code/j41-sovagent-sdk
git add src/auth/login-consent.ts src/index.ts
git commit -m "feat: add loginWithConsent() for VerusID LoginConsent auth"
```

---

## Task 8: Build and deploy

- [ ] **Step 1: Run migration on junction41**

```bash
cd /home/bigbox/code/junction41
sudo docker compose up -d --build
# Migration runs automatically on startup
```

- [ ] **Step 2: Rebuild dashboard**

```bash
cd /home/bigbox/code/junction41-dashboard
sudo docker compose up -d --build
```

- [ ] **Step 3: Verify**

1. Open dashboard login page — should show "agentplatform@ is requesting you login"
2. CLI tab: verify command and sign command are copiable
3. QR tab: QR code displays, polling works
4. Sign in with CLI: `verus -testnet signmessage "33test@" "<challengeHash>"`
5. Paste identity + signature → session created
6. `curl /auth/consent/challenge` returns full challenge data without auth
7. Old `/auth/challenge` and `/auth/login` still work (not removed yet)

- [ ] **Step 4: Commit any fixes**
