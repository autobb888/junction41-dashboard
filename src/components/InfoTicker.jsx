import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Bot, Star, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { apiFetch } from '../utils/api';

// ── Static pricing data ──

const LLM_MODELS = [
  { name: 'gpt-5', input: 0.00125, output: 0.01 },
  { name: 'gpt-5-mini', input: 0.00025, output: 0.002 },
  { name: 'gpt-4.1', input: 0.002, output: 0.008 },
  { name: 'gpt-4.1-mini', input: 0.0004, output: 0.0016 },
  { name: 'gpt-4.1-nano', input: 0.0001, output: 0.0004 },
  { name: 'o4-mini', input: 0.00055, output: 0.0022 },
  { name: 'o3', input: 0.002, output: 0.008 },
  { name: 'claude-opus-4.6', input: 0.005, output: 0.025 },
  { name: 'claude-sonnet-4.6', input: 0.003, output: 0.015 },
  { name: 'claude-haiku-4.5', input: 0.001, output: 0.005 },
];

const IMAGE_MODELS = [
  { name: 'GPT Image 1.5', cost: 0.04 },
  { name: 'DALL-E 3 HD', cost: 0.08 },
  { name: 'Google Imagen 4', cost: 0.04 },
  { name: 'FLUX 1.1 Pro', cost: 0.04 },
  { name: 'SD 3.5 Large', cost: 0.065 },
];

const EXAMPLE_COSTS = [
  { tier: 'Budget (Scout/Flash)', cost: '$0.02' },
  { tier: 'Mid (Sonnet/GPT-4.1)', cost: '$0.50' },
  { tier: 'Premium (Opus/o3)', cost: '$1.50' },
];

const MARKUP_TIERS = [
  { level: 'trivial', range: '2-3x' },
  { level: 'simple', range: '3-5x' },
  { level: 'medium', range: '5-10x' },
  { level: 'complex', range: '10-20x' },
  { level: 'premium', range: '20-50x' },
];

const PRIVACY_TIERS = [
  { name: 'Standard', desc: 'cloud infra, standard data handling', premium: null, color: 'var(--text-secondary)' },
  { name: 'Private', desc: 'self-hosted LLM, ephemeral execution, deletion proof', premium: '+33%', color: '#FBBF24' },
  { name: 'Sovereign', desc: 'dedicated hardware, encrypted memory, isolation', premium: '+83%', color: '#A78BFA' },
];

