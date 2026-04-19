import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Award, Clock, Users, Filter, Plus, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PostBountyModal from '../components/PostBountyModal';
import { apiFetch } from '../utils/api';
const PAGE_SIZE = 12;

function timeRemaining(deadline) {
  if (!deadline) return null;
  const diff = new Date(deadline) - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${mins}m left`;
}

const STATUS_COLORS = {
  open: { bg: 'rgba(52,211,153,0.12)', color: '#34D399', border: 'rgba(52,211,153,0.2)' },
  reviewing: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24', border: 'rgba(251,191,36,0.2)' },
  awarded: { bg: 'rgba(56,189,248,0.12)', color: '#38BDF8', border: 'rgba(56,189,248,0.2)' },
  expired: { bg: 'rgba(148,163,184,0.12)', color: '#94A3B8', border: 'rgba(148,163,184,0.2)' },
  cancelled: { bg: 'rgba(248,113,113,0.12)', color: '#F87171', border: 'rgba(248,113,113,0.2)' },
};

export default function BountiesPage() {
  const { user, requireAuth } = useAuth();
  const [bounties, setBounties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [categories, setCategories] = useState([]);
  const [fetchError, setFetchError] = useState(null);

  // Load categories
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/v1/services/categories');
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const cats = (data.data || []).map(c => typeof c === 'string' ? c : c.name);
          setCategories(cats);
        }
      } catch {}
    })();
  }, []);

  const fetchBounties = useCallback(async (newOffset = 0) => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(newOffset),
      });
      if (selectedCategory) params.set('category', selectedCategory);

      const res = await apiFetch(`/v1/bounties?${params}`);
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setBounties(data.data || []);
        setTotal(data.meta?.total || 0);
        setHasMore(data.meta?.hasMore || false);
        setOffset(newOffset);
      }
    } catch {
      setFetchError('Failed to load bounties. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchBounties(0);
  }, [fetchBounties]);

  function handlePostClick() {
    if (!user) {
      requireAuth();
      return;
    }
    setShowModal(true);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>Bounties</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 15 }}>
              Open tasks anyone can claim — post a bounty or apply to earn
            </p>
          </div>
          <button
            onClick={handlePostClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent-gradient)',
              color: '#000',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            <Plus size={16} /> Post a Bounty
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedCategory('')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: `1px solid ${!selectedCategory ? 'var(--accent-primary)' : 'var(--border-default)'}`,
              background: !selectedCategory ? 'rgba(52,211,153,0.1)' : 'transparent',
              color: !selectedCategory ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: `1px solid ${selectedCategory === cat ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                background: selectedCategory === cat ? 'rgba(52,211,153,0.1)' : 'transparent',
                color: selectedCategory === cat ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Bounty Grid */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 64px' }}>
        {fetchError && (
          <div style={{ textAlign: 'center', padding: 16, marginBottom: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, color: '#F87171', fontSize: 14 }}>
            {fetchError}
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-tertiary)' }}>Loading bounties...</div>
        ) : bounties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <Award size={48} style={{ color: 'var(--text-tertiary)', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: 16 }}>No open bounties yet</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginTop: 8 }}>Be the first to post one!</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {bounties.map(bounty => {
                const status = STATUS_COLORS[bounty.status] || STATUS_COLORS.open;
                const remaining = timeRemaining(bounty.application_deadline);

                return (
                  <Link
                    key={bounty.id}
                    to={`/bounties/${bounty.id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div
                      className="card"
                      style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
                    >
                      {/* Top row: title + amount */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0, flex: 1, lineHeight: 1.3 }}>
                          {bounty.title}
                        </h3>
                        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>
                          {bounty.amount} {bounty.currency}
                        </span>
                      </div>

                      {/* Description preview */}
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {bounty.description}
                      </p>

                      {/* Meta row */}
                      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {/* Status badge */}
                        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: status.bg, color: status.color, border: `1px solid ${status.border}` }}>
                          {bounty.status}
                        </span>

                        {/* Category */}
                        {bounty.category && (
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4 }}>
                            {bounty.category}
                          </span>
                        )}

                        {/* Applicants */}
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Users size={12} /> {bounty.application_count || 0} applicant{(bounty.application_count || 0) !== 1 ? 's' : ''}
                        </span>

                        {/* Deadline */}
                        {remaining && (
                          <span style={{ fontSize: 12, color: remaining === 'Ended' ? '#F87171' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                            <Clock size={12} /> {remaining}
                          </span>
                        )}
                        {!remaining && !bounty.application_deadline && (
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                            <Clock size={12} /> Open
                          </span>
                        )}

                        {/* Qualification badges */}
                        {(bounty.min_reviews || bounty.min_trust_tier || bounty.required_category) && (
                          <span style={{ fontSize: 11, color: 'var(--accent-warm)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Filter size={10} /> Qualified
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Pagination */}
            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: 32 }}>
                <button
                  onClick={() => fetchBounties(offset + PAGE_SIZE)}
                  style={{
                    padding: '10px 28px',
                    borderRadius: 8,
                    border: '1px solid var(--border-default)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Load More
                </button>
              </div>
            )}

            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, marginTop: 12 }}>
              Showing {bounties.length} of {total} bounties
            </p>
          </>
        )}
      </div>

      {/* Post Bounty Modal */}
      <PostBountyModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => fetchBounties(0)}
      />
    </div>
  );
}
