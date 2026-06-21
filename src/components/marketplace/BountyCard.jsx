import { useNavigate } from 'react-router-dom';
import { Award, Clock, Users, Filter } from 'lucide-react';
import KindBadge from './KindBadge';

// Self-contained deadline formatter (mirrors BountiesPage.timeRemaining).
function timeRemaining(deadline) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

const STATUS = {
  open:     { color: 'var(--accent)', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.20)' },
  awarded:  { color: '#38BDF8',       bg: 'rgba(56,189,248,0.10)',  border: 'rgba(56,189,248,0.20)' },
  resolved: { color: '#A78BFA',       bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)' },
  cancelled:{ color: '#F87171',       bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
};

/**
 * Bounty listing rendered in the shared marketplace card chrome
 * (.marketplace-card → hover sheen ring + consistent styling), with a
 * bounty-specific facet row. Part of the one-card/many-facets system.
 */
export default function BountyCard({ bounty }) {
  const navigate = useNavigate();
  const status = STATUS[bounty.status] || STATUS.open;
  const remaining = timeRemaining(bounty.application_deadline);
  const applicants = bounty.application_count || 0;
  const qualified = bounty.min_reviews || bounty.min_trust_tier || bounty.required_category;

  return (
    <div
      onClick={() => navigate(`/bounties/${bounty.id}`)}
      className="marketplace-card group relative rounded-xl lp-featured-card-hover"
      style={{ cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <KindBadge kind="bounty" className="absolute top-3 right-3" />

      {/* Header: icon + title + poster */}
      <div className="flex items-center gap-3 mb-3" style={{ paddingRight: 56 }}>
        <div
          className="flex items-center justify-center rounded-[10px] flex-none"
          style={{ width: 38, height: 38, background: 'linear-gradient(140deg,#b45309,#f59e0b)', color: '#1a1205' }}
        >
          <Award size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white" style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {bounty.title}
          </p>
          <p className="text-[11px] truncate" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
            posted by {bounty.poster_verus_id?.slice(0, 10) || 'unknown'}…
          </p>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)', fontWeight: 300 }}>
        {bounty.description}
      </p>

      {/* Badges: status + category + qualified */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="font-mono uppercase" style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6, color: status.color, background: status.bg, border: `1px solid ${status.border}` }}>
          {bounty.status}
        </span>
        {bounty.category && (
          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
            {bounty.category}
          </span>
        )}
        {qualified && (
          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: '#F59E0B' }}>
            <Filter size={10} /> Qualified
          </span>
        )}
      </div>

      {/* Facet row: applicants + deadline · reward */}
      <div className="flex items-center gap-3 mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span className="inline-flex items-center gap-1">
          <Users size={11} /> {applicants} applicant{applicants !== 1 ? 's' : ''}
        </span>
        <span className="inline-flex items-center gap-1" style={{ color: remaining === 'Ended' ? '#F87171' : 'var(--text-secondary)' }}>
          <Clock size={11} /> {remaining || 'Open'}
        </span>
      </div>

      <div className="flex items-center justify-between pt-2" style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
          {bounty.amount} {bounty.currency}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>reward</span>
      </div>
    </div>
  );
}
