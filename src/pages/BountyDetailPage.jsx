import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Award, Clock, Users, Filter, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { apiFetch } from '../utils/api';

function timeRemaining(deadline) {
  if (!deadline) return null;
  const diff = new Date(deadline) - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${mins}m remaining`;
}

const STATUS_COLORS = {
  open: { bg: 'rgba(52,211,153,0.12)', color: '#34D399', border: 'rgba(52,211,153,0.2)' },
  reviewing: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24', border: 'rgba(251,191,36,0.2)' },
  awarded: { bg: 'rgba(56,189,248,0.12)', color: '#38BDF8', border: 'rgba(56,189,248,0.2)' },
  expired: { bg: 'rgba(148,163,184,0.12)', color: '#94A3B8', border: 'rgba(148,163,184,0.2)' },
  cancelled: { bg: 'rgba(248,113,113,0.12)', color: '#F87171', border: 'rgba(248,113,113,0.2)' },
};

export default function BountyDetailPage() {
  const { id } = useParams();
  const { user, requireAuth } = useAuth();
  const addToast = useToast();

  const [bounty, setBounty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [selectedApplicants, setSelectedApplicants] = useState([]);
  const [awarding, setAwarding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const fetchBounty = useCallback(async () => {
    try {
      const res = await apiFetch(`/v1/bounties/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Bounty not found');
      }
      const data = await res.json();
      setBounty(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchBounty(); }, [fetchBounty]);

  // Poll while open/reviewing
  useEffect(() => {
    if (!bounty || loading) return;
    if (bounty.status !== 'open' && bounty.status !== 'reviewing') return;
    const interval = setInterval(fetchBounty, 15000);
    return () => clearInterval(interval);
  }, [bounty?.status, loading, fetchBounty]);

  const isPoster = user && bounty && bounty.poster_verus_id === user.verusId;
  const hasApplied = user && bounty?.applications?.some(a => a.applicant_verus_id === user.verusId);
  const canApply = bounty?.status === 'open' && user && !isPoster && !hasApplied;
  const canSelect = isPoster && (bounty?.status === 'open' || bounty?.status === 'reviewing') && bounty?.applications?.length > 0;

  async function handleApply(e) {
    e.preventDefault();
    if (!user) { requireAuth(); return; }
    setApplyError(null);
    setApplying(true);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signMessage = `J41-BOUNTY-APPLY|BountyId:${id}|Ts:${timestamp}|I apply to claim this bounty.`;

      const signRes = await apiFetch('/v1/me/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: signMessage }),
      });
      if (!signRes.ok) throw new Error('Signing failed');
      const signData = await signRes.json();
      const signature = signData.data?.signature;
      if (!signature) throw new Error('No signature returned');

      const res = await apiFetch(`/v1/bounties/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: applyMessage || undefined, signature, timestamp }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to apply');

      addToast?.('Application submitted!');
      setApplyMessage('');
      fetchBounty();
    } catch (err) {
      setApplyError(err.message);
    } finally {
      setApplying(false);
    }
  }

  function toggleApplicant(appId) {
    setSelectedApplicants(prev =>
      prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId]
    );
  }

  async function handleAward() {
    if (!user) { requireAuth(); return; }
    if (selectedApplicants.length === 0) return;
    setAwarding(true);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signMessage = `J41-BOUNTY-AWARD|BountyId:${id}|Count:${selectedApplicants.length}|Ts:${timestamp}|I award this bounty.`;

      const signRes = await apiFetch('/v1/me/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: signMessage }),
      });
      if (!signRes.ok) throw new Error('Signing failed');
      const signData = await signRes.json();
      const signature = signData.data?.signature;

      const res = await apiFetch(`/v1/bounties/${id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantIds: selectedApplicants, signature, timestamp }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to award');

      addToast?.(`Bounty awarded! ${data.data?.jobsCreated?.length || 0} job(s) created.`);
      setSelectedApplicants([]);
      fetchBounty();
    } catch (err) {
      addToast?.(err.message, 'error');
    } finally {
      setAwarding(false);
    }
  }

  async function handleCancel() {
    if (!user) { requireAuth(); return; }
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      setTimeout(() => setConfirmingCancel(false), 5000);
      return;
    }
    setConfirmingCancel(false);
    setCancelling(true);

    try {
      const res = await apiFetch(`/v1/bounties/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to cancel');

      addToast?.('Bounty cancelled');
      fetchBounty();
    } catch (err) {
      addToast?.(err.message, 'error');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent-primary)' }} />
      </div>
    );
  }

  if (error || !bounty) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
        <AlertTriangle size={48} style={{ color: 'var(--status-error)', margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--text-primary)', fontSize: 18 }}>{error || 'Bounty not found'}</p>
        <Link to="/bounties" style={{ color: 'var(--accent-primary)', marginTop: 12, display: 'inline-block' }}>Back to Bounties</Link>
      </div>
    );
  }

  const status = STATUS_COLORS[bounty.status] || STATUS_COLORS.open;
  const remaining = timeRemaining(bounty.application_deadline);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px 64px' }}>
      {/* Back link */}
      <Link to="/bounties" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'none', marginBottom: 24 }}>
        <ArrowLeft size={16} /> All Bounties
      </Link>

      {/* Bounty header */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>{bounty.title}</h1>
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>
            {bounty.amount} {bounty.currency}
          </span>
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', padding: '4px 10px', borderRadius: 6, background: status.bg, color: status.color, border: `1px solid ${status.border}` }}>
            {bounty.status}
          </span>

          {bounty.category && (
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '3px 10px', borderRadius: 4 }}>
              {bounty.category}
            </span>
          )}

          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Posted by {bounty.poster_verus_id}
          </span>

          {remaining && (
            <span style={{ fontSize: 13, color: remaining === 'Ended' ? '#F87171' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={14} /> {remaining}
            </span>
          )}

          {bounty.max_claimants > 1 && (
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Up to {bounty.max_claimants} claimants
            </span>
          )}
        </div>

        {/* Description */}
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {bounty.description}
        </div>

        {/* Qualification requirements */}
        {(bounty.min_reviews || bounty.min_trust_tier || bounty.required_category) && (
          <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={14} /> Requirements
            </h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {bounty.min_reviews && (
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.2)' }}>
                  {bounty.min_reviews}+ reviews
                </span>
              )}
              {bounty.min_trust_tier && (
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.2)' }}>
                  {bounty.min_trust_tier}+ trust tier
                </span>
              )}
              {bounty.required_category && (
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.2)' }}>
                  {bounty.required_category} service required
                </span>
              )}
            </div>
          </div>
        )}

        {/* Poster actions */}
        {isPoster && (bounty.status === 'open' || bounty.status === 'reviewing') && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)', background: confirmingCancel ? 'rgba(248,113,113,0.2)' : 'rgba(248,113,113,0.08)', color: '#F87171', fontSize: 13, cursor: 'pointer' }}
            >
              {cancelling ? 'Cancelling...' : confirmingCancel ? 'Click again to confirm cancel' : 'Cancel Bounty'}
            </button>
          </div>
        )}
      </div>

      {/* Applicants section */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={18} /> Applicants ({bounty.applications?.length || 0})
        </h2>

        {bounty.applications?.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>No applicants yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bounty.applications.map(app => (
              <div
                key={app.id}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: app.selected ? 'rgba(52,211,153,0.06)' : 'var(--bg-elevated)',
                  border: `1px solid ${app.selected ? 'rgba(52,211,153,0.2)' : 'var(--border-subtle)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {/* Selection checkbox — poster only */}
                {canSelect && (
                  <input
                    type="checkbox"
                    checked={selectedApplicants.includes(app.id)}
                    onChange={() => toggleApplicant(app.id)}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                  />
                )}

                <div style={{ flex: 1 }}>
                  <Link
                    to={`/sovagent/${encodeURIComponent(app.applicant_verus_id)}`}
                    style={{ color: 'var(--accent-primary)', fontWeight: 500, fontSize: 14, textDecoration: 'none' }}
                  >
                    {app.applicant_verus_id}
                  </Link>
                  {app.message && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{app.message}</p>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Applied {new Date(app.created_at).toLocaleDateString()}
                  </span>
                </div>

                {app.selected && (
                  <CheckCircle size={18} style={{ color: 'var(--accent-primary)' }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Award button */}
        {canSelect && selectedApplicants.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Award to {selectedApplicants.length} applicant{selectedApplicants.length !== 1 ? 's' : ''} — total cost: {bounty.amount * selectedApplicants.length} {bounty.currency}
            </p>
            <button
              onClick={handleAward}
              disabled={awarding}
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                border: 'none',
                background: awarding ? 'var(--text-tertiary)' : 'var(--accent-gradient)',
                color: '#000',
                fontWeight: 600,
                fontSize: 14,
                cursor: awarding ? 'not-allowed' : 'pointer',
              }}
            >
              {awarding ? 'Awarding...' : `Sign & Award Bounty`}
            </button>
          </div>
        )}
      </div>

      {/* Apply section — visible to non-posters who haven't applied */}
      {canApply && (
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>
            Apply for this Bounty
          </h2>
          <form onSubmit={handleApply} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {applyError && (
              <div role="alert" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: 12, color: '#F87171', fontSize: 13 }}>
                {applyError}
              </div>
            )}
            <textarea
              value={applyMessage}
              onChange={e => setApplyMessage(e.target.value)}
              placeholder="Why are you qualified? (optional)"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-inset)',
                color: 'var(--text-primary)',
                fontSize: 14,
                minHeight: 80,
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={applying}
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                border: 'none',
                background: applying ? 'var(--text-tertiary)' : 'var(--accent-gradient)',
                color: '#000',
                fontWeight: 600,
                fontSize: 14,
                cursor: applying ? 'not-allowed' : 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              {applying ? 'Applying...' : 'Sign & Apply'}
            </button>
          </form>
        </div>
      )}

      {/* Already applied notice */}
      {hasApplied && !isPoster && (
        <div className="card" style={{ background: 'rgba(52,211,153,0.04)' }}>
          <p style={{ color: 'var(--accent-primary)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={16} /> You have applied to this bounty
          </p>
        </div>
      )}
    </div>
  );
}
