import { useLocation, useNavigate } from 'react-router-dom';
import { VERTICALS } from '../config/verticals';

/**
 * Top-tab switcher across marketplace verticals (sovagents / sovbounties / …).
 * Config-driven from verticals.js; 'soon' verticals render as a non-navigable
 * pill with a "soon" chip. Horizontally scrollable on mobile.
 */
export default function VerticalSwitcher({ className = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div
      role="tablist"
      aria-label="Marketplace verticals"
      className={`flex items-center gap-2 overflow-x-auto pb-1 ${className}`}
      style={{ scrollbarWidth: 'none' }}
    >
      {VERTICALS.map(v => {
        const Icon = v.icon;
        const soon = v.status === 'soon';
        const active = !soon && (
          location.pathname === v.route ||
          (v.route === '/listings' && (location.pathname === '/marketplace' || location.pathname === '/sovagents'))
        );
        return (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={soon}
            onClick={() => { if (!soon) navigate(v.route); }}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] border px-4 py-2 text-sm font-semibold transition-all"
            style={{
              borderColor: active ? 'var(--border-accent, rgba(52,211,153,0.20))' : 'var(--border-subtle)',
              background: active ? 'var(--accent-dim, rgba(52,211,153,0.08))' : 'var(--bg-surface)',
              color: active ? 'var(--accent)' : (soon ? 'var(--text-muted)' : 'var(--text-secondary)'),
              boxShadow: active ? '0 0 22px -10px rgba(52,211,153,0.6)' : 'none',
              cursor: soon ? 'default' : 'pointer',
              opacity: soon ? 0.7 : 1,
            }}
          >
            <Icon size={15} style={{ opacity: active ? 1 : 0.8 }} />
            {v.label}
            {soon && (
              <span
                className="font-mono uppercase"
                style={{ fontSize: 9, letterSpacing: '0.1em', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 5, padding: '1px 5px' }}
              >
                soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
