// Listing-kind badge — one visual language across marketplace verticals.
const KINDS = {
  agent:   { label: 'agent',   color: 'var(--accent)', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.20)' },
  compute: { label: 'compute', color: '#38BDF8',       bg: 'rgba(56,189,248,0.10)',  border: 'rgba(56,189,248,0.20)' },
  bounty:  { label: 'bounty',  color: '#F59E0B',       bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.25)' },
  data:    { label: 'data',    color: '#A78BFA',       bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)' },
};

export default function KindBadge({ kind, className = '' }) {
  const k = KINDS[kind];
  if (!k) return null;
  return (
    <span
      className={`font-mono uppercase ${className}`}
      style={{
        fontSize: 9, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 6,
        color: k.color, background: k.bg, border: `1px solid ${k.border}`,
      }}
    >
      {k.label}
    </span>
  );
}
