import { useNavigate } from 'react-router-dom';
import AgentAvatar from '../AgentAvatar';
import TrustBadge from '../TrustBadge';
import { useDisplayName } from '../../context/IdentityContext';

function StarRating({ rating }) {
  return (
    <span className="text-amber-400 text-xs font-medium">
      &#9733; {rating.toFixed(1)}
    </span>
  );
}

export default function MarketplaceCard({ service, variant = 'grid' }) {
  const navigate = useNavigate();
  const displayName = service.agentName || service.agent_name || service.name;
  const verusIdName = useDisplayName(service.verusId);
  const name = displayName;
  const rating = service.reputation?.score || 0;
  const reviews = service.reputation?.totalReviews || 0;
  const online = service.agentOnline ?? service.online;
  const desc = service.description || '';
  const category = service.category || '';
  const tags = service.tags || [];
  const jobs = service.reputation?.completedJobs || 0;
  const agentUrl = `/agents/${encodeURIComponent(service.verusId || service.id)}`;
  const trustLevel = service.transparency?.trustLevel;
  const trustScore = service.transparency?.trustScore;

  if (variant === 'list') {
    return (
      <div
        onClick={() => navigate(agentUrl)}
        className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all"
        style={{
          background: 'rgba(15, 19, 32, 0.6)',
          border: '1px solid rgba(52, 211, 153, 0.08)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.25)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.08)'; }}
      >
        <AgentAvatar name={name} verusId={service.verusId} size="md" online={online} />
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm">{service.name}</h3>
          <p className="text-xs truncate" style={{ color: 'var(--accent)', opacity: 0.7 }}>
            {(verusIdName && verusIdName.includes('@')) ? verusIdName : displayName}
          </p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full hidden sm:block"
          style={{ background: 'rgba(52, 211, 153, 0.08)', color: 'var(--text-tertiary)' }}>{category}</span>
        {service.workspaceCapable && (
          <span title="Workspace access" className="text-xs px-1 rounded" style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60A5FA' }}>&lt;-&gt;</span>
        )}
        {rating > 0 && <StarRating rating={rating} />}
        <div className="flex items-center gap-1.5">
          <span className="text-white text-sm font-semibold whitespace-nowrap">{service.price} {service.currency}</span>
          {service.acceptedCurrencies?.length > 1 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>+{service.acceptedCurrencies.length - 1}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => navigate(agentUrl)}
      className="group relative rounded-xl p-4 transition-all duration-300 cursor-pointer"
      style={{
        background: 'rgba(15, 19, 32, 0.6)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(52, 211, 153, 0.08)',
        boxShadow: '0 0 0 0 rgba(52, 211, 153, 0)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.border = '1px solid rgba(52, 211, 153, 0.25)';
        e.currentTarget.style.boxShadow = '0 0 20px rgba(52, 211, 153, 0.08), inset 0 0 20px rgba(52, 211, 153, 0.03)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.border = '1px solid rgba(52, 211, 153, 0.08)';
        e.currentTarget.style.boxShadow = '0 0 0 0 rgba(52, 211, 153, 0)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Header: avatar + name + rating */}
      <div className="flex items-start gap-3 mb-3">
        <AgentAvatar name={name} verusId={service.verusId} size="md" online={online} />
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">{service.name}</h3>
          <p className="text-xs truncate" style={{ color: 'var(--accent)', opacity: 0.7 }}>
            {(verusIdName && verusIdName.includes('@')) ? verusIdName : displayName}
          </p>
          <p className="text-xs truncate font-mono" style={{ color: 'var(--text-tertiary)', opacity: 0.5, fontSize: 10 }}>
            {service.verusId?.slice(0, 8)}...{service.verusId?.slice(-4)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {rating > 0 && <StarRating rating={rating} />}
          {reviews > 0 && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{reviews} reviews</span>}
        </div>
      </div>

      {/* Workspace indicator — bottom right corner */}
      {service.workspaceCapable && (
        <span title="This agent can connect to your local project via workspace"
          className="absolute bottom-2 right-2 z-10 px-1.5 py-0.5 rounded text-xs font-mono"
          style={{ background: 'rgba(96, 165, 250, 0.15)', color: '#60A5FA', border: '1px solid rgba(96, 165, 250, 0.25)' }}>
          &lt;-&gt;
        </span>
      )}

      {/* Trust badge */}
      {trustLevel && (
        <div className="mb-2">
          <TrustBadge level={trustLevel} score={trustScore} />
        </div>
      )}

      {/* Description */}
      <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{desc}</p>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-full text-xs"
              style={{
                background: 'rgba(52, 211, 153, 0.08)',
                color: 'var(--accent)',
                border: '1px solid rgba(52, 211, 153, 0.12)',
              }}
            >{tag}</span>
          ))}
        </div>
      )}

      {/* Footer: price + accepted currencies + jobs */}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white font-semibold text-sm">{service.price}</span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{service.currency}</span>
          {service.acceptedCurrencies?.length > 1 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(52, 211, 153, 0.08)', color: 'var(--text-tertiary)' }}>
              +{service.acceptedCurrencies.length - 1} more
            </span>
          )}
        </div>
        {jobs > 0 && <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{jobs} jobs</span>}
      </div>
    </div>
  );
}
