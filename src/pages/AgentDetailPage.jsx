import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import HireModal from '../components/HireModal';
import ResolvedId from '../components/ResolvedId';
import TrustBadge from '../components/TrustBadge';
import TransparencyCard from '../components/TransparencyCard';
import DataPolicyBadge from '../components/DataPolicyBadge';
import AgentAvatar from '../components/AgentAvatar';
import usePageTitle from '../hooks/usePageTitle';
import {
  Globe, ExternalLink, Tag, Calendar, Shield, Zap,
  Server, Star, Clock, ChevronRight, Copy, Check
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
      className="text-gray-500 hover:text-gray-300 transition-colors"
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

export default function AgentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, requireAuth } = useAuth();
  const [agent, setAgent] = useState(null);
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
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <Link to="/marketplace" className="text-verus-blue hover:underline">Back to marketplace</Link>
      </div>
    );
  }

  if (!agent) return null;

  const tags = agent.tags || [];

  return (
    <div className="page-content" style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link to="/marketplace" style={{ color: 'var(--text-muted)', fontSize: 13 }} className="hover:text-white transition-colors">
          Marketplace
        </Link>
        <ChevronRight size={14} style={{ display: 'inline', margin: '0 6px', color: 'var(--text-muted)' }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{agent.name}</span>
      </div>

      {/* ═══════ HERO CARD ═══════ */}
      <div className="card" style={{ marginBottom: 24, padding: '28px 32px', position: 'relative', overflow: 'hidden' }}>
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
              {transparency && <TrustBadge level={transparency.trustLevel} score={transparency.trustScore} />}
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
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                {agent.name}
              </div>
            )}

            <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
              {agent.id}
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
              {agent.website && (
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
          display: 'flex', gap: 24, marginTop: 20, paddingTop: 16,
          borderTop: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)',
          flexWrap: 'wrap',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>Block:</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{agent.blockHeight}</span>
          </div>
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
        </div>
      </div>

      {/* ═══════ TWO-COLUMN LAYOUT ═══════ */}
      <div className="agent-detail-grid grid gap-5 items-start" style={{ gridTemplateColumns: '1fr 340px' }}>

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
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Shield size={10} /> SovGuard
                            </span>
                          )}
                        </div>
                        {service.sessionParams && Object.keys(service.sessionParams).length > 0 && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                            {service.sessionParams.duration != null && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>
                                {formatDuration(service.sessionParams.duration)} session
                              </span>
                            )}
                            {service.sessionParams.tokenLimit != null && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>
                                {service.sessionParams.tokenLimit.toLocaleString()} tokens
                              </span>
                            )}
                            {service.sessionParams.imageLimit != null && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>
                                {service.sessionParams.imageLimit.toLocaleString()} images
                              </span>
                            )}
                            {service.sessionParams.messageLimit != null && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>
                                {service.sessionParams.messageLimit.toLocaleString()} msgs
                              </span>
                            )}
                            {service.sessionParams.maxFileSize != null && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>
                                {formatBytes(service.sessionParams.maxFileSize)} max file
                              </span>
                            )}
                            {service.sessionParams.allowedFileTypes && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>
                                {Array.isArray(service.sessionParams.allowedFileTypes)
                                  ? service.sessionParams.allowedFileTypes.map(t => t.split('/')[1] || t).join(', ')
                                  : service.sessionParams.allowedFileTypes}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, marginLeft: 16 }}>
                        <div style={{
                          fontSize: 18, fontWeight: 700, color: 'var(--accent-primary)',
                          fontFamily: 'var(--font-display)',
                        }}>
                          {service.price} <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.7 }}>{service.currency}</span>
                        </div>
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
                      </div>
                    </div>
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

          {/* Reputation (full) */}
          {reputation && (
            <div className="card" style={{ marginBottom: 20 }}>
              <SectionHeader icon={Star} title="Reputation" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                <div style={{
                  background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, textAlign: 'center',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#fbbf24', fontFamily: 'var(--font-display)' }}>
                    {reputation.score ? reputation.score.toFixed(1) : '--'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Star size={12} fill="#fbbf24" stroke="#fbbf24" /> Score
                  </div>
                </div>
                <div style={{
                  background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, textAlign: 'center',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{reputation.totalReviews}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reviews</div>
                </div>
                <div style={{
                  background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, textAlign: 'center',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{reputation.uniqueReviewers}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reviewers</div>
                </div>
                <div style={{
                  background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, textAlign: 'center',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{
                    fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-display)',
                    color: reputation.trending === 'up' ? '#00e6a7' : reputation.trending === 'down' ? '#ef4444' : 'var(--text-muted)',
                  }}>
                    {reputation.trending === 'up' ? '+' : reputation.trending === 'down' ? '-' : '--'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Trend</div>
                </div>
              </div>

              {/* Rating Distribution */}
              {reputation.transparency?.reviewDistribution && (
                <div style={{
                  background: 'var(--bg-elevated)', borderRadius: 10, padding: 16,
                  border: '1px solid var(--border-subtle)', marginBottom: 12,
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{reputation.transparency.note}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[5, 4, 3, 2, 1].map((rating) => {
                      const dist = reputation.transparency.reviewDistribution.find(d => d.rating === rating);
                      const count = dist?.count || 0;
                      const pct = reputation.totalReviews > 0 ? (count / reputation.totalReviews) * 100 : 0;
                      return (
                        <div key={rating} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 24, textAlign: 'right' }}>{rating}</span>
                          <Star size={12} fill="#fbbf24" stroke="#fbbf24" />
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 3, width: `${pct}%`,
                              background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                              transition: 'width 0.5s ease',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 20, textAlign: 'right' }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sybil Flags */}
              {reputation.sybilFlags?.length > 0 && (
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

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: 12, borderTop: '1px solid var(--border-subtle)',
              }}>
                <span className={`badge ${
                  reputation.confidence === 'high' ? 'badge-completed' :
                  reputation.confidence === 'medium' ? 'badge-requested' :
                  reputation.confidence === 'low' ? 'badge-disputed' : 'badge-cancelled'
                }`}>{reputation.confidence} confidence</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {reputation.recentReviews} reviews in last 30 days
                </span>
              </div>
            </div>
          )}

          {/* Individual Reviews */}
          {reviews.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <SectionHeader icon={Star} title="Reviews" count={reviews.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              </div>
            </div>
          )}
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
            </div>
          </div>

          {/* Transparency */}
          <div style={{ marginBottom: 20 }}>
            <TransparencyCard verusId={agent.id} />
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
