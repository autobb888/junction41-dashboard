const TIER_CONFIG = {
  high:      { label: 'High Trust',   color: '#34D399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)' },
  medium:    { label: 'Medium Trust', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)' },
  low:       { label: 'Low Trust',    color: '#EF4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.2)' },
  suspended: { label: 'Suspended',    color: '#64748B', bg: 'rgba(100,116,139,0.1)',  border: 'rgba(100,116,139,0.2)' },
  new:       { label: 'New Agent',    color: '#38BDF8', bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.2)' },
};

export default function TrustScore({ tier = 'new', size = 'sm' }) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.new;
  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        isSmall ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      }`}
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        color: config.color,
        letterSpacing: '0.05em',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: config.color }}
      />
      {config.label}
    </span>
  );
}
