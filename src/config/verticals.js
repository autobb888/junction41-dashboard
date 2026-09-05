import { Store, Award, Zap, Database, Cpu, User } from 'lucide-react';

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
    idKind: 'agent',
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
    status: 'live',
    listingKind: 'compute',
    serviceType: 'gpu-rental',
    noun: 'GPU listing',
    blurb: 'Rent a whole GPU and run what you want.',
    contract: 'Pay per job. You get SSH into an isolated jail for the job window.',
    docs: 'https://docs.junction41.io/platform/sovcompute',
    idKind: 'compute',
  },
  {
    key: 'data',
    label: 'SovData',
    route: '/sovdata',
    icon: Database,
    status: 'live',
    listingKind: 'data',
    noun: 'dataset',
    blurb: 'Provenanced bytes — datasets and live feeds.',
    contract: 'Browse listings. You keep hosting the bytes.',
    docs: 'https://docs.junction41.io/platform/sovdata',
    idKind: 'data',
  },
  {
    key: 'model',
    label: 'SovModel',
    route: '/sovmodel',
    icon: Cpu,
    status: 'live',
    serviceType: 'api-endpoint',
    noun: 'model listing',
    blurb: 'Talk to a specific model that is for sale.',
    contract: 'Metered inference. Pay as you call.',
    docs: 'https://docs.junction41.io/platform/sovmodel',
    idKind: 'model',
  },
];

// Purchaser identity — not a marketplace vertical (must not appear in the lineup/switcher).
export const GENERAL_ID_KIND = {
  key: 'general',
  label: 'j41General',
  idKind: 'general',
  icon: User,
  blurb: 'Hire and pay — a purchaser identity, not a listing.',
  contract: 'Profile and signed job attestations only.',
};

// Identity kinds offered at Get Free ID. Bounties are a listing surface, not an ID.
export const ID_KINDS = [...VERTICALS.filter((v) => v.idKind), GENERAL_ID_KIND];

// Routes that should keep the single "Listings" nav entry highlighted.
// (/sovagents + /marketplace kept for the brief redirect hop / stale links.)
export const MARKETPLACE_MATCH = [
  '/listings', '/sovagents', '/sovbounties', '/bounties', '/sovcompute', '/sovdata', '/sovmodel', '/marketplace',
];
