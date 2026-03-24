# Unified VerusID LoginConsent Authentication

## Problem

Current login has two separate flows:
- **Mobile (QR):** Proper `LoginConsentRequest` protocol — "agentplatform@ is requesting login." Mutual authentication.
- **CLI/GUI/Browser (manual):** Raw `signmessage` over random text. No proof the challenge came from agentplatform@. No mutual authentication. A patch, not a protocol.

SDK has no programmatic login at all.

## Goal

One unified login protocol across all surfaces: **SDK, CLI/GUI, browser, and mobile.** Both sides verify each other. Server proves it's agentplatform@ via signed `LoginConsentRequest`. Client proves their identity via signed response.

## Design

### Protocol Flow

```
                  J41 Server                           Client (SDK / Browser / CLI)
                     |                                          |
  1. Create LoginConsentRequest         GET /auth/consent/challenge
     - challenge_id (nonce)        ─────────────────────────>   |
     - requested_access: [IDENTITY_VIEW]                        |
     - created_at (timestamp)                                   |
     - Sign with agentplatform@ key                             |
       (daemon signdata, includes block height)                 |
     - Compute challengeHash = SHA256(challenge)                |
                     |           <───────────────────────────    |
                     |                                          |
                     |          2. VERIFY agentplatform@ signature
                     |             SDK: programmatic (primitives + RPC/known keys)
                     |             CLI: `verus verifysignature '{"address":"agentplatform@","datahash":"<hash>","signature":"<sig>"}'`
                     |             Browser: shows verify command to copy
                     |                                          |
                     |          3. SIGN the challengeHash
                     |             SDK: signMessage(wif, challengeHash) via bitcoinjs-message
                     |             CLI: `verus signmessage "myid@" "challengeHash"`
                     |             Browser: user pastes identity + signature
                     |                                          |
  4. Verify user's signature       POST /auth/consent/verify    |
     - verifymessage(identity@,   <─────────────────────────    |
       challengeHash, signature)                                |
     - Resolve identity (getIdentity RPC)                       |
     - Create session                                           |
     - Set cookie / return token   ─────────────────────────>   |
```

### What's Different From Old Flow

| Aspect | Old (signmessage) | New (LoginConsent) |
|--------|-------------------|-------------------|
| Challenge | Random text "Junction41...Nonce..." | `LoginConsentRequest` signed by agentplatform@ |
| Mutual auth | None — no proof challenge is genuine | User verifies agentplatform@ signature first |
| Challenge data | Opaque text blob | Structured: permissions, timestamp, nonce, signer ID |
| Signing target | Random text | Deterministic SHA256 hash of verified challenge |
| SDK support | None | `loginWithConsent(apiUrl, wif, identity)` |
| Mobile | Separate QR flow | Same endpoint, QR is just a presentation option |

### What's The Same

- User signs with `signmessage` (CLI/GUI) or `bitcoinjs-message` (SDK) — same ECDSA signature
- Server verifies with daemon `verifymessage` RPC — same verification
- Session management unchanged — same cookie, same expiry, same table

---

## Endpoints

### GET /auth/consent/challenge

Creates a `LoginConsentRequest` signed by agentplatform@. No auth required. Rate limited 30/min per IP.

**Server logic:**
1. Generate `challenge_id` — 20 random bytes → base58check i-address
2. Build `LoginConsentChallenge` (from `verus-typescript-primitives`):
   - `challenge_id`
   - `requested_access: [IDENTITY_VIEW]`
   - `redirect_uris: [{ url: PUBLIC_URL/auth/consent/callback, key: WEBHOOK }]` (for mobile)
   - `created_at: Math.floor(Date.now() / 1000)`
3. Build `LoginConsentRequest { system_id, signing_id: agentplatform@, challenge }`
4. Sign via daemon: `signdata` RPC with agentplatform@'s address (includes block height)
5. Compute `challengeHash` = hex SHA256 of the challenge buffer
6. Store in `login_consent_challenges` table
7. Generate QR data URL from deep link (for mobile)

**Response:**
```json
{
  "challengeId": "iBase58CheckNonce",
  "request": "<base64 serialized LoginConsentRequest>",
  "challengeHash": "a1b2c3d4e5f6...64 hex chars",
  "blockHeight": 123456,
  "systemId": "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq",
  "signingId": "agentplatform@ i-address",
  "requestSignature": "<base64 agentplatform@ signature over request>",
  "verifyCommand": "verus -testnet verifysignature '{\"address\":\"agentplatform@\",\"datahash\":\"<challengeHash>\",\"signature\":\"<sig>\"}'",
  "signCommand": "verus -testnet signmessage \"YOUR_ID@\" \"<challengeHash>\"",
  "qrDataUrl": "data:image/png;base64,...",
  "deeplink": "vrsc://x-callback-url/...",
  "expiresAt": "2026-03-24T12:05:00Z"
}
```

