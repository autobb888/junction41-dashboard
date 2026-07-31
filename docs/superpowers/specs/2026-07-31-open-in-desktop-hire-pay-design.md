# "Open in Verus Desktop" for Hire + Pay — design

**Date:** 2026-07-31
**Repo:** `junction41-dashboard` (frontend only — backend already emits every deeplink)

## Goal
Let a logged-in buyer on a desktop browser **hire an agent and pay for the job entirely through the Verus Desktop wallet** ("open in desktop → approve in a wallet window"), mirroring the login flow that already works — no phone QR scan, no copy-pasting CLI.

## Why it's small
The backend already produces the deeplinks and the frontend already validates/renders them; they're just labeled/placed for phone+QR, not surfaced as a desktop button. Login already proves Verus Desktop ("testgui") accepts the wallet deeplink scheme.

> **Scope correction (Fable review, 2026-07-31):** this is frontend-only **except one line** — the pay warning (below) needs `isTestnet` added to the `payment-qr` response, mirroring the flag login/hire already emit.

- Login desktop button (the proven pattern): `AuthModal.jsx:399-407` — `<a href={safeDeeplink}>Open in Verus Desktop</a>` inside `hidden md:block`, deeplink validated by `safeWalletDeeplink()` (`utils/walletDeeplink.js`).
- Hire deeplink already computed: `HireModal.jsx:367` `safeConsentDeeplink`; backend emits it at `hire-consent.ts:507`. Uses the SAME wallet sign-request scheme as login (`buildSignedGenericRequest`).
- Pay deeplink already computed/rendered: `JobActions.jsx:173-177`; backend emits it at `payment-qr.ts:130` (VerusPay `veruspay` scheme).

## Decisions (locked with owner 2026-07-31)
- **Pay mechanism:** use payment's existing VerusPay desktop deeplink, and keep the fallback shown alongside — **QR + manual-txid for the single legs, CLI `sendcurrency` for the combined case** (covers the in-app-handling unknown). Backend: one line (`isTestnet` on the response) for the warning; deeplinks unchanged.
- **Combined agent+fee:** the single-tx combined path can't be one VerusPay deeplink (invoice = one output), so desktop offers the two existing legs as **two one-click "Open in Verus Desktop" buttons** (pay agent, then pay fee). Combined single-tx stays CLI in the fallback panel.

## Design

### Part 1 — Hire in desktop (`src/components/HireModal.jsx`)
In the desktop region (`hidden md:block`, ~`:671-680`), add an "Open in Verus Desktop" button bound to the existing `safeConsentDeeplink` (`:367`), styled like `AuthModal.jsx:399-407`. Keep the QR beside it. Relabel the existing phone text-link so mobile vs desktop affordances read clearly. **Render the testnet wrong-chain warning** (mirror `AuthModal.jsx:408-419`) using the `isTestnet` the challenge already returns (`hire-consent.ts:509`, currently unused by HireModal). Frontend-only.

### Part 2 — Pay in desktop (`src/components/JobActions.jsx`, `PaymentQR`)
- Single-recipient legs (agent, fee): the deeplink anchor **already renders on desktop** (`:173-177`, labeled "Open in Verus Mobile"). Rather than add a duplicate, **relabel/restyle it responsively** — a `hidden md:block` "Open in Verus Desktop" button + the `md:hidden` "Open in Verus Mobile" link — same URI, mirroring HireModal's `:671/:681` split. Validation stays `safeWalletDeeplink()`.
- Combined agent+fee: surface the existing two-leg "pay both" path (`PayBothPanel`, `:196-269`, which already renders `PaymentQR type="agent"` + `type="fee"`) as two desktop buttons — the two legs already carry their own validated deeplinks. Ordering is safe: the backend only flips the job to `in_progress` once both txids land (`:211`), and the panel already says "any order".
- **Fallback per case:** QR + the **manual-txid** input (already in every panel, `:899-916,:955-972`). Note: the CLI `sendcurrency` command exists **only** for `type=combined` (`payment-qr.ts:227`), not the single legs — so per-leg fallback is QR + manual txid (adequate), not CLI.
- **Testnet warning:** add `isTestnet` to the `payment-qr` response (`payment-qr.ts` ~`:180-229`) mirroring login/hire, then render the same wrong-chain warning beside the pay button. **This is the one backend line.**

### Shared
- Reuse `safeWalletDeeplink()` (`utils/walletDeeplink.js`) for validation on every new/relabeled button.
- Buttons mirror the login button's markup/classes so desktop hire/pay/login feel identical.

## Success criteria
On desktop, a logged-in buyer can (1) hire via an "Open in Verus Desktop" button that pops the wallet to sign the J41-JOB consent, and (2) pay each leg via an "Open in Verus Desktop" button that pops the wallet to send — with QR + CLI always available as fallback.

## Open risk (mitigated) — corrected per Fable review
Original spec said pay uses a distinct `veruspay://` scheme with unknown OS registration. **That was wrong.** `VerusPayInvoice.toWalletDeeplinkUri()` emits the **same `i5jt…` wallet scheme as legacy login** (verus-typescript-primitives `VerusPayInvoice.js:130-131` vs `Request.js:121`) — so OS-level protocol registration is *already proven* by the working login button. The `veruspay` allowlist entry is unused/irrelevant here.

The real remaining unknown is **in-app**: whether testgui's `x-callback-url` handler routes the `VERUSPAY_INVOICE` payload type to a pay UI (vs ignoring/erroring). Covered by the QR + manual-txid fallback; verify empirically once shipped by clicking the pay button with testgui running. (Note: the genreq-protocol hire deeplink is a *third* scheme, `verus://v1/…` — "login proves it" holds per-protocol, i.e. for whichever protocol testgui was actually proven with.)

## Out of scope / future upstream
Single-click combined (split) payment needs **multi-output VerusPay invoices** — an upstream PR to `verus-typescript-primitives`, deferred (see the `project-veruspay-multioutput-pr` note). Not required for this feature; the two-click path is the shippable answer.

## Out of scope
Other `PaymentQR` surfaces — job **reactivation** (`JobActions.jsx:1071`, `type=combined`, CLI-only, no deeplink) and **extensions** (`:271+`) — are excluded from this pass.

## Files
- `src/components/HireModal.jsx` (desktop hire button + testnet warning; reads existing `isTestnet`)
- `src/components/JobActions.jsx` (relabel/restyle pay anchor responsively; combined-as-two; testnet warning)
- `src/utils/walletDeeplink.js` (reused; no change expected)
- **Backend, one line:** `junction41/src/api/routes/payment-qr.ts` — add `isTestnet` to the response (mirrors login/hire) for pay-warning parity. The deeplinks themselves are already emitted.
