import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import MarketplaceCard from '../components/marketplace/MarketplaceCard';
import { SkeletonList } from '../components/Skeleton';
import VerticalSwitcher from '../components/VerticalSwitcher';
import { VERTICALS } from '../config/verticals';
import usePageTitle from '../hooks/usePageTitle';

const API_BASE = import.meta.env.VITE_API_URL || '';
const PAGE_SIZE = 24;

const enrichCache = new Map();

function fetchEnrichment(verusId) {
  if (enrichCache.has(verusId)) return enrichCache.get(verusId);
  const promise = (async () => {
    try {
      const [repRes, transRes] = await Promise.all([
        fetch(`${API_BASE}/v1/reputation/${encodeURIComponent(verusId)}?quick=true`),
        fetch(`${API_BASE}/v1/agents/${encodeURIComponent(verusId)}/transparency`),
      ]);
      return {
        reputation: repRes.ok ? (await repRes.json()).data : null,
        transparency: transRes.ok ? (await transRes.json()).data : null,
      };
    } catch {
      return { reputation: null, transparency: null };
    }
  })();
  enrichCache.set(verusId, promise);
  return promise;
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function nounPhrase(noun, count) {
  if (count === 1) return noun;
  if (!noun) return 'listings';
  if (noun.endsWith('s')) return noun;
  return `${noun}s`;
}

function asMarketplaceCard(row) {
  if (row.verusId) return { ...row, website: row.website || null };
  return {
    id: row.id,
    verusId: row.id,
    agentName: row.name,
    qualifiedName: row.qualifiedName,
    name: row.name,
    description: row.description,
    category: row.category,
    kind: row.kind,
    agentOnline: row.online,
    privacyTier: row.privacyTier,
    models: row.models,
    status: row.status,
    website: row.website || null,
  };
}

export function KindMarketplacePage({ verticalKey }) {
  const vertical = VERTICALS.find((v) => v.key === verticalKey) || VERTICALS.find((v) => v.key === 'compute');
  const noun = vertical?.noun || 'listing';
  usePageTitle(vertical?.label || 'Listings');

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [viewMode, setViewMode] = useState('grid');
  const [services, setServices] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const debouncedSearch = useDebounce(search, 300);
  const browseAgents = vertical?.listingKind === 'data' && !vertical?.serviceType;

  const buildParams = useCallback((extraOffset) => {
    const sort = browseAgents && sortBy === 'price' ? 'created_at' : sortBy;
    const params = new URLSearchParams({
      status: 'active',
      sort,
      order: sort === 'price' ? 'asc' : 'desc',
      limit: String(PAGE_SIZE),
      offset: String(extraOffset || 0),
    });
    if (debouncedSearch && !browseAgents) params.set('q', debouncedSearch);
    if (vertical?.listingKind) params.set('kind', vertical.listingKind);
    if (vertical?.serviceType) params.set('serviceType', vertical.serviceType);
    return params;
  }, [browseAgents, debouncedSearch, sortBy, vertical?.listingKind, vertical?.serviceType]);

  async function enrichWithReputation(serviceList) {
    const agentIds = [...new Set(serviceList.map(s => s.verusId).filter(Boolean))];
    const results = await Promise.all(agentIds.map(id => fetchEnrichment(id)));
    const byId = {};
    agentIds.forEach((id, i) => { byId[id] = results[i]; });

    return serviceList.map(s => ({
      ...s,
      reputation: byId[s.verusId]?.reputation || null,
      transparency: byId[s.verusId]?.transparency || null,
    }));
  }

  async function fetchServices(isLoadMore = false) {
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    setFetchError(null);
    try {
      const currentOffset = isLoadMore ? offset + PAGE_SIZE : 0;
      const params = buildParams(currentOffset);
      const path = browseAgents ? '/v1/agents' : '/v1/services';
      const res = await fetch(`${API_BASE}${path}?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');

      const rows = (data.data || []).map(asMarketplaceCard);
      let enriched;
      try {
        enriched = await enrichWithReputation(rows);
      } catch {
        enriched = rows.map(s => ({ ...s, reputation: null, transparency: null }));
      }
      if (browseAgents && debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        enriched = enriched.filter(s =>
          (s.agentName || s.name || '').toLowerCase().includes(q)
          || (s.description || '').toLowerCase().includes(q)
          || (s.qualifiedName || '').toLowerCase().includes(q),
        );
      }
      enriched.sort((a, b) => (b.agentOnline ? 1 : 0) - (a.agentOnline ? 1 : 0));

      if (isLoadMore) {
        setServices(prev => [...prev, ...enriched]);
        setOffset(currentOffset);
      } else {
        setServices(enriched);
        setOffset(0);
      }
      setTotalCount(data.meta?.total || enriched.length);
      setHasMore(data.meta?.hasMore || false);
    } catch {
      setFetchError(`Failed to load ${nounPhrase(noun, 2)}. Please try again.`);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchServices(false);
  }, [debouncedSearch, sortBy, vertical?.listingKind, vertical?.serviceType]);

  const emptyTitle = debouncedSearch
    ? `No results for "${debouncedSearch}"`
    : `No ${nounPhrase(noun, 2)} available`;
  const emptyHint = debouncedSearch
    ? 'Try different keywords'
    : vertical?.listingKind === 'data'
      ? 'A priced dataset can be hired. A price of 0 cannot.'
      : `Be the first to list a ${noun}`;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #34D399, transparent 70%)' }} />
        <div className="absolute top-[300px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #059669, transparent 70%)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <VerticalSwitcher className="mb-6" />

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8">
          <div className="relative w-full">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-tertiary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={loading
                ? `Search ${nounPhrase(noun, 2)}`
                : `Search ${totalCount.toLocaleString()} ${nounPhrase(noun, totalCount)}`}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl text-sm text-white placeholder-gray-500 transition-all duration-300 outline-none"
              style={{
                background: 'rgba(15, 19, 32, 0.8)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-default)',
              }}
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="px-3 py-3 rounded-xl text-sm bg-transparent text-white outline-none cursor-pointer"
              style={{ border: '1px solid var(--border-default)' }}>
              <option value="created_at" className="bg-gray-900">Newest</option>
              <option value="name" className="bg-gray-900">Name</option>
              {!browseAgents && <option value="price" className="bg-gray-900">Price: Low</option>}
            </select>
            <div className="hidden sm:flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
              <button onClick={() => setViewMode('grid')}
                className="px-3 py-3 transition-colors"
                style={{ background: viewMode === 'grid' ? 'rgba(52, 211, 153, 0.1)' : 'transparent', color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 13.5v-3z"/></svg>
              </button>
              <button onClick={() => setViewMode('list')}
                className="px-3 py-3 transition-colors"
                style={{ background: viewMode === 'list' ? 'rgba(52, 211, 153, 0.1)' : 'transparent', color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div className="mb-8 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <h2 className="text-lg font-bold text-white mt-6" style={{ fontFamily: 'var(--font-display)' }}>
            {vertical?.label || 'Listings'}
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {vertical?.blurb} {vertical?.contract}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {loading ? 'Loading listings…' : `${totalCount} ${nounPhrase(noun, totalCount)} available`}
          </p>
        </div>

        {fetchError && (
          <div style={{ marginBottom: 16, padding: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, color: '#F87171', fontSize: 14 }}>
            {fetchError}
          </div>
        )}
        {loading ? (
          <SkeletonList count={6} lines={2} />
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">&#128269;</div>
            <h3 className="text-lg font-medium text-white mb-2">
              {emptyTitle}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {emptyHint}
            </p>
            <Link to="/register" className="text-sm text-teal-400 hover:text-teal-300 font-medium no-underline">
              Register your listing &#8594;
            </Link>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {services.map(s => (
              <MarketplaceCard key={s.id} service={s} variant="grid" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {services.map(s => (
              <MarketplaceCard key={s.id} service={s} variant="list" />
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <div className="flex justify-center mt-8 mb-12">
            <button
              onClick={() => fetchServices(true)}
              disabled={loadingMore}
              className="btn-load-more px-8 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComputeMarketplacePage() {
  return <KindMarketplacePage verticalKey="compute" />;
}
