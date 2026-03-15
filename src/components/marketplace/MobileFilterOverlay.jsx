import { CATEGORIES } from './categories';

export default function MobileFilterOverlay({
  isOpen,
  onClose,
  selected,
  onSelect,
  filters,
  onFilterChange,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <h2 className="text-lg font-bold text-white">Filters</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&#215;</button>
      </div>
      <div className="p-4 overflow-y-auto" style={{ height: 'calc(100vh - 130px)' }}>
        {/* Categories */}
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Categories
        </h3>
        <div className="space-y-1 mb-6">
          <button onClick={() => { onSelect(null); onClose(); }}
            className="w-full text-left px-4 py-3 rounded-xl text-sm"
            style={{
              background: !selected ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
              color: !selected ? 'var(--accent)' : 'var(--text-secondary)',
              border: !selected ? '1px solid rgba(52, 211, 153, 0.2)' : '1px solid transparent',
            }}>
            All Agents
          </button>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => { onSelect(cat.id); onClose(); }}
              className="w-full text-left px-4 py-3 rounded-xl text-sm flex items-center gap-3"
              style={{
                background: selected === cat.id ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
                color: selected === cat.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: selected === cat.id ? '1px solid rgba(52, 211, 153, 0.2)' : '1px solid transparent',
              }}>
              <span className="text-base">{cat.icon}</span>
              <span className="flex-1">{cat.name}</span>
            </button>
          ))}
        </div>

        {/* Rating */}
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Rating
        </h3>
        <div className="flex flex-wrap gap-2 mb-6">
          {[4.5, 4.0, 3.5, 3.0].map(r => (
            <button
              key={r}
              onClick={() => onFilterChange({ ...filters, minRating: filters.minRating === r ? null : r })}
              className="px-4 py-2 rounded-xl text-sm"
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

        {/* Status */}
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Status
        </h3>
        <label className="flex items-center gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.onlineOnly || false}
            onChange={e => onFilterChange({ ...filters, onlineOnly: e.target.checked })}
            className="rounded border-gray-600 bg-gray-800 text-emerald-500 w-5 h-5"
          />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Online only</span>
        </label>

        {/* Price Range */}
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Price Range
        </h3>
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Min"
            value={filters.minPrice || ''}
            onChange={e => onFilterChange({ ...filters, minPrice: e.target.value })}
            className="w-1/2 bg-gray-900/50 border rounded-xl px-3 py-2.5 text-sm text-white outline-none"
            style={{ borderColor: 'var(--border-default)' }}
          />
          <input
            type="text"
            placeholder="Max"
            value={filters.maxPrice || ''}
            onChange={e => onFilterChange({ ...filters, maxPrice: e.target.value })}
            className="w-1/2 bg-gray-900/50 border rounded-xl px-3 py-2.5 text-sm text-white outline-none"
            style={{ borderColor: 'var(--border-default)' }}
          />
        </div>

        {/* Protocol */}
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Protocol
        </h3>
        <div className="space-y-2 mb-6">
          {['MCP', 'A2A', 'REST API'].map(p => {
            const protocols = filters.protocols || [];
            const checked = protocols.includes(p.toLowerCase());
            return (
              <label key={p} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const key = p.toLowerCase();
                    const next = checked ? protocols.filter(x => x !== key) : [...protocols, key];
                    onFilterChange({ ...filters, protocols: next });
                  }}
                  className="rounded border-gray-600 bg-gray-800 text-emerald-500 w-5 h-5"
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{p}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}>
        <button onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ background: 'var(--accent)', color: '#000' }}>
          Apply Filters
        </button>
      </div>
    </div>
  );
}
