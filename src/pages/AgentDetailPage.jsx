import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import HireModal from '../components/HireModal';
import ResolvedId from '../components/ResolvedId';
import TrustScore from '../components/TrustScore';
import TransparencyCard from '../components/TransparencyCard';
import DataPolicyBadge from '../components/DataPolicyBadge';
import DisputeMetrics from '../components/DisputeMetrics';
import AgentAvatar from '../components/AgentAvatar';
import ApiEndpointPanel from '../components/ApiEndpointPanel';
import usePageTitle from '../hooks/usePageTitle';
// Qualified name built from agent name
import {
  Globe, ExternalLink, Tag, Calendar, Shield, Zap,
  Server, Star, Clock, ChevronRight, Copy, Check, Terminal,
  Wallet, Percent, Link2, BadgeCheck, ChevronLeft
} from 'lucide-react';
const API_BASE = import.meta.env.VITE_API_URL || '';

function formatDuration(seconds) {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} hour${seconds >= 7200 ? 's' : ''}`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds}s`;
}

function formatLastSeen(isoString) {
  if (!isoString) return 'Never';
  const diff = Math.floor((Date.now() - new Date(isoString + 'Z').getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${diff >= 7200 ? 's' : ''} ago`;
  return `${Math.floor(diff / 86400)} day${diff >= 172800 ? 's' : ''} ago`;
}

function formatBytes(bytes) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${Math.round(bytes / 1048576)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="hover-accent transition-colors"
      style={{ color: 'rgba(52, 211, 153, 0.5)' }}
      title="Copy"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );
}

function SectionHeader({ icon: Icon, title, count }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={18} style={{ color: 'var(--accent-primary)' }} />
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
      {count != null && (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
          background: 'var(--accent-dim)', color: 'var(--accent-primary)',
        }}>{count}</span>
      )}
    </div>
  );
}

const REVIEWS_PER_PAGE = 5;

function ReviewsSection({ agentId, reviews: initialReviews, reputation }) {
  const [reviews, setReviews] = useState(initialReviews || []);
  const [distribution, setDistribution] = useState({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const [ratingFilter, setRatingFilter] = useState(null); // null = all, 1-5 = filter
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch reviews with optional rating filter + pagination
  async function fetchReviews(rating, pageNum) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(REVIEWS_PER_PAGE),
        offset: String(pageNum * REVIEWS_PER_PAGE),
      });
      if (rating) params.set('rating', String(rating));
      const res = await fetch(`${API_BASE}/v1/reviews/agent/${encodeURIComponent(agentId)}?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReviews(data.data || []);
        setTotal(data.meta?.total || 0);
        if (data.distribution) setDistribution(data.distribution);
      }
    } catch {} finally { setLoading(false); }
  }

  // Initial load — get distribution
  useEffect(() => {
    fetchReviews(null, 0);
  }, [agentId]);

  function handleRatingClick(star) {
    const newFilter = ratingFilter === star ? null : star;
    setRatingFilter(newFilter);
    setPage(0);
    fetchReviews(newFilter, 0);
  }

  function handlePageChange(newPage) {
    setPage(newPage);
    fetchReviews(ratingFilter, newPage);
  }

  const totalReviews = Object.values(distribution).reduce((a, b) => a + b, 0);
  const avgRating = totalReviews > 0
    ? (Object.entries(distribution).reduce((sum, [star, count]) => sum + Number(star) * count, 0) / totalReviews).toFixed(1)
    : '0.0';
  const totalPages = Math.ceil(total / REVIEWS_PER_PAGE);

  if (totalReviews === 0 && reviews.length === 0 && !reputation) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <SectionHeader icon={Star} title="Reviews & Reputation" count={totalReviews} />

      {/* Reputation Stats Row */}
      {reputation && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { value: reputation.score ? reputation.score.toFixed(1) : '--', label: 'Score', color: '#fbbf24' },
            { value: reputation.uniqueReviewers ?? 0, label: 'Reviewers', color: 'var(--text-primary)' },
            { value: reputation.trending === 'up' ? '↑' : reputation.trending === 'down' ? '↓' : '—', label: 'Trend', color: reputation.trending === 'up' ? '#00e6a7' : reputation.trending === 'down' ? '#ef4444' : 'var(--text-muted)' },
            { value: reputation.recentReviews ?? 0, label: 'Last 30d', color: 'var(--text-primary)' },
          ].map(({ value, label, color }) => (
            <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 8px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'var(--font-display)' }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Rating Summary + Distribution Bars */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
        {/* Average */}
        <div style={{ textAlign: 'center', minWidth: 80 }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#fbbf24' }}>{avgRating}</div>
          <div style={{ color: '#fbbf24', fontSize: 16, marginBottom: 2 }}>
            {'★'.repeat(Math.round(Number(avgRating)))}{'☆'.repeat(5 - Math.round(Number(avgRating)))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{totalReviews} review{totalReviews !== 1 ? 's' : ''}</div>
        </div>

        {/* Distribution Bars */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
          {[5, 4, 3, 2, 1].map(star => {
            const count = distribution[star] || 0;
            const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
            const isActive = ratingFilter === star;
            return (
              <button
                key={star}
                onClick={() => handleRatingClick(star)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                  cursor: 'pointer', padding: '2px 0', opacity: ratingFilter && !isActive ? 0.4 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                <span style={{ fontSize: 12, color: isActive ? '#fbbf24' : 'var(--text-muted)', width: 14, textAlign: 'right' }}>{star}</span>
                <Star size={11} style={{ color: isActive ? '#fbbf24' : 'var(--text-muted)', fill: isActive ? '#fbbf24' : 'none' }} />
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-inset)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: isActive ? '#fbbf24' : '#fbbf2480', transition: 'width 0.2s' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 24, textAlign: 'right' }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sybil Flags */}
      {reputation?.sybilFlags?.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 12,
          background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Suspicious Patterns Detected</div>
          {reputation.sybilFlags.map((flag, i) => (
            <div key={i} style={{ fontSize: 11, color: 'rgba(239, 68, 68, 0.8)' }}>
              [{flag.severity}] {flag.description}
            </div>
          ))}
        </div>
      )}

      {/* Confidence + Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        {reputation?.confidence && (
          <span className={`badge ${
            reputation.confidence === 'high' ? 'badge-completed' :
            reputation.confidence === 'medium' ? 'badge-requested' :
            reputation.confidence === 'low' ? 'badge-disputed' : 'badge-cancelled'
          }`}>{reputation.confidence} confidence</span>
        )}
        {ratingFilter && (
          <button
            onClick={() => { setRatingFilter(null); setPage(0); fetchReviews(null, 0); }}
            style={{ fontSize: 12, color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Showing {ratingFilter}-star — clear filter
          </button>
        )}
      </div>

      {/* Review Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
        {reviews.map(review => (
          <div key={review.id} style={{
            background: 'var(--bg-elevated)', borderRadius: 10, padding: 14,
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#fbbf24', fontSize: 14 }}>
                  {'★'.repeat(review.rating || 0)}{'☆'.repeat(5 - (review.rating || 0))}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{review.rating}/5</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {review.verified && (
                  <span style={{ fontSize: 10, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Check size={10} /> verified
                  </span>
                )}
                {review.isPublic === false && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>private</span>
                )}
              </div>
            </div>
            {review.message && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 8px', lineHeight: 1.4 }}>
                {review.message}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {review.buyerVerusId ? (
                  <ResolvedId address={review.buyerVerusId} size="xs" />
                ) : (
                  <span style={{ fontStyle: 'italic' }}>Anonymous</span>
                )}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {review.timestamp ? new Date(review.timestamp * 1000).toLocaleDateString() : ''}
              </span>
            </div>
          </div>
        ))}
        {reviews.length === 0 && !loading && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
            {ratingFilter ? `No ${ratingFilter}-star reviews` : 'No reviews yet'}
          </p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 0}
            style={{
              background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', borderRadius: 6,
              padding: '4px 8px', cursor: page === 0 ? 'default' : 'pointer',
              opacity: page === 0 ? 0.3 : 1, color: 'var(--text-secondary)',
            }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages - 1}
            style={{
              background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', borderRadius: 6,
              padding: '4px 8px', cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              opacity: page >= totalPages - 1 ? 0.3 : 1, color: 'var(--text-secondary)',
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, requireAuth } = useAuth();
  const [agent, setAgent] = useState(null);
  const qualifiedName = agent?.name ? `${agent.name.toLowerCase().replace(/\s+/g, '')}.agentplatform@` : null;
  usePageTitle(agent?.name || 'Agent');
  const [verification, setVerification] = useState(null);
  const [reputation, setReputation] = useState(null);
  const [transparency, setTransparency] = useState(null);
  const [services, setServices] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hireService, setHireService] = useState(null);

  useEffect(() => {
    fetchAgent();
  }, [id]);

  async function fetchAgent() {
    try {
      const [agentRes, verifyRes, repRes, servicesRes, transRes, reviewsRes] = await Promise.all([
        fetch(`${API_BASE}/v1/agents/${encodeURIComponent(id)}`, { credentials: 'include' }),
        fetch(`${API_BASE}/v1/agents/${encodeURIComponent(id)}/verification`, { credentials: 'include' }),
        fetch(`${API_BASE}/v1/reputation/${encodeURIComponent(id)}`, { credentials: 'include' }),
        fetch(`${API_BASE}/v1/services/agent/${encodeURIComponent(id)}`, { credentials: 'include' }),
        fetch(`${API_BASE}/v1/agents/${encodeURIComponent(id)}/transparency`, { credentials: 'include' }).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/v1/reviews/agent/${encodeURIComponent(id)}?limit=10`, { credentials: 'include' }).catch(() => ({ ok: false })),
      ]);

      const agentData = await agentRes.json();
      const verifyData = await verifyRes.json();
      const repData = await repRes.json();
      const servicesData = await servicesRes.json();
      const transData = transRes.ok ? await transRes.json() : {};
      const reviewsData = reviewsRes.ok ? await reviewsRes.json() : {};

      if (agentData.data) setAgent(agentData.data);
      else setError(agentData.error?.message || 'Agent not found');
      if (verifyData.data) setVerification(verifyData.data);
      if (repData.data) setReputation(repData.data);
      if (servicesData.data) setServices(servicesData.data);
      if (transData.data) setTransparency(transData.data);
      if (reviewsData.data) setReviews(reviewsData.data);
    } catch {
      setError('Failed to fetch agent');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-verus-blue"></div>
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (error) {
    const notAgent = /not found/i.test(error);
    if (notAgent) {
      return (
        <div className="max-w-2xl mx-auto py-12">
          <div className="card text-center" style={{ padding: '32px 24px' }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              Not a registered SovAgent
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              This VerusID exists but hasn't published a SovAgent profile. It may be a human
              user who hired a SovAgent, or an identity that hasn't registered yet.
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <ResolvedId address={id} size="sm" />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => navigate(-1)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}>
                Go back
              </button>
              <Link to="/sovagents" className="btn-primary" style={{ padding: '6px 14px', fontSize: 13 }}>
                Browse SovAgents
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <Link to="/sovagents" className="text-verus-blue hover:underline">Back to SovAgents</Link>
      </div>
    );
  }

  if (!agent) return null;

  const tags = agent.tags || [];

  return (
    <div className="page-content" style={{ maxWidth: 1100, margin: '0 auto', overflowX: 'hidden' }}>
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link to="/sovagents" style={{ color: 'var(--text-muted)', fontSize: 13 }} className="hover:text-white transition-colors">
          SovAgents
        </Link>
        <ChevronRight size={14} style={{ display: 'inline', margin: '0 6px', color: 'var(--text-muted)' }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{agent.name}</span>
      </div>

      {/* ═══════ HERO CARD ═══════ */}
      <div className="card" style={{ marginBottom: 24, padding: 'clamp(16px, 4vw, 32px)', position: 'relative', overflow: 'hidden' }}>
        {/* Subtle gradient accent at top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'var(--accent-gradient)', opacity: 0.6,
        }} />

        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <AgentAvatar name={agent.name} verusId={agent.id} size="xl" avatarUrl={agent.avatar} online={agent.online} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <ResolvedId address={agent.id} size="lg" showAddress={false} />
              {agent.online ? (
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                  background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  Online
                </span>
              ) : agent.lastSeenAt ? (
                <span style={{
                  fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 6,
                  background: 'rgba(107, 114, 128, 0.1)', color: '#9ca3af',
                  border: '1px solid rgba(107, 114, 128, 0.2)',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6b7280', display: 'inline-block' }} />
                  Offline
                </span>
              ) : (
                <span className={`badge badge-${agent.status}`}>{agent.status}</span>
              )}
            </div>

            {agent.name && (
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                {agent.name}
                <TrustScore tier={agent.trustTier || 'new'} />
                {agent.workspaceCapable && (
                  <span title="This SovAgent can connect to your local project via JailBox"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500, background: 'rgba(167,139,250,0.08)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.15)' }}>
                    <Terminal size={12} /> JailBox
                  </span>
                )}
              </div>
            )}

            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)' }}>
                  {qualifiedName || `${agent.name}@`}
                </span>
                <CopyButton text={qualifiedName || `${agent.name}@`} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent.id}
                </span>
                <CopyButton text={agent.id} />
              </div>
            </div>

            {agent.description && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>
                {agent.description}
              </p>
            )}

            {/* Tags + Category + Website row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {agent.category && (
                <span style={{
                  fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 6,
                  background: 'rgba(52, 211, 153, 0.1)', color: 'var(--accent-primary)',
                  border: '1px solid rgba(52, 211, 153, 0.15)',
                }}>{agent.category}</span>
              )}
              <span style={{
                fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 6,
                background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)', textTransform: 'capitalize',
              }}>{agent.type}</span>
              {agent.protocols?.map((proto) => (
                <span key={proto} style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5,
                  background: 'rgba(0, 230, 167, 0.08)', color: '#00e6a7',
                  border: '1px solid rgba(0, 230, 167, 0.15)', letterSpacing: '0.02em',
                }}>{proto}</span>
              ))}
              {agent.models?.map((model) => (
                <span key={model} style={{
                  fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 5,
                  background: 'rgba(56, 189, 248, 0.08)', color: '#38BDF8',
                  border: '1px solid rgba(56, 189, 248, 0.15)', fontFamily: 'var(--font-mono)',
                }}>{model}</span>
              ))}
              {agent.website && /^https?:\/\//i.test(agent.website) && (
                <a
                  href={agent.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12, color: 'var(--accent-primary)', display: 'inline-flex',
                    alignItems: 'center', gap: 4, textDecoration: 'none',
                  }}
                  className="hover:underline"
                >
                  <Globe size={13} /> {agent.website.replace(/^https?:\/\//, '')}
                  <ExternalLink size={11} />
                </a>
              )}
            </div>

            {/* Tag pills */}
            {tags.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {tags.map((tag) => (
                  <span key={tag} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    <Tag size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: '-1px' }} />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div style={{
          display: 'flex', gap: '12px 24px', marginTop: 20, paddingTop: 16,
          borderTop: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)',
          flexWrap: 'wrap', overflowWrap: 'anywhere',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={14} style={{ color: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-muted)' }}>Owner:</span>
            <ResolvedId address={agent.owner} size="sm" showAddress={true} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-muted)' }}>Registered:</span>
            <span>{new Date(agent.createdAt).toLocaleDateString()}</span>
          </div>
          {agent.blockHeight > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>Block:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{agent.blockHeight.toLocaleString()}</span>
            </div>
          )}
          {agent.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>i-addr:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{agent.id.slice(0, 12)}...</span>
              <CopyButton text={agent.id} />
            </div>
          )}
          {agent.lastSeenAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>Last seen:</span>
              <span>{formatLastSeen(agent.lastSeenAt)}</span>
            </div>
          )}
          {agent.authorities?.revocation && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>Revocation:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{agent.authorities.revocation.slice(0, 16)}...</span>
              <CopyButton text={agent.authorities.revocation} />
            </div>
          )}
          {agent.authorities?.recovery && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>Recovery:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{agent.authorities.recovery.slice(0, 16)}...</span>
              <CopyButton text={agent.authorities.recovery} />
            </div>
          )}
          {agent.markup != null && agent.markup > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Percent size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Markup:</span>
              <span style={{ fontWeight: 600, color: '#fbbf24' }}>+{agent.markup}%</span>
            </div>
          )}
          {agent.payaddress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wallet size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Pay address:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{agent.payaddress.slice(0, 16)}...</span>
              <CopyButton text={agent.payaddress} />
            </div>
          )}
          {agent.chainVerifiedAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BadgeCheck size={14} style={{ color: '#22c55e' }} />
              <span style={{ color: 'var(--text-muted)' }}>Chain verified:</span>
              <span>{new Date(agent.chainVerifiedAt).toLocaleDateString()}</span>
            </div>
          )}
          {agent.chainReviewCount != null && agent.chainReviewCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link2 size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)' }}>On-chain reviews:</span>
              <span style={{ fontWeight: 600 }}>{agent.chainReviewCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ TWO-COLUMN LAYOUT ═══════ */}
      <div className="agent-detail-grid grid gap-5 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>

        {/* LEFT COLUMN — Main content */}
        <div>
          {/* Services */}
          {services.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <SectionHeader icon={Zap} title="Services" count={services.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {services.map((service) => (
                  <div key={service.id} style={{
                    background: 'var(--bg-elevated)', borderRadius: 10,
                    border: '1px solid var(--border-subtle)', padding: '16px 20px',
                    transition: 'border-color 0.15s ease',
                  }} className="hover:border-[rgba(167,139,250,0.2)]">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{service.name}</h3>
                        {service.description && (
                          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                            {service.description}
                          </p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          {service.category && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Tag size={11} /> {service.category}
                            </span>
                          )}
                          {service.turnaround && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Clock size={11} /> {service.turnaround}
                            </span>
                          )}
                          {(() => {
                            const pt = service.paymentTerms || 'prepay';
                            return (
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                                background: pt === 'prepay' ? 'rgba(251,191,36,0.12)' :
                                  pt === 'postpay' ? 'rgba(74,222,128,0.12)' : 'rgba(96,165,250,0.12)',
                                color: pt === 'prepay' ? '#fbbf24' :
                                  pt === 'postpay' ? '#4ade80' : '#60a5fa',
                              }}>
                                {pt === 'prepay' ? 'Pay upfront' :
                                 pt === 'postpay' ? 'Pay on delivery' : 'Split payment'}
                              </span>
                            );
                          })()}
                          {service.sovguard && (
                            <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: 'rgba(52,211,153,0.08)', color: 'var(--accent)', border: '1px solid rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Shield size={10} /> SovGuard
                            </span>
                          )}
                        </div>
                        {/* Session Limits */}
                        {service.sessionParams && (() => {
                          const sp = service.sessionParams;
                          const hasLimits = sp.duration != null || sp.tokenLimit != null || sp.imageLimit != null || sp.messageLimit != null || sp.maxFileSize != null || sp.allowedFileTypes;
                          if (!hasLimits) return null;
                          return (
                            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Session Limits</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px 12px' }}>
                                {sp.duration != null && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Duration</span>
                                    <span style={{ fontWeight: 500 }}>{formatDuration(sp.duration)}</span>
                                  </div>
                                )}
                                {sp.tokenLimit != null && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Tokens</span>
                                    <span style={{ fontWeight: 500 }}>{sp.tokenLimit.toLocaleString()}</span>
                                  </div>
                                )}
                                {sp.imageLimit != null && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Images</span>
                                    <span style={{ fontWeight: 500 }}>{sp.imageLimit.toLocaleString()}</span>
                                  </div>
                                )}
                                {sp.messageLimit != null && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Messages</span>
                                    <span style={{ fontWeight: 500 }}>{sp.messageLimit.toLocaleString()}</span>
                                  </div>
                                )}
                                {sp.maxFileSize != null && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Max file</span>
                                    <span style={{ fontWeight: 500 }}>{formatBytes(sp.maxFileSize)}</span>
                                  </div>
                                )}
                                {sp.allowedFileTypes && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gridColumn: 'span 2' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>File types</span>
                                    <span style={{ fontWeight: 500, textAlign: 'right' }}>
                                      {Array.isArray(sp.allowedFileTypes)
                                        ? sp.allowedFileTypes.map(t => t.split('/')[1] || t).join(', ')
                                        : sp.allowedFileTypes}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        {/* Lifecycle Config */}
                        {(service.idleTimeout || service.pauseTTL || service.reactivationFee > 0) && (
                          <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.03)', border: '1px solid rgba(251,191,36,0.08)' }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Lifecycle</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px 12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                <span style={{ color: 'var(--text-muted)' }}>Idle timeout</span>
                                <span style={{ fontWeight: 500 }}>{service.idleTimeout || 10} min</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                <span style={{ color: 'var(--text-muted)' }}>Pause TTL</span>
                                <span style={{ fontWeight: 500 }}>{service.pauseTTL || 60} min</span>
                              </div>
                              {service.reactivationFee > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                  <span style={{ color: 'var(--text-muted)' }}>Reactivation</span>
                                  <span style={{ fontWeight: 500, color: '#FBBF24' }}>{service.reactivationFee} {service.currency}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Dispute Terms */}
                        {service.sessionParams && (service.sessionParams.resolutionWindow != null || service.sessionParams.refundPolicy) && (
                          <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 8, background: 'rgba(167,139,250,0.03)', border: '1px solid rgba(167,139,250,0.1)' }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Dispute Terms</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px 12px' }}>
                              {service.sessionParams.resolutionWindow != null && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                  <span style={{ color: 'var(--text-muted)' }}>Resolution</span>
                                  <span style={{ fontWeight: 500 }}>
                                    {service.sessionParams.resolutionWindow >= 1440
                                      ? `${Math.round(service.sessionParams.resolutionWindow / 1440)} day${service.sessionParams.resolutionWindow >= 2880 ? 's' : ''}`
                                      : `${service.sessionParams.resolutionWindow} hr${service.sessionParams.resolutionWindow !== 1 ? 's' : ''}`}
                                  </span>
                                </div>
                              )}
                              {service.sessionParams.refundPolicy && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gridColumn: service.sessionParams.resolutionWindow != null ? 'auto' : 'span 2' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>Refund</span>
                                  <span style={{ fontWeight: 500 }}>{service.sessionParams.refundPolicy}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, marginLeft: 16 }}>
                        {service.serviceType === 'api-endpoint' ? (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#38BDF8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              API Provider
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'right' }}>
                              {service.currency} per 1M tok
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{
                              fontSize: 18, fontWeight: 700, color: 'var(--accent-primary)',
                              fontFamily: 'var(--font-display)',
                            }}>
                              {service.price} <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.7 }}>{service.currency}</span>
                            </div>
                            {service.markup != null && service.markup > 0 && (
                              <span style={{
                                fontSize: 10, fontWeight: 500, color: '#fbbf24', background: 'rgba(251,191,36,0.08)',
                                padding: '1px 6px', borderRadius: 4,
                              }}>+{service.markup}% markup</span>
                            )}
                            <button
                              onClick={() => {
                                if (!user) { requireAuth(); return; }
                                setHireService({ ...service, verusId: agent.id, agentName: agent.name });
                              }}
                              className="btn-primary"
                              style={{ fontSize: 13, padding: '6px 14px' }}
                            >
                              Hire
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {service.serviceType === 'api-endpoint' && (
                      <ApiEndpointPanel service={service} sellerVerusId={agent.id} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capabilities */}
          {agent.capabilities?.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <SectionHeader icon={Zap} title="Capabilities" count={agent.capabilities.length} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {agent.capabilities.map((cap, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-elevated)', borderRadius: 8,
                    border: '1px solid var(--border-subtle)', padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{cap.name}</span>
                      {cap.protocol && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(0, 230, 167, 0.08)', color: '#00e6a7',
                          border: '1px solid rgba(0, 230, 167, 0.15)',
                        }}>{cap.protocol}</span>
                      )}
                    </div>
                    {cap.description && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                        {cap.description}
                      </p>
                    )}
                    {cap.endpoint && (
                      <p style={{
                        fontSize: 11, marginTop: 6, marginBottom: 0, color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{cap.endpoint}</p>
                    )}
                    {cap.pricing && (
                      <div style={{ marginTop: 6 }}>
                        {cap.pricing.model === 'free' ? (
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
                            background: 'rgba(0, 230, 167, 0.1)', color: '#00e6a7',
                          }}>Free</span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {cap.pricing.amount} {cap.pricing.currency} / {cap.pricing.model === 'per_call' ? 'call' : cap.pricing.model}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Endpoints */}
          {agent.endpoints?.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <SectionHeader icon={Server} title="Endpoints" count={agent.endpoints.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agent.endpoints.map((ep, i) => {
                  const epVerify = verification?.endpoints?.find(v => v.endpointId === ep.id);
                  return (
                    <div key={i} style={{
                      background: 'var(--bg-elevated)', borderRadius: 8,
                      border: '1px solid var(--border-subtle)', padding: '12px 16px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{ep.url}</span>
                        <CopyButton text={ep.url} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12, flexShrink: 0 }}>
                        {ep.protocol && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                          }}>{ep.protocol}</span>
                        )}
                        {ep.verified ? (
                          <span style={{ fontSize: 11, color: '#00e6a7', fontWeight: 500 }}>Verified</span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{epVerify?.status || 'Pending'}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reviews & Reputation — combined section */}
          <ReviewsSection key={id} agentId={id} reviews={reviews} reputation={reputation} />
        </div>

        {/* RIGHT COLUMN — Sidebar */}
        <div>
          {/* Quick Stats */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>Quick Stats</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Services</span>
                <span style={{ fontWeight: 600 }}>{services.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Capabilities</span>
                <span style={{ fontWeight: 600 }}>{agent.capabilities?.length || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Endpoints</span>
                <span style={{ fontWeight: 600 }}>{agent.endpoints?.length || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Protocols</span>
                <span style={{ fontWeight: 600 }}>{agent.protocols?.length || 0}</span>
              </div>
              {reputation && (
                <>
                  <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Rating</span>
                    <span style={{ fontWeight: 600, color: '#fbbf24' }}>
                      {reputation.score ? `${reputation.score.toFixed(1)} / 5` : '--'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Reviews</span>
                    <span style={{ fontWeight: 600 }}>{reputation.totalReviews}</span>
                  </div>
                </>
              )}
              {(agent.markup != null || agent.chainReviewCount > 0 || agent.chainVerifiedAt || agent.payaddress) && (
                <>
                  <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />
                  {agent.markup != null && agent.markup > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Markup</span>
                      <span style={{ fontWeight: 600, color: '#fbbf24' }}>+{agent.markup}%</span>
                    </div>
                  )}
                  {agent.chainReviewCount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>On-chain reviews</span>
                      <span style={{ fontWeight: 600 }}>{agent.chainReviewCount}</span>
                    </div>
                  )}
                  {agent.chainVerifiedAt && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Chain verified</span>
                      <span style={{ fontWeight: 500, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <BadgeCheck size={12} /> {new Date(agent.chainVerifiedAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {agent.payaddress && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Pay address</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{agent.payaddress.slice(0, 10)}...</span>
                        <CopyButton text={agent.payaddress} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Transparency */}
          <div style={{ marginBottom: 20 }}>
            <TransparencyCard verusId={agent.id} />
          </div>

          {/* Dispute Track Record */}
          <div style={{ marginBottom: 20 }}>
            <DisputeMetrics verusId={agent.id} />
          </div>

          {/* Data Policy */}
          <div style={{ marginBottom: 20 }}>
            <DataPolicyBadge verusId={agent.id} />
          </div>

          {/* On-Chain Declarations */}
          {(agent.declaredDataPolicy || agent.declaredTrustLevel || agent.declaredDisputeResolution) && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={14} style={{ color: 'var(--accent-primary)' }} />
                On-Chain Declarations
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agent.declaredDataPolicy && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Data Policy</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: agent.declaredDataPolicy === 'ephemeral' ? 'rgba(0, 230, 167, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                      color: agent.declaredDataPolicy === 'ephemeral' ? '#00e6a7' : '#fbbf24',
                    }}>{agent.declaredDataPolicy}</span>
                  </div>
                )}
                {agent.declaredTrustLevel && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Trust Level</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: agent.declaredTrustLevel === 'verified' ? 'rgba(0, 230, 167, 0.1)' : 'rgba(52, 211, 153, 0.1)',
                      color: agent.declaredTrustLevel === 'verified' ? '#00e6a7' : 'var(--accent-primary)',
                    }}>{agent.declaredTrustLevel}</span>
                  </div>
                )}
                {agent.declaredDisputeResolution && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Disputes</span>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
                      background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                    }}>{agent.declaredDisputeResolution}</span>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Self-declared on-chain via VDXF keys
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hire Modal */}
      {hireService && (
        <HireModal
          key={hireService.id}
          service={hireService}
          agent={{ name: agent.name, id: agent.id }}
          onClose={() => setHireService(null)}
          onSuccess={(job) => navigate(`/jobs/${job.id}`)}
        />
      )}
    </div>
  );
}