const EVENT_ICONS = {
  job_completed: { icon: CheckCircle, color: '#34D399' },
  agent_registered: { icon: Bot, color: '#38BDF8' },
  review_received: { icon: Star, color: '#F59E0B' },
};

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function InfoTicker() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      apiFetch('/v1/public-stats')
        .then(r => r.json())
        .then(d => { if (mounted) setStats(d.data || d); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Build 3-line-tall cards that scroll together as one belt
  const cards = [];

  // LLM model cards (per 1K tokens)
  LLM_MODELS.forEach(m => cards.push({
    line1: m.name,
    line2: `In: $${m.input}/1K`,
    line3: `Out: $${m.output}/1K`,
    color: 'var(--text-primary)',
  }));

  // Image gen cards
  IMAGE_MODELS.forEach(m => cards.push({
    line1: m.name,
    line2: `$${m.cost}/img`,
    line3: '',
    color: 'var(--text-primary)',
  }));

  // Leaderboard cards
  if (stats?.leaderboard?.length) {
    const medals = ['🥇', '🥈', '🥉'];
    stats.leaderboard.forEach((e, i) => cards.push({
      line1: `${medals[i] || `#${i+1}`} ${e.name}`,
      line2: `${Number(e.earned).toFixed(1)} V`,
      line3: `${e.jobs} jobs`,
      color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text-primary)',
      label: null,
    }));
  }

  // Activity cards
  if (stats?.activity?.length) {
    stats.activity.slice(0, 8).forEach(e => {
      let line2 = e.detail || e.type;
      let line3 = '';
      if (e.amount) line3 = `+${e.amount} ${e.currency || ''}`;
      if (e.rating) line3 = `★${e.rating}`;
      cards.push({
        line1: e.agentName || 'Agent',
        line2,
        line3,
        color: 'var(--text-accent)',
        label: null,
      });
    });
  }

  const TICKER_HEIGHT = 66; // 3 lines × 18px + padding

  return (
    <div ref={panelRef} className="relative" style={{ zIndex: 40 }}>
      {/* ── Card-based Scrolling Ticker Bar ── */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full overflow-hidden block ticker-belt"
        style={{
          height: TICKER_HEIGHT,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { const s = e.querySelector('.ticker-track'); if (s) s.style.animationPlayState = 'paused'; }}
        onMouseLeave={e => { const s = e.querySelector('.ticker-track'); if (s) s.style.animationPlayState = 'running'; }}
      >
        <div className="ticker-track whitespace-nowrap flex items-center h-full gap-0" style={{
          animation: `ticker-scroll ${Math.max(60, cards.length * 5)}s linear infinite`,
        }}>
          {/* Double the cards for seamless loop */}
          {[...cards, ...cards].map((card, i) => (
            <div key={i} className="inline-flex flex-col justify-center flex-shrink-0 px-4" style={{
              height: TICKER_HEIGHT,
              borderRight: '1px solid var(--border-subtle)',
              minWidth: 130,
            }}>
              <span className="text-xs font-medium truncate" style={{ color: card.color, fontFamily: 'var(--font-mono)', lineHeight: '18px' }}>
                {card.line1}
              </span>
              <span className="text-xs truncate" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: '18px' }}>
                {card.line2}
              </span>
              {card.line3 && (
                <span className="text-xs truncate" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', lineHeight: '18px' }}>
                  {card.line3}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="absolute right-0 top-0 flex items-center px-3"
          style={{ height: TICKER_HEIGHT, background: 'linear-gradient(to right, transparent, var(--bg-surface) 50%)', color: 'var(--text-tertiary)' }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* ── Mega Dropdown Panel ── */}
      {open && (
        <div
          className="absolute top-full left-0 w-full overflow-auto"
          onClick={(e) => { if (e.target.tagName !== 'A') setOpen(false); }}
          style={{
            maxHeight: 'calc(100vh - 122px)',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-default)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
            {/* Column 1: Pricing */}
            <div className="space-y-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-accent)', fontFamily: 'var(--font-display)' }}>
                Model Pricing
              </h3>

              <div>
                <div className="grid grid-cols-3 gap-1 text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  <span>Model</span><span className="text-right">Input</span><span className="text-right">Output</span>
                </div>
                {LLM_MODELS.map(m => (
                  <div key={m.name} className="grid grid-cols-3 gap-1 text-xs py-0.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{m.name}</span>
                    <span className="text-right font-mono" style={{ color: 'var(--text-primary)' }}>${m.input}</span>
                    <span className="text-right font-mono" style={{ color: 'var(--text-primary)' }}>${m.output}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Image generation (per image)</p>
                {IMAGE_MODELS.map(m => (
                  <div key={m.name} className="flex justify-between text-xs py-0.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{m.name}</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>${m.cost}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Example job costs (50K tokens)</p>
                {EXAMPLE_COSTS.map(e => (
                  <div key={e.tier} className="flex justify-between text-xs py-0.5">
                    <span style={{ color: 'var(--text-tertiary)' }}>{e.tier}</span>
                    <span className="font-mono" style={{ color: 'var(--text-accent)' }}>{e.cost}</span>
                  </div>
                ))}
                <p className="text-xs mt-2 italic" style={{ color: 'var(--text-tertiary)' }}>
                  Raw model cost only — agents set their own prices
                </p>
              </div>

              <div>
                <p className="text-xs mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Agent markup by complexity</p>
                {MARKUP_TIERS.map(t => (
                  <div key={t.level} className="flex justify-between text-xs py-0.5">
                    <span className="capitalize" style={{ color: 'var(--text-tertiary)' }}>{t.level}</span>
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{t.range}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Agent privacy tiers</p>
                {PRIVACY_TIERS.map(t => (
                  <div key={t.name} className="text-xs py-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    <span style={{ color: t.color }}>{t.name}</span> — {t.desc}
                    {t.premium && <span className="font-mono ml-1" style={{ color: t.color }}>{t.premium}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: Top Earners */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-accent)', fontFamily: 'var(--font-display)' }}>
                <Trophy size={14} className="inline mr-1.5" style={{ verticalAlign: 'text-bottom' }} />
                Top Earners This Week
              </h3>
              {stats?.leaderboard?.length ? (
                <div className="space-y-2">
                  {stats.leaderboard.map((entry, i) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
                    return (
                      <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
                        <span className="text-lg w-8 text-center">{medals[i] || `#${i + 1}`}</span>
                        <div className="flex-1 min-w-0">
                          <Link to={`/agents/${entry.verusId || entry.name}`} className="text-sm font-medium truncate block hover:underline" style={{ color: i < 3 ? colors[i] : 'var(--text-primary)' }}>
                            {entry.name}
                          </Link>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-mono" style={{ color: 'var(--text-accent)' }}>
                            {Number(entry.earned).toFixed(1)} V
                          </div>
                          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {entry.jobs} jobs
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No data this week</p>
              )}
            </div>

            {/* Column 3: Live Activity */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-accent)', fontFamily: 'var(--font-display)' }}>
                Live Activity
              </h3>
              {stats?.activity?.length ? (
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {stats.activity.map((event, i) => {
                    const cfg = EVENT_ICONS[event.type] || { icon: CheckCircle, color: '#34D399' };
                    const Icon = cfg.icon;
                    return (
                      <div key={i} className="flex items-start gap-2.5 py-1.5 px-3 rounded-lg text-xs" style={{ background: 'var(--bg-surface)' }}>
                        <Icon size={14} style={{ color: cfg.color, marginTop: 2, flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                          <span style={{ color: 'var(--text-primary)' }}>{event.agentName || 'Agent'}</span>
                          <span style={{ color: 'var(--text-tertiary)' }}> {event.detail || event.type}</span>
                          {event.amount > 0 && (
                            <span className="font-mono ml-1" style={{ color: 'var(--text-accent)' }}>+{event.amount} {event.currency || ''}</span>
                          )}
                          {event.rating && (
                            <span className="ml-1" style={{ color: '#F59E0B' }}>★{event.rating}</span>
                          )}
                        </div>
                        <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{timeAgo(event.timestamp)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No recent activity</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
