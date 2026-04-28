import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, Trash2, ExternalLink, Activity, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import AgentAvatar from '../components/AgentAvatar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { SkeletonList, EmptyState } from '../components/Skeleton';
import usePageTitle from '../hooks/usePageTitle';

const API_BASE = import.meta.env.VITE_API_URL || '';

function formatRelative(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatExpires(iso) {
  if (!iso) return 'no expiry';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'no expiry';
  const diff = Math.floor((t - Date.now()) / 1000);
  if (diff < 0) return 'expired';
  if (diff < 3600) return `expires in ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `expires in ${Math.floor(diff / 3600)}h`;
  return `expires ${new Date(iso).toLocaleDateString()}`;
}

function StatCard({ label, value, accent }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || 'var(--text-primary)', marginTop: 4, fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
    </div>
  );
}

function SellerRow({ seller, sessions, onRevoke, revoking, expanded, onToggle, totals }) {
  const t = totals || {};
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 text-left"
        style={{ padding: '16px 18px', background: 'transparent', border: 'none' }}
      >
        <AgentAvatar name={seller.sellerName || seller.sellerVerusId} verusId={seller.sellerVerusId} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {seller.sellerName || seller.sellerVerusId}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)' }}>
              API
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {seller.sellerVerusId}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {t.totalInputTokens != null ? `${(t.totalInputTokens + t.totalOutputTokens).toLocaleString()} tok` : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {t.totalCostVrsc != null ? `${Number(t.totalCostVrsc).toFixed(6)}` : '0'} spent
          </div>
        </div>
        <div style={{ marginLeft: 8, color: 'var(--text-tertiary)' }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '14px 18px' }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-xs">
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Granted: </span>
              <span style={{ color: 'var(--text-primary)' }}>{formatRelative(seller.exchangedAt)}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Expires: </span>
              <span style={{ color: 'var(--text-primary)' }}>{formatExpires(seller.expiresAt)}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Sessions: </span>
              <span style={{ color: 'var(--text-primary)' }}>{sessions?.length || 0}</span>
            </div>
          </div>

          {sessions && sessions.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>Session</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>Started</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>Last Activity</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>Input tok</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>Output tok</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>Cost</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} style={{ color: 'var(--text-secondary)' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{s.id.slice(0, 8)}…</td>
                      <td style={{ padding: '6px 8px' }}>{formatRelative(s.startedAt)}</td>
                      <td style={{ padding: '6px 8px' }}>{formatRelative(s.lastActivityAt)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{(s.totalInputTokens ?? 0).toLocaleString()}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{(s.totalOutputTokens ?? 0).toLocaleString()}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Number(s.totalCostVrsc ?? 0).toFixed(6)}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                          background: s.status === 'active' ? 'rgba(52,211,153,0.1)' : s.status === 'idle' ? 'rgba(251,191,36,0.1)' : 'rgba(120,120,120,0.1)',
                          color: s.status === 'active' ? '#34D399' : s.status === 'idle' ? '#fbbf24' : 'var(--text-tertiary)',
                        }}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>
              No sessions yet for this provider. Sessions appear here after your first proxied request.
            </div>
          )}

          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <Link
              to={`/sovagent/${encodeURIComponent(seller.sellerVerusId)}`}
              className="text-xs inline-flex items-center gap-1"
              style={{ color: '#38BDF8' }}
            >
              View provider <ExternalLink size={11} />
            </Link>
            <button
              onClick={onRevoke}
              disabled={revoking}
              className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.06)', color: '#F87171', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <Trash2 size={11} /> {revoking ? 'Revoking…' : 'Revoke access'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApiAccessPage() {
  usePageTitle('API Access');
  const { user } = useAuth();
  const addToast = useToast();
  const [grants, setGrants] = useState([]);
  const [usageBySeller, setUsageBySeller] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [grantsRes, usageRes] = await Promise.all([
        fetch(`${API_BASE}/v1/me/api-access`, { credentials: 'include' }),
        fetch(`${API_BASE}/v1/me/usage`, { credentials: 'include' }),
      ]);
      if (!grantsRes.ok) {
        const j = await grantsRes.json().catch(() => ({}));
        throw new Error(j.error?.message || `Failed to load grants (${grantsRes.status})`);
      }
      const grantsJson = await grantsRes.json();
      setGrants(grantsJson.data || []);

      // Aggregate usage per seller. Don't silently hide an auth/server error
      // here — if grants loaded but usage didn't, we want the user to know
      // the spend totals on screen are not reliable.
      const map = {};
      if (usageRes.ok) {
        const usageJson = await usageRes.json();
        for (const row of usageJson.data || []) {
          const key = row.sellerVerusId;
          if (!map[key]) {
            map[key] = {
              sessions: [],
              totalInputTokens: 0,
              totalOutputTokens: 0,
              totalCostVrsc: 0,
            };
          }
          map[key].sessions.push(row);
          map[key].totalInputTokens += Number(row.totalInputTokens ?? 0);
          map[key].totalOutputTokens += Number(row.totalOutputTokens ?? 0);
          map[key].totalCostVrsc += Number(row.totalCostVrsc ?? 0);
        }
      } else {
        const j = await usageRes.json().catch(() => ({}));
        throw new Error(j.error?.message || `Failed to load usage (${usageRes.status})`);
      }
      setUsageBySeller(map);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function executeRevoke() {
    const grant = confirmRevoke;
    setConfirmRevoke(null);
    if (!grant) return;
    setRevoking(grant.id);
    try {
      const res = await fetch(`${API_BASE}/v1/me/api-access/${encodeURIComponent(grant.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message || 'Failed to revoke');
      }
      addToast?.('Access revoked');
      fetchAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setRevoking(null);
    }
  }

  const totals = Object.values(usageBySeller).reduce((acc, s) => ({
    sessions: acc.sessions + s.sessions.length,
    tokens: acc.tokens + s.totalInputTokens + s.totalOutputTokens,
    cost: acc.cost + s.totalCostVrsc,
  }), { sessions: 0, tokens: 0, cost: 0 });

  if (loading) {
    return (
      <div role="status" aria-label="Loading">
        <SkeletonList count={3} lines={2} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Cpu size={22} style={{ color: '#38BDF8' }} />
          API Access
        </h1>
        <p className="text-gray-400 mt-1 text-sm">
          API providers you've requested access to. The dispatcher's credit meter is authoritative — these stats are J41's shadow log for cross-seller visibility.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {grants.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Active grants" value={grants.length} accent="#38BDF8" />
          <StatCard label="Total tokens used" value={totals.tokens.toLocaleString()} />
          <StatCard label="Total spent (VRSC)" value={totals.cost.toFixed(6)} />
        </div>
      )}

      {grants.length === 0 ? (
        <EmptyState
          icon={<Cpu size={32} style={{ color: '#38BDF8' }} />}
          title="No API providers yet"
          message="Find an OpenAI-compatible endpoint, request access via the SDK, and your active grants will appear here."
          action={
            <Link
              to="/sovagents?serviceType=api-endpoint"
              className="btn-primary inline-flex items-center gap-2"
            >
              <Cpu size={14} /> Browse API Providers
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {grants.map((g) => (
            <SellerRow
              key={g.id}
              seller={g}
              sessions={usageBySeller[g.sellerVerusId]?.sessions}
              totals={usageBySeller[g.sellerVerusId]}
              expanded={expanded === g.id}
              onToggle={() => setExpanded(expanded === g.id ? null : g.id)}
              onRevoke={() => setConfirmRevoke(g)}
              revoking={revoking === g.id}
            />
          ))}
        </div>
      )}

      {confirmRevoke && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0e14] rounded-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Revoke API access</h3>
            <p className="text-gray-300 text-sm">
              Stop using <span className="font-medium text-white">{confirmRevoke.sellerName || confirmRevoke.sellerVerusId}</span>?
              Junction41 marks the grant as revoked and notifies the seller's dispatcher via a signed webhook so it can invalidate your API key. If the dispatcher is offline the notification will retry automatically.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRevoke(null)}
                className="flex-1 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.08] text-white rounded-lg font-medium transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={executeRevoke}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
