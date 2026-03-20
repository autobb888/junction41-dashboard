import { useState } from 'react';
import { CATEGORIES } from './categories';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function CategorySidebar({
  totalCount,
  categoryCounts = {},
  selected,
  onSelect,
  expanded,
  onToggle,
  selectedSub,
  onSubSelect,
  subCounts = {},
  filters,
  onFilterChange,
}) {
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);

  return (
    <div className="w-[240px] flex-shrink-0 sticky top-24 self-start hidden lg:block">
      {/* Categories — collapsible */}
      <button
        onClick={() => setCategoriesOpen(!categoriesOpen)}
        className="w-full flex items-center justify-between py-2 px-1 mb-1"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Categories
        </h3>
        {categoriesOpen
          ? <ChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} />
          : <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
        }
      </button>

      {categoriesOpen && (
        <nav className="space-y-0.5 mb-4">
          <button
            onClick={() => { onSelect(null); onToggle(null); }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
            style={{
              background: !selected ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
              color: !selected ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            All Agents
            <span className="float-right text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {(totalCount || 0).toLocaleString()}
            </span>
          </button>
          {CATEGORIES.map(cat => (
            <div key={cat.id}>
              <button
                onClick={() => { onSelect(cat.id); onToggle(cat.id); }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                style={{
                  background: selected === cat.id ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
                  color: selected === cat.id ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <span className="w-5 text-center text-xs">{cat.icon}</span>
                <span className="flex-1 truncate">{cat.name}</span>
                {(categoryCounts[cat.id] || categoryCounts[cat.name.toLowerCase()]) > 0 && (
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                    {categoryCounts[cat.id] || categoryCounts[cat.name.toLowerCase()]}
                  </span>
                )}
              </button>
              {expanded === cat.id && (
                <div className="ml-8 mt-0.5 space-y-0.5">
                  {cat.subs.map(sub => {
                    const count = subCounts[cat.id]?.[sub];
                    return (
                      <button key={sub}
                        onClick={() => onSubSelect?.(selectedSub === sub ? null : sub)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors hover:text-white flex items-center"
                        style={{
                          color: selectedSub === sub ? 'var(--accent)' : 'var(--text-tertiary)',
                          background: selectedSub === sub ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
                        }}
                      >
                        <span className="flex-1">{sub}</span>
                        {count != null && (
                          <span className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      )}

      {/* Filters — collapsible */}
      <div className="pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="w-full flex items-center justify-between py-2 px-1 mb-1"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Filters
          </h3>
          {filtersOpen
            ? <ChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} />
            : <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
          }
        </button>

        {filtersOpen && (
          <div>
            {/* Workspace capable */}
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.workspaceOnly || false}
                  onChange={e => onFilterChange({ ...filters, workspaceOnly: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-800 text-emerald-500"
                />
                <span className="text-xs" style={{ color: '#60A5FA' }}>&lt;-&gt; Workspace capable</span>
              </label>
            </div>

            {/* Price Range */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-secondary)' }}>Price Range</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Min"
                  value={filters.minPrice || ''}
                  onChange={e => onFilterChange({ ...filters, minPrice: e.target.value })}
                  className="w-1/2 bg-gray-900/50 border rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500/50"
                  style={{ borderColor: 'var(--border-default)' }}
                />
                <input
                  type="text"
                  placeholder="Max"
                  value={filters.maxPrice || ''}
                  onChange={e => onFilterChange({ ...filters, maxPrice: e.target.value })}
                  className="w-1/2 bg-gray-900/50 border rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500/50"
                  style={{ borderColor: 'var(--border-default)' }}
                />
              </div>
            </div>

            {/* Trust tier */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-secondary)' }}>Trust Tier</label>
              <div className="flex flex-wrap gap-1">
                {['high', 'medium', 'low', 'new'].map(tier => (
                  <button
                    key={tier}
                    onClick={() => onFilterChange({ ...filters, trustTier: filters.trustTier === tier ? null : tier })}
                    className="px-2 py-1 rounded text-xs capitalize transition-colors"
                    style={{
                      border: filters.trustTier === tier ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid var(--border-default)',
                      color: filters.trustTier === tier ? 'var(--accent)' : 'var(--text-secondary)',
                      background: filters.trustTier === tier ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
                    }}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-secondary)' }}>Minimum Rating</label>
              <div className="flex gap-1">
                {[4.5, 4.0, 3.5, 3.0].map(r => (
                  <button
                    key={r}
                    onClick={() => onFilterChange({ ...filters, minRating: filters.minRating === r ? null : r })}
                    className="px-2 py-1 rounded text-xs transition-colors"
                    style={{
                      border: filters.minRating === r ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid var(--border-default)',
                      color: filters.minRating === r ? 'var(--accent)' : 'var(--text-secondary)',
                      background: filters.minRating === r ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
                    }}
                  >
                    &#9733; {r}+
                  </button>
                ))}
              </div>
            </div>

            {/* Agent type */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-secondary)' }}>Agent Type</label>
              <div className="space-y-1">
                {['Autonomous', 'Assisted', 'Tool'].map(t => {
                  const types = filters.agentTypes || [];
                  const val = t.toLowerCase();
                  const checked = types.includes(val);
                  return (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? types.filter(x => x !== val) : [...types, val];
                          onFilterChange({ ...filters, agentTypes: next });
                        }}
                        className="rounded border-gray-600 bg-gray-800 text-emerald-500"
                      />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Online only */}
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.onlineOnly || false}
                  onChange={e => onFilterChange({ ...filters, onlineOnly: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-800 text-emerald-500"
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Online only</span>
              </label>
            </div>

            {/* Protocol */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-secondary)' }}>Protocol</label>
              <div className="space-y-1">
                {['MCP', 'A2A', 'REST API'].map(p => {
                  const protocols = filters.protocols || [];
                  const checked = protocols.includes(p.toLowerCase());
                  return (
                    <label key={p} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const key = p.toLowerCase();
                          const next = checked ? protocols.filter(x => x !== key) : [...protocols, key];
                          onFilterChange({ ...filters, protocols: next });
                        }}
                        className="rounded border-gray-600 bg-gray-800 text-emerald-500"
                      />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* SovGuard */}
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.sovguard || false}
                  onChange={e => onFilterChange({ ...filters, sovguard: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-800 text-emerald-500"
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>SovGuard protected</span>
              </label>
            </div>

            {/* Private Mode */}
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.privateMode || false}
                  onChange={e => onFilterChange({ ...filters, privateMode: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-800 text-emerald-500"
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Private mode only</span>
              </label>
            </div>

            {/* Payment Terms */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-secondary)' }}>Payment Terms</label>
              <div className="space-y-1">
                {['Prepay', 'Postpay', 'Split'].map(pt => {
                  const terms = filters.paymentTerms || [];
                  const val = pt.toLowerCase();
                  const checked = terms.includes(val);
                  return (
                    <label key={pt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? terms.filter(x => x !== val) : [...terms, val];
                          onFilterChange({ ...filters, paymentTerms: next });
                        }}
                        className="rounded border-gray-600 bg-gray-800 text-emerald-500"
                      />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{pt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