### POST /auth/consent/verify

Verifies a signed response and creates a session. Rate limited 30/min per IP.

**Request body:**
```json
{
  "challengeId": "iBase58CheckNonce",
  "verusId": "myidentity@",
  "signature": "<base64 signature from signmessage>"
}
```

**Server logic:**
1. Look up `login_consent_challenges` row by `challengeId` — must be status `pending` and not expired
2. Atomically set status to `completed` (prevents replay). **No reset on failure** — failed verification consumes the challenge; user must request a new one.
3. Retrieve stored `challengeHash`
4. Verify: `verifymessage(verusId@, challengeHash, signature)` via daemon RPC
5. Fallback: `bitcoinjs-message.verify(challengeHash, address, sig, prefix)` with identity's primary addresses
6. Resolve identity: `getIdentity(verusId@)` → i-address + friendly name
7. Create session in `sessions` table
8. Set `verus_session` cookie (HttpOnly, Secure, SameSite=Lax, signed)
9. Return session token in response body (for SDK consumers who can't use cookies)

**Response:**
```json
{
  "success": true,
  "verusId": "iXYZ...",
  "identityName": "myidentity",
  "sessionToken": "64-char-hex-session-id",
  "expiresAt": "2026-03-24T13:00:00Z"
}
```

Note: `sessionToken` is returned in the body for SDK consumers. Browser consumers use the cookie (set automatically).

### POST /auth/consent/callback (mobile webhook)

Receives `LoginConsentResponse` from Verus Mobile after QR scan. Same logic as existing `/auth/qr/callback`:

1. Parse response (base64 buffer or JSON)
2. Extract signing identity + challenge_id
3. Verify signature via `verifysignature` RPC
4. Resolve identity
5. Update challenge row: status → `signed`, store verus_id + identity_name

### GET /auth/consent/status/:id (mobile polling)

Dashboard polls this when QR is displayed. Same logic as existing `/auth/qr/status/:id`:

1. Check challenge status
2. If `signed`: atomically claim (→ `completed`), create session, set cookie
3. Return `{ status: 'pending' | 'completed' | 'expired' }`

### Unchanged Endpoints

- `GET /auth/session` — session check + auto-extend
- `POST /auth/logout` — clear session + cookie

### Deprecated Endpoints (remove after migration)

- `GET /auth/challenge` — old random text challenge
- `POST /auth/login` — old signmessage verification
- `GET /auth/qr/challenge` — old separate QR flow
- `POST /auth/qr/callback` — old separate QR webhook
- `GET /auth/qr/status/:id` — old separate QR polling

---

## Database

### New Table: login_consent_challenges

Replaces both `auth_challenges` and `qr_challenges`.

```sql
CREATE TABLE login_consent_challenges (
  id TEXT PRIMARY KEY,                -- base58check challenge_id (i-address format)
  request_data TEXT NOT NULL,         -- base64 serialized LoginConsentRequest
  challenge_hash TEXT NOT NULL,       -- hex SHA256 of challenge (what user signs)
  block_height INTEGER NOT NULL,      -- block height used in server signature
  deeplink TEXT,                      -- vrsc:// URI for mobile QR
  verus_id TEXT,                      -- resolved i-address (set on verify)
  identity_name TEXT,                 -- friendly name (set on verify)
  status TEXT NOT NULL DEFAULT 'pending', -- pending|signed|completed|expired
  created_at BIGINT NOT NULL,         -- ms timestamp
  expires_at BIGINT NOT NULL          -- ms timestamp (5 min from creation)
);

CREATE INDEX idx_lcc_expires ON login_consent_challenges (expires_at);
CREATE INDEX idx_lcc_status ON login_consent_challenges (status);
```

### Migration

New migration (next sequential number). Creates new table, does NOT drop old tables yet (they get cleaned up in a later migration after all clients migrate).

---

## SDK Changes

### New: loginWithConsent()

File: `j41-sovagent-sdk/src/auth/login-consent.ts` (new)

```typescript
export async function loginWithConsent(
  apiUrl: string,
  wif: string,
  identityAddress: string
): Promise<{ sessionToken: string; verusId: string; identityName: string }> {
  // 1. GET /auth/consent/challenge
  const challenge = await fetch(`${apiUrl}/auth/consent/challenge`).then(r => r.json());

  // 2. Verify agentplatform@ signature
  //    Deserialize LoginConsentRequest from challenge.request
  //    Verify signature against known agentplatform@ identity
  //    (uses verus-typescript-primitives + verifymessage against a public Verus node,
  //     or against hardcoded agentplatform@ primary addresses)

  // 3. Sign challengeHash with agent's WIF
  const signature = signMessage(wif, challenge.challengeHash);

  // 4. POST /auth/consent/verify
  const result = await fetch(`${apiUrl}/auth/consent/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      verusId: identityAddress,
      signature
    })
  }).then(r => r.json());

  return result;
}
```

Uses existing `signMessage()` from `identity/signer.ts` — already uses bitcoinjs-message with Verus prefix. No new dependencies.

### Verification of agentplatform@ signature

The SDK can verify the request signature two ways:

**Option A (simple):** Trust TLS + known API URL. If the SDK is configured with `https://api.junction41.io`, the TLS certificate proves the server is genuine. The LoginConsentRequest signature is defense-in-depth.

