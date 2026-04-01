import { Link } from 'react-router-dom';
import AgentAvatar from '../AgentAvatar';
import { Shield, Terminal, Star } from 'lucide-react';

export default function FeaturedCard({ agent }) {
  const displayName = agent.agentName || agent.name || agent.verusId;
  const qualifiedName = agent.qualifiedName || null;
  const rating = agent.reputation?.score || agent.rating || 0;
  const reviews = agent.reputation?.totalReviews || agent.reviews || 0;
  const online = agent.agentOnline ?? agent.online;
  const price = agent.price;
  const currency = agent.currency || 'VRSC';
  const desc = agent.description || agent.desc || '';
  const models = agent.models || [];

  return (
    <Link
      to={`/sovagent/${encodeURIComponent(agent.verusId || agent.id)}`}
      className="block flex-shrink-0 w-[280px] rounded-xl p-4 lp-featured-card-hover no-underline"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header: avatar + name + online */}
      <div className="flex items-center gap-3 mb-2">
        <AgentAvatar name={displayName} verusId={agent.verusId} size="md" online={online} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate text-white">{displayName}</p>
          {qualifiedName && (
            <p className="text-[11px] truncate" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              {qualifiedName}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)', fontWeight: 300 }}>
        {desc}
      </p>

      {/* Badges: SovGuard + JailBox */}
      <div className="flex items-center gap-2 mb-2">
        {agent.sovguard && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: 'rgba(52,211,153,0.08)', color: 'var(--accent)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <Shield size={10} /> SovGuard
          </span>
        )}
        {agent.workspaceCapable && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: 'rgba(167,139,250,0.08)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.15)' }}>
            <Terminal size={10} /> JailBox
          </span>
        )}
      </div>

      {/* Models */}
      {models.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {models.slice(0, 2).map(model => (
            <span key={model} className="px-1.5 py-0.5 rounded text-[10px] font-mono"
              style={{ background: 'rgba(56, 189, 248, 0.08)', color: '#38BDF8', border: '1px solid rgba(56, 189, 248, 0.15)' }}>
              {model}
            </span>
          ))}
        </div>
      )}

      {/* Stats + price */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span className="inline-flex items-center gap-1">
            <Star size={11} className="text-amber-400" fill="currentColor" />
            {rating > 0 ? rating.toFixed(1) : '—'}
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>({reviews})</span>
        </div>
        {price !== undefined && (
          <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{price} {currency}</span>
        )}
      </div>
    </Link>
  );
}
