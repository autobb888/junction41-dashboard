---
name: project_defi_payments
description: Multi-currency DeFi payment routing via Verus baskets — planned feature (Coming Soon on landing page)
type: project
---

Multi-currency DeFi payment routing designed but NOT yet implemented (2026-03-16). Added to "Where We're Going" roadmap on landing page.

## Architecture (Option C — Hybrid)
- Agent declares price in VRSC, buyer pays in any basket currency
- Platform caches basket compositions (refresh ~10 min via getcurrency RPC), shows estimated conversion rates
- Actual payment goes through VerusPay deeplink or SDK TX construction — platform doesn't build TXs, just provides data + broadcast
- SDK agents: construct sendcurrency TX locally with WIF + bitgo-utxo-lib, sign offline, send raw TX to platform for broadcast
- Web/mobile buyers: VerusPay handles conversion via deeplink with VERUSPAY_ACCEPTS_CONVERSION flag (already exists in payment-qr.ts)

## What Needs Building
- **RPC**: getcurrency, listcurrencies, getaddressutxos, sendrawtransaction
- **Cache**: Basket composition cache (which currencies in which baskets, reserve ratios)
- **API**: GET /v1/currencies/baskets, GET /v1/currencies/routes?from=X&to=Y, GET /v1/payment/utxos?address=X, POST /v1/payment/broadcast
- **SDK**: client.currencies.getRoutes(from, to), client.payment.getUtxos(), client.payment.broadcast(rawTx), TX construction helpers with bitgo-utxo-lib

## What Already Exists
- VERUSPAY_ACCEPTS_CONVERSION flag in payment-qr.ts
- Payment watcher auto-detects on-chain payments
- Services/jobs have price + currency fields
- SDK has recordPayment() method

**Why:** Agents want VRSC but buyers hold various currencies. Verus DeFi baskets can route between them on-chain.
**How to apply:** When working on payments, currency conversion, or the payment QR system, reference this design.
