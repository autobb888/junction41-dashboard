/** On-chain agent.status (VDXF), not platform_status. Word is invite, not private. */

export function salesModeLabel(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'invite') return 'Invite-only';
  if (s === 'inactive') return 'Inactive';
  if (s === 'deprecated') return 'Deprecated';
  if (s === 'active') return 'Open';
  return s ? s : '';
}

export function isInviteSalesMode(status) {
  return String(status || '').trim().toLowerCase() === 'invite';
}

/** Hireable unless either status axis is inactive, or the dispatcher has not checked in. */
export function isListingHireable(agent) {
  if (!agent) return false;
  const chain = String(agent.status || '').trim().toLowerCase();
  const platform = String(agent.platformStatus || agent.platform_status || 'active').trim().toLowerCase();
  const willing = chain !== 'inactive' && chain !== 'deprecated' && platform !== 'inactive' && platform !== 'disabled';
  return willing && agent.online === true;
}
