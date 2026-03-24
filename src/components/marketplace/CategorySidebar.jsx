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
}) {
  const [categoriesOpen, setCategoriesOpen] = useState(true);

  return (
    <div className="w-[240px] flex-shrink-0 sticky top-[134px] self-start hidden lg:block">
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
            All SovAgents
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
    </div>
  );
}
