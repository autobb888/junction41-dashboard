import { useNavigate } from 'react-router-dom';
import AgentAvatar from '../AgentAvatar';
import TrustScore from '../TrustScore';
import { Shield, Terminal, Star, Cpu, Lock, EyeOff } from 'lucide-react';

// Privacy tier badge config — matches platform PRIVACY_MULTIPLIERS in pricing.ts
// (standard: 1.0, private: 1.33, sovereign: 1.83). When the multiplier or tier
// labels change there, update both sides.
const PRIVACY_TIER_BADGE = {
  private: {
    Icon: Lock,
    label: 'Private',
    premium: '+33%',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.2)',
  },
  sovereign: {
    Icon: EyeOff,
    label: 'Sovereign',
    premium: '+83%',
    color: '#F472B6',
    bg: 'rgba(244,114,182,0.08)',
    border: 'rgba(244,114,182,0.2)',
  },
};

export default function MarketplaceCard({ service, variant = 'grid' }) {
  const navigate = useNavigate();
  const displayName = service.agentName || service.agent_name || service.name;
  const qualifiedName = service.qualifiedName || null;
  const rating = service.reputation?.score || 0;
  const reviews = service.reputation?.totalReviews || 0;
  const online = service.agentOnline ?? service.online;
  const desc = service.description || '';
  const category = service.category || '';
  const jobs = service.reputation?.completedJobs || 0;
  const isApiEndpoint = service.serviceType === 'api-endpoint';
  const proxyModels = isApiEndpoint && Array.isArray(service.modelPricing)
    ? service.modelPricing
    : [];
  const models = isApiEndpoint
    ? proxyModels.map((m) => m.model).filter(Boolean)
    : (service.models || []);
  const agentUrl = `/sovagent/${encodeURIComponent(service.verusId || service.id)}`;
  const cheapestRate = isApiEndpoint && proxyModels.length > 0
    ? proxyModels.reduce((min, m) => {
        const r = Number(m.inputTokenRate);
        return Number.isFinite(r) && (min == null || r < min) ? r : min;
      }, null)
    : null;
  const privacyTier = service.privacyTier;
  const privacyBadge = privacyTier && PRIVACY_TIER_BADGE[privacyTier];

  if (variant === 'list') {
    return (
      <div
        onClick={() => navigate(agentUrl)}
        className="marketplace-card flex items-center gap-4 rounded-xl"
      >
        <AgentAvatar name={displayName} verusId={service.verusId} size="md" online={online} />
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">{displayName}</h3>
          {qualifiedName && (
            <p className="text-[11px] truncate" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              {qualifiedName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {service.sovguard && <Shield size={12} style={{ color: 'var(--accent)' }} />}
          {service.workspaceCapable && <Terminal size={12} style={{ color: '#A78BFA' }} />}
          {privacyBadge && (
            <privacyBadge.Icon
              size={12}
              style={{ color: privacyBadge.color }}
              title={`${privacyBadge.label} privacy — ${privacyBadge.premium} premium`}
            />
          )}
        </div>
        {rating > 0 && (
          <span className="inline-flex items-center gap-1 text-xs">
            <Star size={11} className="text-amber-400" fill="currentColor" />
            {rating.toFixed(1)}
          </span>
        )}
        <span className="text-xs px-2 py-1 rounded-full hidden sm:block"
          style={{ background: 'rgba(52, 211, 153, 0.08)', color: 'var(--text-tertiary)' }}>{category}</span>
        <span className="text-white text-sm font-semibold whitespace-nowrap">{service.price} {service.currency}</span>
      </div>
    );
  }

  return (
    <div
      onClick={() => navigate(agentUrl)}
      className="marketplace-card group relative rounded-xl lp-featured-card-hover"
    >
      {/* Header: avatar + name + online */}
      <div className="flex items-center gap-3 mb-3">
        <AgentAvatar name={displayName} verusId={service.verusId} size="md" online={online} />
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

      {/* Badges row: SovGuard + JailBox + Trust */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {(service.trustTier || service.transparency?.computed?.trustLevel) && (
          <TrustScore tier={service.trustTier || service.transparency?.computed?.trustLevel} />
        )}
        {isApiEndpoint && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)' }}>
            <Cpu size={10} /> API
          </span>
        )}
        {service.sovguard && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: 'rgba(52,211,153,0.08)', color: 'var(--accent)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <Shield size={10} /> SovGuard
          </span>
        )}
        {service.workspaceCapable && !isApiEndpoint && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: 'rgba(167,139,250,0.08)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.15)' }}>
            <Terminal size={10} /> JailBox
          </span>
        )}
        {privacyBadge && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: privacyBadge.bg, color: privacyBadge.color, border: `1px solid ${privacyBadge.border}` }}
            title={`${privacyBadge.label} tier sovagents charge a ${privacyBadge.premium} premium for stronger data handling guarantees.`}
          >
            <privacyBadge.Icon size={10} /> {privacyBadge.label} {privacyBadge.premium}
          </span>
        )}
      </div>

      {/* Models */}
      {models.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {models.slice(0, 3).map(model => (
            <span key={model} className="px-1.5 py-0.5 rounded text-[10px] font-mono"
              style={{ background: 'rgba(56, 189, 248, 0.08)', color: '#38BDF8', border: '1px solid rgba(56, 189, 248, 0.15)' }}>
              {model}
            </span>
          ))}
          {service.markup && service.markup > 1 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono"
              style={{ background: 'rgba(251,191,36,0.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.15)' }}>
              {service.markup}x
            </span>
          )}
        </div>
      )}

      {/* Stats row: rating + jobs */}
      <div className="flex items-center gap-3 mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span className="inline-flex items-center gap-1">
          <Star size={11} className="text-amber-400" fill="currentColor" />
          {rating > 0 ? rating.toFixed(1) : '—'}
          <span style={{ color: 'var(--text-tertiary)' }}>({reviews})</span>
        </span>
        {jobs > 0 && <span>{jobs} job{jobs !== 1 ? 's' : ''}</span>}
      </div>

      {/* Footer: price + block */}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {isApiEndpoint ? (
          <span className="text-sm font-semibold" style={{ color: '#38BDF8' }}>
            {cheapestRate != null
              ? <>from {cheapestRate} <span className="text-[10px] font-normal" style={{ color: 'var(--text-tertiary)' }}>{service.currency} / 1M tok</span></>
              : <>{service.price} <span className="text-[10px] font-normal" style={{ color: 'var(--text-tertiary)' }}>{service.currency}</span></>
            }
          </span>
        ) : (
          <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
            {service.price} {service.currency}
          </span>
        )}
        <div className="flex items-center gap-2">
          {isApiEndpoint && proxyModels.length > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(56,189,248,0.08)', color: '#38BDF8' }}>
              {proxyModels.length} models
            </span>
          )}
          {!isApiEndpoint && service.acceptedCurrencies?.length > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(52, 211, 153, 0.08)', color: 'var(--text-tertiary)' }}>
              +{service.acceptedCurrencies.length - 1} currencies
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
