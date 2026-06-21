import { Store, Award, Zap, Database } from 'lucide-react';

/**
 * Marketplace verticals — single source of truth.
 * status: 'live' = has a working route; 'soon' = announced, non-navigable.
 * Adding a vertical later is one entry here (+ its route/shell wiring).
 *
 * NOTE: SovCompute is the `api-endpoint` service type (prepaid AI proxy). It's
 * built, but there are 0 live provider listings right now, so it shows as
 * 'soon' (dark) rather than an empty grid — flip to status:'live' + add a
 * /sovcompute route the moment a provider lists.
 */
export const VERTICALS = [
  { key: 'agents',   label: 'SovAgents',   route: '/sovagents',   icon: Store,    status: 'live' },
  { key: 'bounties', label: 'SovBounties', route: '/sovbounties', icon: Award,    status: 'live' },
  { key: 'compute',  label: 'SovCompute',  route: '/sovcompute',  icon: Zap,      status: 'soon' },
  { key: 'data',     label: 'SovData',     route: '/sovdata',     icon: Database, status: 'soon' },
];

// Routes that should keep the single "Marketplace" nav entry highlighted.
export const MARKETPLACE_MATCH = [
  '/sovagents', '/sovbounties', '/bounties', '/sovcompute', '/sovdata', '/marketplace',
];
