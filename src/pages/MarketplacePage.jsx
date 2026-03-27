import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, getCategoryById } from '../components/marketplace/categories';
import CategorySidebar from '../components/marketplace/CategorySidebar';
import MobileFilterOverlay from '../components/marketplace/MobileFilterOverlay';
import MarketplaceSearchBar from '../components/marketplace/MarketplaceSearchBar';
import MarketplaceCard from '../components/marketplace/MarketplaceCard';
import FeaturedCard from '../components/marketplace/FeaturedCard';
import TrustScore from '../components/TrustScore';
import HorizontalScroll from '../components/marketplace/HorizontalScroll';
import { SkeletonList } from '../components/Skeleton';
import FilterChips from '../components/FilterChips';
import usePageTitle from '../hooks/usePageTitle';

const API_BASE = import.meta.env.VITE_API_URL || '';
const PAGE_SIZE = 24;

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function MarketplacePage() {
  usePageTitle('SovAgents');

  // State
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [viewMode, setViewMode] = useState('grid');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    minRating: null,
    onlineOnly: false,
    protocols: [],
    sovguard: false,
    paymentTerms: [],
    privateMode: false,
    workspaceOnly: false,
    trustTier: null,
    agentTypes: [],
    freeReactivation: false,
  });

  const [services, setServices] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [trending, setTrending] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [allAgentsTotal, setAllAgentsTotal] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [subCounts, setSubCounts] = useState({});
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  // Build query params from filters
  const buildParams = useCallback((extraOffset) => {
    const params = new URLSearchParams({
      status: 'active',
      sort: sortBy,
      order: sortBy === 'price' ? 'asc' : 'desc',
      limit: String(PAGE_SIZE),
      offset: String(extraOffset || 0),
    });
    if (selectedCategory) {
      const cat = getCategoryById(selectedCategory);
      if (cat) params.set('category', cat.name.toLowerCase());
    }
    if (selectedSub) params.set('q', selectedSub);
    else if (debouncedSearch) params.set('q', debouncedSearch);
    if (filters.minPrice) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    if (filters.onlineOnly) params.set('onlineOnly', 'true');
    if (filters.minRating) params.set('minRating', String(filters.minRating));
    if (filters.protocols.length > 0) params.set('protocol', filters.protocols.join(','));
    if (filters.sovguard) params.set('sovguard', 'true');
    if (filters.privateMode) params.set('privateMode', 'true');
    if (filters.paymentTerms.length > 0) params.set('paymentTerms', filters.paymentTerms[0]);
    return params;
  }, [selectedCategory, selectedSub, debouncedSearch, sortBy, filters]);

  // Enrich services with reputation/transparency data
  async function enrichWithReputation(serviceList) {
    const agentIds = [...new Set(serviceList.map(s => s.verusId))];
    const repMap = {};
    const transMap = {};

    await Promise.all(
      agentIds.map(async (verusId) => {
        try {
          const [repRes, transRes] = await Promise.all([
            fetch(`${API_BASE}/v1/reputation/${encodeURIComponent(verusId)}?quick=true`),
            fetch(`${API_BASE}/v1/agents/${encodeURIComponent(verusId)}/transparency`),
          ]);
          if (repRes.ok) repMap[verusId] = (await repRes.json()).data;
          if (transRes.ok) transMap[verusId] = (await transRes.json()).data;
        } catch { /* ignore */ }
      })
    );

    return serviceList.map(s => ({
      ...s,
      reputation: repMap[s.verusId] || null,
      transparency: transMap[s.verusId] || null,
    }));
  }

  // Fetch main services list
  async function fetchServices(isLoadMore = false) {
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const currentOffset = isLoadMore ? offset + PAGE_SIZE : 0;
      const params = buildParams(currentOffset);
      const res = await fetch(`${API_BASE}/v1/services?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');

      const enriched = await enrichWithReputation(data.data || []);
      // Sort online agents first
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
    } catch (err) {
      console.error('Marketplace fetch error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // Fetch featured + trending carousels + category counts
  async function fetchCarousels() {
    try {
      const [featuredRes, trendingRes, catRes] = await Promise.all([
        fetch(`${API_BASE}/v1/services/featured`).catch(() => null),
        fetch(`${API_BASE}/v1/services/trending`).catch(() => null),
        fetch(`${API_BASE}/v1/services/categories`).catch(() => null),
      ]);

      if (featuredRes?.ok) {
        const data = await featuredRes.json();
        const enriched = await enrichWithReputation(data.data || []);
        setFeatured(enriched);
      }
      if (trendingRes?.ok) {
        const data = await trendingRes.json();
        const enriched = await enrichWithReputation(data.data || []);
        setTrending(enriched);
      }
      if (catRes?.ok) {
        const data = await catRes.json();
        if (data.counts) {
          // Build normalized lookup — store both raw key and lowercase
          const normalized = {};
          for (const [key, val] of Object.entries(data.counts)) {
            normalized[key] = (normalized[key] || 0) + val;
            normalized[key.toLowerCase()] = (normalized[key.toLowerCase()] || 0) + val;
          }
          setCategoryCounts(normalized);
          // Sum unique category counts for the "All Agents" total
          const sum = Object.values(data.counts).reduce((a, b) => a + b, 0);
          setAllAgentsTotal(sum);
        }
      }
    } catch { /* carousel fetch is non-critical */ }
  }

  // Initial load
  useEffect(() => {
    fetchCarousels();
  }, []);

  // Re-fetch on filter/sort/search/category change
  useEffect(() => {
    fetchServices(false);
  }, [selectedCategory, selectedSub, debouncedSearch, sortBy, filters.minPrice, filters.maxPrice, filters.minRating, filters.onlineOnly, filters.protocols.length, filters.sovguard, filters.paymentTerms.length, filters.privateMode]);

  // Fetch subcategory counts when a category is expanded
  useEffect(() => {
    if (!expandedCategory) return;
    const cat = getCategoryById(expandedCategory);
    if (!cat) return;
    let cancelled = false;
    async function fetchSubCounts() {
      try {
        const res = await fetch(`${API_BASE}/v1/services?category=${encodeURIComponent(cat.name.toLowerCase())}&status=active&limit=100`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const allServices = data.data || [];
        const counts = {};
        for (const sub of cat.subs) {
          const lower = sub.toLowerCase();
          counts[sub] = allServices.filter(s =>
            (s.name || '').toLowerCase().includes(lower) ||
            (s.description || '').toLowerCase().includes(lower) ||
            (s.category || '').toLowerCase().includes(lower)
          ).length;
        }
        if (!cancelled) setSubCounts(prev => ({ ...prev, [expandedCategory]: counts }));
      } catch { /* ignore */ }
    }
    fetchSubCounts();
    return () => { cancelled = true; };
  }, [expandedCategory]);

  // Active filter pills
  const activeFilters = [];
  if (selectedCategory) {
    const catName = getCategoryById(selectedCategory)?.name;
    if (catName) activeFilters.push({ key: 'category', label: catName, clear: () => { setSelectedCategory(null); setSelectedSub(null); } });
  }
  if (selectedSub) activeFilters.push({ key: 'sub', label: selectedSub, clear: () => setSelectedSub(null) });
  if (filters.minRating) activeFilters.push({ key: 'rating', label: `★ ${filters.minRating}+`, clear: () => setFilters(f => ({ ...f, minRating: null })) });
  if (filters.onlineOnly) activeFilters.push({ key: 'online', label: 'Online only', clear: () => setFilters(f => ({ ...f, onlineOnly: false })) });
  if (filters.minPrice) activeFilters.push({ key: 'minPrice', label: `Min: ${filters.minPrice}`, clear: () => setFilters(f => ({ ...f, minPrice: '' })) });
  if (filters.maxPrice) activeFilters.push({ key: 'maxPrice', label: `Max: ${filters.maxPrice}`, clear: () => setFilters(f => ({ ...f, maxPrice: '' })) });
  filters.protocols.forEach(p => activeFilters.push({ key: `proto-${p}`, label: p.toUpperCase(), clear: () => setFilters(f => ({ ...f, protocols: f.protocols.filter(x => x !== p) })) }));
  if (filters.sovguard) activeFilters.push({ key: 'sovguard', label: 'SovGuard', clear: () => setFilters(f => ({ ...f, sovguard: false })) });
  if (filters.privateMode) activeFilters.push({ key: 'privateMode', label: 'Private Mode', clear: () => setFilters(f => ({ ...f, privateMode: false })) });
  filters.paymentTerms.forEach(pt => activeFilters.push({ key: `pt-${pt}`, label: `${pt.charAt(0).toUpperCase() + pt.slice(1)}`, clear: () => setFilters(f => ({ ...f, paymentTerms: f.paymentTerms.filter(x => x !== pt) })) }));
  if (filters.workspaceOnly) activeFilters.push({ key: 'workspace', label: '<-> Workspace', clear: () => setFilters(f => ({ ...f, workspaceOnly: false })) });
  if (filters.freeReactivation) activeFilters.push({ key: 'freeReactivation', label: 'Free Reactivation', clear: () => setFilters(f => ({ ...f, freeReactivation: false })) });
  if (filters.trustTier) activeFilters.push({ key: 'trust', label: `Trust: ${filters.trustTier}`, clear: () => setFilters(f => ({ ...f, trustTier: null })) });
  (filters.agentTypes || []).forEach(t => activeFilters.push({ key: `type-${t}`, label: t.charAt(0).toUpperCase() + t.slice(1), clear: () => setFilters(f => ({ ...f, agentTypes: f.agentTypes.filter(x => x !== t) })) }));

  // Client-side filtering for workspace, trust tier, agent type
  let filteredServices = services;
  if (filters.workspaceOnly) filteredServices = filteredServices.filter(s => s.workspaceCapable);
  if (filters.freeReactivation) filteredServices = filteredServices.filter(s => !s.reactivationFee || s.reactivationFee === 0);
  if (filters.trustTier) filteredServices = filteredServices.filter(s => (s.trustTier || s.transparency?.computed?.trustLevel) === filters.trustTier);
  if (filters.agentTypes?.length > 0) filteredServices = filteredServices.filter(s => filters.agentTypes.includes(s.agentType?.toLowerCase()));

  // Split agents by trust tier: filter out suspended, separate low-trust
  const regularAgents = filteredServices.filter(s => {
    const tier = s.trustTier || s.transparency?.computed?.trustLevel;
    return tier !== 'suspended' && tier !== 'low';
  });
  const riskyAgents = filteredServices.filter(s => {
    const tier = s.trustTier || s.transparency?.computed?.trustLevel;
    return tier === 'low';
  });

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #34D399, transparent 70%)' }} />
        <div className="absolute top-[300px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #059669, transparent 70%)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Search + controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8">
          <MarketplaceSearchBar value={search} onChange={setSearch} agentCount={totalCount || services.length} />
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile filter button */}
            <button onClick={() => setMobileFilterOpen(true)}
              className="lg:hidden px-3 py-3 rounded-xl text-sm flex items-center gap-2"
              style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
            </button>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="px-3 py-3 rounded-xl text-sm bg-transparent text-white outline-none cursor-pointer"
              style={{ border: '1px solid var(--border-default)' }}>
              <option value="created_at" className="bg-gray-900">Newest</option>
              <option value="name" className="bg-gray-900">Name</option>
              <option value="price" className="bg-gray-900">Price: Low</option>
            </select>
            {/* View toggle */}
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

        {/* Legacy active filter pills — hidden, replaced by FilterChips */}
        {false && activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {activeFilters.map(f => (
              <span key={f.key}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer"
                style={{ background: 'rgba(52, 211, 153, 0.12)', color: 'var(--accent)', border: '1px solid rgba(52, 211, 153, 0.2)' }}
                onClick={f.clear}>
                {f.label} <span className="opacity-60">&#10005;</span>
              </span>
            ))}
            {activeFilters.length > 1 && (
              <button
                className="text-xs px-3 py-1.5 rounded-full"
                style={{ color: 'var(--text-tertiary)' }}
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedSub(null);
                  setFilters({ minPrice: '', maxPrice: '', minRating: null, onlineOnly: false, protocols: [], sovguard: false, paymentTerms: [], privateMode: false, workspaceOnly: false, trustTier: null, agentTypes: [], freeReactivation: false });
                }}
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {/* Trending carousel (hide when category selected) */}
        {!selectedCategory && trending.length > 0 && (
          <div className="mb-10">
            <HorizontalScroll label="Trending Now" sublabel="Most active this week">
              {trending.map(a => <FeaturedCard key={a.id} agent={a} />)}
            </HorizontalScroll>
          </div>
        )}

        {/* Divider + browse heading */}
        <div className="mb-8 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <h2 className="text-lg font-bold text-white mt-6" style={{ fontFamily: 'var(--font-display)' }}>
            {getCategoryById(selectedCategory)?.name || 'Browse SovAgents'}
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {totalCount} {totalCount === 1 ? 'service' : 'services'} {getCategoryById(selectedCategory)?.name ? `in ${getCategoryById(selectedCategory)?.name}` : 'available'}
          </p>
        </div>

        {/* Sidebar + Grid layout */}
        <div className="flex gap-8">
          <CategorySidebar
            totalCount={allAgentsTotal}
            categoryCounts={categoryCounts}
            selected={selectedCategory}
            onSelect={(id) => { setSelectedCategory(id); setSelectedSub(null); }}
            expanded={expandedCategory}
            onToggle={(id) => setExpandedCategory(expandedCategory === id ? null : id)}
            selectedSub={selectedSub}
            onSubSelect={setSelectedSub}
            subCounts={subCounts}
          />

          {/* Main grid */}
          <div className="flex-1 min-w-0">
            {/* Filter chips — aligned with grid, not overlapping sidebar */}
            <div className="mb-4">
              <FilterChips filters={filters} onFilterChange={setFilters} />
            </div>
            {loading ? (
              <SkeletonList count={6} lines={2} />
            ) : (services.length === 0 || regularAgents.length === 0) && riskyAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-4xl mb-3">&#128269;</div>
                <h3 className="text-lg font-medium text-white mb-2">
                  {debouncedSearch
                    ? `No results for "${debouncedSearch}"`
                    : getCategoryById(selectedCategory)?.name
                      ? `No ${getCategoryById(selectedCategory)?.name} services yet`
                      : 'No services available'}
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  {debouncedSearch
                    ? 'Try different keywords or browse all categories'
                    : 'Be the first to offer this service'}
                </p>
                <Link to="/register" className="text-sm text-teal-400 hover:text-teal-300 font-medium no-underline">
                  Register your agent &#8594;
                </Link>
              </div>
            ) : regularAgents.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                No high-trust agents match your filters. See risky agents below.
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {regularAgents.map(s => (
                  <MarketplaceCard key={s.id} service={s} variant="grid" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {regularAgents.map(s => (
                  <MarketplaceCard key={s.id} service={s} variant="list" />
                ))}
              </div>
            )}

            {/* Load more */}
            {hasMore && !loading && (
              <div className="flex justify-center mt-8 mb-12">
                <button
                  onClick={() => fetchServices(true)}
                  disabled={loadingMore}
                  className="px-8 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                  style={{
                    border: '1px solid rgba(52, 211, 153, 0.2)',
                    color: 'var(--accent)',
                    background: 'rgba(52, 211, 153, 0.05)',
                  }}
                  onMouseEnter={(e) => { if (!loadingMore) e.currentTarget.style.background = 'rgba(52, 211, 153, 0.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(52, 211, 153, 0.05)'; }}
                >
                  {loadingMore ? 'Loading...' : 'Load More Agents'}
                </button>
              </div>
            )}

            {/* Risky Agents section */}
            {!loading && riskyAgents.length > 0 && (
              <div className="mt-12 pt-8" style={{ borderTop: '1px solid rgba(239, 68, 68, 0.15)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-base font-bold" style={{ color: '#EF4444', fontFamily: 'var(--font-display)' }}>
                    Risky Agents
                  </h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                    Low Trust
                  </span>
                </div>
                <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
                  These agents have low trust scores. Proceed with caution and review their profiles carefully before hiring.
                </p>
                <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}`}
                  style={{ opacity: 0.75 }}>
                  {riskyAgents.map(s => (
                    <div key={s.id} className="relative">
                      <MarketplaceCard service={s} variant={viewMode} />
                      <div className={`absolute ${viewMode === 'grid' ? 'top-2 right-2' : 'top-3 right-3'} z-10`}>
                        <TrustScore tier="low" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter overlay */}
      <MobileFilterOverlay
        isOpen={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        filters={filters}
        onFilterChange={setFilters}
      />
    </div>
  );
}
