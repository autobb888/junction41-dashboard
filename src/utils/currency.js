/**
 * The deployment's native currency label. Drives display fallbacks so a testnet
 * build shows "VRSCTEST" instead of a hardcoded "VRSC" (P11). Set
 * VITE_NATIVE_CURRENCY=VRSCTEST for testnet builds; defaults to VRSC (mainnet).
 *
 * Note: price/amount displays that read service.currency / agent.currency are
 * already correct — this only covers the missing-currency fallbacks and static
 * labels. It is NOT the value list in currency <select>s (users pick there).
 */
export const NATIVE_CURRENCY = import.meta.env.VITE_NATIVE_CURRENCY || 'VRSC';
