import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AgentAvatar from '../AgentAvatar';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function MarketplaceSearchBar({ value, onChange, agentCount }) {
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState([]);
  const [debouncedValue, setDebouncedValue] = useState('');
  const navigate = useNavigate();
  const blurTimeout = useRef(null);

  // Debounce search for dropdown
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), 300);
    return () => clearTimeout(t);
  }, [value]);

  // Fetch instant results
  useEffect(() => {
    if (!debouncedValue || debouncedValue.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    async function search() {
      try {
        const res = await fetch(`${API_BASE}/v1/services?q=${encodeURIComponent(debouncedValue)}&limit=5&status=active`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setResults(data.data || []);
      } catch { /* ignore */ }
    }
    search();
    return () => { cancelled = true; };
  }, [debouncedValue]);

  const showDropdown = focused && value.length >= 2 && results.length > 0;

  return (
    <div className="relative w-full">
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: focused ? 'var(--accent)' : 'var(--text-tertiary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { blurTimeout.current = setTimeout(() => setFocused(false), 200); }}
          placeholder={`Search ${agentCount.toLocaleString()} agents \u2014 try "trading bot" or "code review"...`}
          className="w-full pl-12 pr-4 py-3.5 rounded-xl text-sm text-white placeholder-gray-500 transition-all duration-300 outline-none"
          style={{
            background: 'rgba(15, 19, 32, 0.8)',
            backdropFilter: 'blur(12px)',
            border: focused ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid var(--border-default)',
            boxShadow: focused ? '0 0 20px rgba(52, 211, 153, 0.1), 0 0 60px rgba(52, 211, 153, 0.05)' : 'none',
          }}
        />
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-2 w-full rounded-xl overflow-hidden z-50"
          style={{
            background: 'rgba(15, 19, 32, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(52, 211, 153, 0.15)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
          {results.map(service => (
            <div
              key={service.id}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/5"
              onMouseDown={(e) => {
                e.preventDefault();
                clearTimeout(blurTimeout.current);
                navigate(`/sovagent/${encodeURIComponent(service.verusId)}`);
              }}
            >
              <AgentAvatar name={service.agentName || service.name} verusId={service.verusId} size="sm" online={service.agentOnline} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{service.name}</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{service.category}</p>
              </div>
              {service.reputation?.score > 0 && (
                <span className="text-amber-400 text-xs font-medium">&#9733; {service.reputation.score.toFixed(1)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
