import { useState, useEffect, useCallback } from 'react';
import { Award, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PostBountyModal from '../components/PostBountyModal';
import VerticalSwitcher from '../components/VerticalSwitcher';
import BountyCard from '../components/marketplace/BountyCard';
import { apiFetch } from '../utils/api';
const PAGE_SIZE = 12;

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
      {/* Marketplace vertical switcher (sovagents / sovbounties / …) */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 0' }}>
        <VerticalSwitcher />
      </div>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 0' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {bounties.map(bounty => (
                <BountyCard key={bounty.id} bounty={bounty} />
              ))}
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
