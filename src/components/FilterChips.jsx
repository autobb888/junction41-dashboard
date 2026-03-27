import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

function Popover({ open, onClose, anchor, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !anchor?.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchor]);

  if (!open) return null;
  return (
    <div ref={ref} className="absolute top-full left-0 mt-1 p-3 rounded-lg shadow-xl" style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', zIndex: 50, minWidth: 200,
    }}>
      {children}
    </div>
  );
}

function Chip({ label, active, onClick, hasPopover, children }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const btnRef = useRef(null);

  if (hasPopover) {
    return (
      <div className="relative">
        <button
          ref={btnRef}
          onClick={() => setPopoverOpen(!popoverOpen)}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap"
          style={{
            background: active ? 'rgba(52, 211, 153, 0.12)' : 'transparent',
            color: active ? 'var(--accent)' : 'var(--text-tertiary)',
            border: `1px solid ${active ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          {label} ▾
        </button>
        <Popover open={popoverOpen} onClose={() => setPopoverOpen(false)} anchor={btnRef.current}>
          {children}
        </Popover>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap"
      style={{
        background: active ? 'rgba(52, 211, 153, 0.15)' : 'var(--bg-surface)',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
      }}
    >
      {label}
    </button>
  );
}

export default function FilterChips({ filters, onFilterChange }) {
  const hasActiveFilters = filters.onlineOnly || filters.workspaceOnly || filters.sovguard
    || filters.minPrice || filters.maxPrice || filters.minRating
    || filters.trustTier || filters.agentTypes?.length || filters.protocols?.length
    || filters.paymentTerms?.length || filters.privateMode || filters.freeReactivation;

  const toggle = (key) => onFilterChange({ ...filters, [key]: !filters[key] });
  const set = (key, val) => onFilterChange({ ...filters, [key]: val });

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs mr-1" style={{ color: 'var(--text-tertiary)' }}>Filters</span>
      <Chip label="Online" active={filters.onlineOnly} onClick={() => toggle('onlineOnly')} />
      <Chip label="Workspace" active={filters.workspaceOnly} onClick={() => toggle('workspaceOnly')} />
      <Chip label="SovGuard" active={filters.sovguard} onClick={() => toggle('sovguard')} />

      <Chip label="Price" active={!!(filters.minPrice || filters.maxPrice)} hasPopover>
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Price range</p>
        <div className="flex gap-2 items-center">
          <input type="number" placeholder="Min" value={filters.minPrice || ''}
            onChange={e => set('minPrice', e.target.value)}
            className="w-20 px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>–</span>
          <input type="number" placeholder="Max" value={filters.maxPrice || ''}
            onChange={e => set('maxPrice', e.target.value)}
            className="w-20 px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </div>
      </Chip>

      <Chip label="Rating" active={!!filters.minRating} hasPopover>
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Minimum rating</p>
        <div className="flex gap-1.5">
          {[4.5, 4.0, 3.5, 3.0].map(r => (
            <button key={r} onClick={() => set('minRating', filters.minRating === r ? null : r)}
              className="px-2.5 py-1 rounded text-xs font-mono"
              style={{
                background: filters.minRating === r ? 'rgba(52, 211, 153, 0.15)' : 'var(--bg-surface)',
                color: filters.minRating === r ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${filters.minRating === r ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
              }}
            >{r}+</button>
          ))}
        </div>
      </Chip>

      <Chip label="Trust" active={!!filters.trustTier} hasPopover>
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Trust tier</p>
        <div className="flex gap-1.5 flex-wrap">
          {['high', 'medium', 'low', 'new'].map(t => (
            <button key={t} onClick={() => set('trustTier', filters.trustTier === t ? null : t)}
              className="px-2.5 py-1 rounded text-xs capitalize"
              style={{
                background: filters.trustTier === t ? 'rgba(52, 211, 153, 0.15)' : 'var(--bg-surface)',
                color: filters.trustTier === t ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${filters.trustTier === t ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
              }}
            >{t}</button>
          ))}
        </div>
      </Chip>

      <Chip label="Type" active={filters.agentTypes?.length > 0} hasPopover>
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Agent type</p>
        <div className="space-y-1.5">
          {['Autonomous', 'Assisted', 'Tool'].map(t => (
            <label key={t} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox"
                checked={filters.agentTypes?.includes(t) || false}
                onChange={() => {
                  const current = filters.agentTypes || [];
                  const next = current.includes(t) ? current.filter(x => x !== t) : [...current, t];
                  set('agentTypes', next);
                }}
              />
              {t}
            </label>
          ))}
        </div>
      </Chip>

      <Chip label="Protocol" active={filters.protocols?.length > 0} hasPopover>
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Protocol</p>
        <div className="space-y-1.5">
          {[{ id: 'mcp', label: 'MCP' }, { id: 'a2a', label: 'A2A' }, { id: 'rest-api', label: 'REST API' }].map(p => (
            <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox"
                checked={filters.protocols?.includes(p.id) || false}
                onChange={() => {
                  const current = filters.protocols || [];
                  const next = current.includes(p.id) ? current.filter(x => x !== p.id) : [...current, p.id];
                  set('protocols', next);
                }}
              />
              {p.label}
            </label>
          ))}
        </div>
      </Chip>

      <Chip label="Payment" active={filters.paymentTerms?.length > 0} hasPopover>
        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Payment terms</p>
        <div className="space-y-1.5">
          {['prepay', 'postpay', 'split'].map(t => (
            <label key={t} className="flex items-center gap-2 text-xs cursor-pointer capitalize" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox"
                checked={filters.paymentTerms?.includes(t) || false}
                onChange={() => {
                  const current = filters.paymentTerms || [];
                  const next = current.includes(t) ? current.filter(x => x !== t) : [...current, t];
                  set('paymentTerms', next);
                }}
              />
              {t}
            </label>
          ))}
        </div>
      </Chip>

      <Chip label="Private" active={filters.privateMode} onClick={() => toggle('privateMode')} />
      <Chip label="Free Reactivation" active={filters.freeReactivation} onClick={() => toggle('freeReactivation')} />

      {hasActiveFilters && (
        <button onClick={() => onFilterChange({
          onlineOnly: false, workspaceOnly: false, sovguard: false,
          minPrice: '', maxPrice: '', minRating: null, trustTier: null,
          agentTypes: [], protocols: [], paymentTerms: [],
          privateMode: false, freeReactivation: false,
        })}
          className="px-2 py-1.5 text-xs flex items-center gap-1"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <X size={12} /> Clear all
        </button>
      )}
    </div>
  );
}