**Option B (full verification):** Deserialize the LoginConsentRequest, extract the signature, and verify against agentplatform@'s known primary addresses. These addresses can be:
- Fetched once from any Verus node: `getIdentity("agentplatform@")`
- Hardcoded in SDK config (updated on key rotation)
- Fetched from J41's own API (circular but practical)

Recommend Option B with fetched addresses (cached). Falls back to Option A if verification infrastructure is unavailable.

---

## Dashboard Changes

### LoginPage.jsx + AuthModal.jsx

Replace current two-tab layout (QR / Manual) with unified consent flow:

**Default view:**
1. Header: "agentplatform@ is requesting you login to Junction41"
2. Subtext: "Permissions requested: View your VerusID identity"
3. Two sections:

**Section 1: Verify & Sign (CLI / Desktop GUI)**
```
Step 1: Verify this request is from agentplatform@
┌──────────────────────────────────────────────────────────────────────┐
│ verus -testnet verifysignature '{"address":"agentplatform@",...}'   │ [Copy]
└──────────────────────────────────────────────────────────────────────┘

Step 2: Sign the login challenge
┌─────────────────────────────────────────────────────┐
│ verus -testnet signmessage "YOUR_ID@" "a1b2c3..."   │ [Copy]
└─────────────────────────────────────────────────────┘

Step 3: Submit
┌──────────────┐  ┌──────────────────────────────────┐
│ Your ID@     │  │ Paste signature here             │
└──────────────┘  └──────────────────────────────────┘
                                          [Login →]
```

**Section 2: Mobile (QR)**
- Same QR code as before, generated from the same challenge
- Polls `/auth/consent/status/:id`
- "Scan with Verus Mobile" label

**Mobile device detection:**
- On mobile browsers: show deep link button instead of QR
- On desktop: show QR + CLI commands

### AuthContext.jsx

Update methods:
- `getChallenge()` → calls `GET /auth/consent/challenge` (was `/auth/challenge`)
- `login()` → calls `POST /auth/consent/verify` (was `/auth/login`)
- Add `challengeHash` to challenge state (new field)
- QR polling → `/auth/consent/status/:id` (was `/auth/qr/status/:id`)

---

## Mobile Flow (unchanged UX)

Mobile users see the same QR / deep link experience. Under the hood:

1. Dashboard calls `GET /auth/consent/challenge` (same endpoint as everyone)
2. Shows QR from `qrDataUrl` field
3. User scans → Verus Mobile opens → consent UI → signs
4. Verus Mobile POSTs to `/auth/consent/callback` webhook
5. Dashboard polls `/auth/consent/status/:id` → detects completion → session created

Same UX, just different endpoint paths.

---

## Security Properties

| Property | How |
|----------|-----|
| **Server authenticity** | LoginConsentRequest signed by agentplatform@ — client verifies before signing |
| **Client authenticity** | signmessage verified by daemon against identity's on-chain keys |
| **Replay prevention** | Challenge atomically claimed on use; 5-minute expiry; no reset on failure |
| **Nonce freshness** | Random 20-byte challenge_id per request |
| **Block height binding** | Server signature includes block height; daemon checks identity keys at that height |
| **Session security** | HttpOnly + Secure + Signed cookies; 1-hour TTL with activity extension |

---

## Files Summary

**Backend (junction41):**
- `src/db/migrations/0XX_login_consent.ts` — NEW: login_consent_challenges table
- `src/db/schema.ts` — MODIFY: add LoginConsentChallengeTable
- `src/api/routes/auth.ts` — MODIFY: add /auth/consent/* endpoints, deprecate old ones

**SDK (j41-sovagent-sdk):**
- `src/auth/login-consent.ts` — NEW: loginWithConsent() method
- `src/index.ts` — MODIFY: export new auth method

**Dashboard (junction41-dashboard):**
- `src/context/AuthContext.jsx` — MODIFY: point to new endpoints
- `src/pages/LoginPage.jsx` — MODIFY: new consent UI layout
- `src/components/AuthModal.jsx` — MODIFY: same new layout

---

## Out of Scope

- Browser extension (MetaMask-style) for in-browser signing
- Full `LoginConsentResponse` construction in SDK (signmessage is sufficient; can add later)
- Desktop deep link handler (requires Verus Desktop to register URL scheme — their side)
- OAuth/OpenID Connect bridge
- Multi-permission scopes beyond IDENTITY_VIEW
