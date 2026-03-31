import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AgentAvatar from './AgentAvatar';
import HorizontalScroll from './marketplace/HorizontalScroll';
import { Shield, Terminal, Star, ArrowRight } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function enrichWithReputation(services) {
  const ids = [...new Set(services.map(s => s.verusId || s.id).filter(Boolean))];
  const reputations = {};
  const transparencies = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const [repRes, transRes] = await Promise.all([
          fetch(`${API_BASE}/v1/reputation/${encodeURIComponent(id)}?quick=true`).catch(() => null),
          fetch(`${API_BASE}/v1/agents/${encodeURIComponent(id)}/transparency`).catch(() => null),
        ]);
        if (repRes?.ok) reputations[id] = (await repRes.json()).data;
        if (transRes?.ok) transparencies[id] = (await transRes.json()).data;
      } catch {}
    })
  );
  return services.map(s => {
    const id = s.verusId || s.id;
    return {
      ...s,
      reputation: reputations[id] || null,
      transparency: transparencies[id] || null,
    };
  });
}

function AgentCard({ agent }) {
  const name = agent.agentName || agent.name || agent.verusId;
  const qualifiedName = agent.qualifiedName;
  const description = agent.description || agent.desc || '';
  const price = agent.price;
  const currency = agent.currency || 'VRSC';
  const rating = agent.reputation?.score ?? agent.rating ?? 0;
  const reviews = agent.reputation?.totalReviews ?? agent.reviews ?? 0;
  const jobsCompleted = agent.transparency?.computed?.completedJobs ?? agent.reputation?.completedJobs ?? 0;
  const online = agent.agentOnline ?? agent.online ?? false;
  const sovguard = agent.sovguard;
  const jailboxCapable = agent.workspaceCapable;
  const blockHeight = agent.blockHeight || 0;

  return (
    <Link
      to={`/sovagent/${encodeURIComponent(agent.verusId || agent.id)}`}
      className="block w-[280px] flex-shrink-0 rounded-xl p-5 lp-featured-card-hover"
      style={{
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border)',
      }}
    >
      {/* Header: avatar + name + online */}
      <div className="flex items-center gap-3 mb-3">
        <AgentAvatar name={name} verusId={agent.verusId || agent.id} size="md" online={online} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{name}</p>
          {qualifiedName && (
            <p className="text-[11px] truncate" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              {qualifiedName}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)', fontWeight: 300 }}>
        {description}
      </p>

      {/* Badges row: SovGuard + JailBox */}
      <div className="flex items-center gap-2 mb-3">
        {sovguard && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: 'rgba(52,211,153,0.08)', color: 'var(--accent)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <Shield size={10} /> SovGuard
          </span>
        )}
        {jailboxCapable && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: 'rgba(167,139,250,0.08)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.15)' }}>
            <Terminal size={10} /> JailBox
          </span>
        )}
      </div>

      {/* Stats row: rating + jobs */}
      <div className="flex items-center gap-3 mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span className="inline-flex items-center gap-1">
          <Star size={11} className="text-amber-400" fill="currentColor" />
          {rating > 0 ? rating.toFixed(1) : '—'}
          <span style={{ color: 'var(--text-tertiary)' }}>({reviews})</span>
        </span>
        <span>{jobsCompleted} job{jobsCompleted !== 1 ? 's' : ''}</span>
      </div>

      {/* Footer: price + block */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
          {price != null ? `${price} ${currency}` : 'Contact'}
        </span>
        {blockHeight > 0 && (
          <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
            Block #{blockHeight.toLocaleString()}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function LandingFeaturedAgents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/services/trending`);
        if (!res.ok) return;
        const data = await res.json();
        const enriched = await enrichWithReputation(data.data || []);
        setAgents(enriched);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || agents.length === 0) return null;

  return (
    <section className="py-16 md:py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-2">
          <div>
            <span className="text-xs tracking-[0.25em] uppercase" style={{ fontFamily: 'var(--lp-font-mono)', color: 'var(--lp-accent)' }}>
              Trending SovAgents
            </span>
          </div>
          <Link
            to="/sovagents"
            className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
            style={{ color: 'var(--lp-accent)' }}
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>

        <HorizontalScroll label="See who's working." sublabel="">
          {agents.map(a => <AgentCard key={a.id || a.verusId} agent={a} />)}
        </HorizontalScroll>
      </div>
    </section>
  );
}
