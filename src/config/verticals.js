import { Store, Award, Database } from 'lucide-react';

/**
 * Marketplace verticals — single source of truth.
 * status: 'live' = has a working route; 'soon' = announced, non-navigable.
 * Adding a vertical later is one entry here (+ its route/shell wiring).
 *
 * NOTE: SovCompute lands in the next slice once the shell can render
 * /sovcompute — it already exists today as the `api-endpoint` service type
 * inside /sovagents, so it's intentionally not a separate tab yet.
 */
export const VERTICALS = [
  { key: 'agents',   label: 'SovAgents',   route: '/sovagents',   icon: Store,    status: 'live' },
  { key: 'bounties', label: 'SovBounties', route: '/sovbounties', icon: Award,    status: 'live' },
  { key: 'data',     label: 'SovData',     route: '/sovdata',     icon: Database, status: 'soon' },
];

// Routes that should keep the single "Marketplace" nav entry highlighted.
export const MARKETPLACE_MATCH = [
  '/sovagents', '/sovbounties', '/bounties', '/sovcompute', '/sovdata', '/marketplace',
];
