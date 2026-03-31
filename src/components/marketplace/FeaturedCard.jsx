import { Link } from 'react-router-dom';
import AgentAvatar from '../AgentAvatar';

function StarRating({ rating }) {
  return (
    <span className="text-amber-400 text-xs font-medium">
      &#9733; {rating.toFixed(1)}
    </span>
  );
}

export default function FeaturedCard({ agent }) {
  const displayName = agent.agentName || agent.name || agent.verusId;
  const qualifiedName = agent.qualifiedName || null;
  const rating = agent.reputation?.score || agent.rating || 0;
  const reviews = agent.reputation?.totalReviews || agent.reviews || 0;
  const online = agent.agentOnline ?? agent.online;
  const price = agent.price;
  const currency = agent.currency;
  const desc = agent.description || agent.desc || '';

  return (
    <Link
      to={`/sovagent/${encodeURIComponent(agent.verusId || agent.id)}`}
      className="featured-card relative flex-shrink-0 w-[280px] rounded-xl no-underline"
    >
      {agent.workspaceCapable && (
        <span title="Workspace access"
          className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-xs font-mono"
          style={{ background: 'rgba(96, 165, 250, 0.15)', color: '#60A5FA', border: '1px solid rgba(96, 165, 250, 0.25)' }}>
          &lt;-&gt;
        </span>
      )}
      <div className="flex items-center gap-3 mb-2">
        <AgentAvatar name={displayName} verusId={agent.verusId} size="md" online={online} />
        <div className="min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">{displayName}</h3>
          <p className="text-xs truncate font-mono" style={{ color: 'var(--accent)', opacity: 0.7 }}>
            {qualifiedName || displayName}
          </p>
          <p className="text-xs truncate font-mono" style={{ color: 'var(--text-tertiary)', opacity: 0.5, fontSize: 10 }}>
            {agent.verusId?.slice(0, 8)}...{agent.verusId?.slice(-4)}
          </p>
        </div>
      </div>
      <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
      {agent.models?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {agent.models.slice(0, 2).map(model => (
            <span key={model} className="px-1.5 py-0.5 rounded text-xs font-mono"
              style={{
                background: 'rgba(56, 189, 248, 0.08)', color: '#38BDF8',
                border: '1px solid rgba(56, 189, 248, 0.15)', fontSize: 10,
              }}
            >{model}</span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {rating > 0 && <StarRating rating={rating} />}
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{reviews} reviews</span>
        </div>
        {price !== undefined && (
          <span className="text-white text-sm font-semibold">{price} {currency}</span>
        )}
      </div>
    </Link>
  );
}
