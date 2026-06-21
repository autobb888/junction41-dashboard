/**
 * Allowlist of Verus wallet deeplink schemes.
 *
 * - `i5jtwbp6zymeay9llnraglgjqgdrffsau4` is the CANONICAL scheme emitted by
 *   verus-typescript-primitives `toWalletDeeplinkUri()` (lowercased
 *   WALLET_VDXF_KEY.vdxfid = vrsc::applications.wallet). This is what our
 *   backend actually returns.
 * - `verus` / `veruspay` are alias schemes the Verus Mobile app also registers
 *   (verus:// added as an alias in app v1.1.0-x). `veruspay` is reserved for the
 *   payment phase.
 *
 * The guard exists to stop a buggy/compromised server response from turning a
 * clickable link or QR into an XSS sink (`javascript:`, `data:`). It must accept
 * the legit scheme — the previous guard only allowed `verus://`, which BLOCKED
 * the canonical i5jt… link the backend emits.
 */
export const WALLET_DEEPLINK_SCHEMES = [
  'i5jtwbp6zymeay9llnraglgjqgdrffsau4',
  'verus',
  'veruspay',
];

export function isValidWalletDeeplink(uri) {
  if (typeof uri !== 'string') return false;
  const m = uri.match(/^([a-z0-9]+):\/\//i);
  if (!m) return false;
  return WALLET_DEEPLINK_SCHEMES.includes(m[1].toLowerCase());
}

export function safeWalletDeeplink(uri) {
  return isValidWalletDeeplink(uri) ? uri : null;
}
