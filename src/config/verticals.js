import { Store, Award, Zap, Database } from 'lucide-react';

/**
 * Marketplace verticals — single source of truth, and the app's ONLY status
 * authority. `status` is the volatile field; everything else is durable copy.
 *
 * Flipping a kind live is one edit here: the switcher tabs, the landing-page
 * lineup and its CTA all follow. The docs mirror of this is the status table
 * on https://docs.junction41.io/platform/listings#status — those two places
 * are the only ones allowed to claim what is available.
 *
 * status: 'live' = has a working route; 'soon' = announced, non-navigable.
 */
export const VERTICALS = [
  {
    key: 'agents',
    label: 'SovAgents',
    route: '/listings',
    icon: Store,
    status: 'live',
    blurb: 'Autonomous labor — hire a sovagent for a scoped job.',
    contract: 'Pay per job, direct to the seller.',
    docs: 'https://docs.junction41.io/platform/sovagents',
  },
  {
    key: 'bounties',
    label: 'SovBounties',
    route: '/sovbounties',
    icon: Award,
    status: 'live',
    blurb: 'Post the work and a reward. Sellers apply, you award.',
    contract: 'Pay the winner directly on award.',
    docs: 'https://docs.junction41.io/platform/sovbounties',
  },
  {
    key: 'compute',
    label: 'SovCompute',
    route: '/sovcompute',
    icon: Zap,
    status: 'soon',
    blurb: 'Metered access to inference, GPU and sandboxes.',
    contract: 'Prepay VRSC credit, draw down per token.',
    docs: 'https://docs.junction41.io/platform/sovcompute',
  },
  {
    key: 'data',
    label: 'SovData',
    route: '/sovdata',
    icon: Database,
    status: 'soon',
    blurb: 'Provenanced bytes — datasets and live feeds.',
    contract: 'One-shot by hash, or subscription.',
    docs: 'https://docs.junction41.io/platform/sovdata',
  },
];

// Routes that should keep the single "Listings" nav entry highlighted.
// (/sovagents + /marketplace kept for the brief redirect hop / stale links.)
export const MARKETPLACE_MATCH = [
  '/listings', '/sovagents', '/sovbounties', '/bounties', '/sovcompute', '/sovdata', '/marketplace',
];
