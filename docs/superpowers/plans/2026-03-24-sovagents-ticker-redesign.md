# SovAgents Page + Info Ticker Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename marketplace to /sovagents, add a persistent scrolling info ticker below the header on every page with a click-to-expand mega-dropdown (pricing, leaderboard, activity), restructure the marketplace layout (categories sidebar + horizontal filter chips), and remove LiveDashboard from the landing page.

**Architecture:** The InfoTicker is a new global component rendered in Layout.jsx below the header. It fetches `/v1/public-stats` for leaderboard + activity data, and uses static pricing data. The FilterChips component replaces the sidebar filters in MarketplacePage. CategorySidebar is slimmed to categories-only. LiveDashboard is removed from LandingPage since the ticker replaces it globally.

**Tech Stack:** React 18, Vite, Tailwind-style utility classes with CSS custom properties (--bg-*, --text-*, --accent-*, --border-*, --font-*), Lucide React icons, React Router v6. Deploy: `sudo docker compose up -d --build`.

---

## File Structure

**New files:**
- `src/components/InfoTicker.jsx` — scrolling ticker bar + mega-dropdown panel (pricing tables, leaderboard, activity feed)
- `src/components/FilterChips.jsx` — horizontal filter chip row with popovers, replaces sidebar filters

**Modified files:**
- `src/components/Layout.jsx` — render InfoTicker below header, adjust content padding-top
- `src/App.jsx` — rename `/marketplace` route to `/sovagents`, add redirect
- `src/pages/MarketplacePage.jsx` — integrate FilterChips, remove sidebar filter props, rename headings
- `src/components/marketplace/CategorySidebar.jsx` — strip filters section and pricing guide, keep categories only
- `src/pages/LandingPage.jsx` — remove LiveDashboard import and rendering

**Deleted files:**
- `src/components/LiveDashboard.jsx` — replaced by InfoTicker globally

---

## Chunk 1: InfoTicker Component + Layout Integration

### Task 1: Create InfoTicker component

**Files:**
- Create: `src/components/InfoTicker.jsx`

This is the largest single component. It has two parts: the scrolling ticker bar (always visible) and the mega-dropdown panel (toggled on click).

- [ ] **Step 1: Create InfoTicker.jsx with static pricing data and scrolling bar**

```jsx
// src/components/InfoTicker.jsx
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Bot, Star, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { apiFetch } from '../utils/api';

// ── Static pricing data (same as old CategorySidebar pricing guide) ──

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

  // Fetch leaderboard + activity from /v1/public-stats
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Build ticker text segments
  const tickerSegments = [];

  // Model costs
  tickerSegments.push({ label: 'MODELS', items: LLM_MODELS.map(m => `${m.name}: $${m.input}/$${m.output}`) });
  // Image gen
  tickerSegments.push({ label: 'IMAGE GEN', items: IMAGE_MODELS.map(m => `${m.name}: $${m.cost}`) });
  // Top earners
  if (stats?.leaderboard?.length) {
    const medals = ['🥇', '🥈', '🥉'];
    tickerSegments.push({
      label: 'TOP EARNERS',
      items: stats.leaderboard.map((e, i) => `${medals[i] || ''} ${e.name}: ${Number(e.earned).toFixed(1)}V (${e.jobs} jobs)`),
    });
  }
  // Live activity
  if (stats?.activity?.length) {
    tickerSegments.push({
      label: 'LIVE',
      items: stats.activity.slice(0, 10).map(e => {
        let text = `${e.agentName || 'agent'} ${e.detail || e.type}`;
        if (e.amount) text += ` +${e.amount} ${e.currency || ''}`;
        if (e.rating) text += ` ★${e.rating}`;
        return text;
      }),
    });
  }

  const tickerText = tickerSegments.map(seg =>
    `  ${seg.label}  ·  ${seg.items.join('  ·  ')}`
  ).join('    ');

  // Double the text for seamless loop
  const doubled = tickerText + '    ' + tickerText;

  return (
    <div ref={panelRef} className="relative" style={{ zIndex: 40 }}>
      {/* ── Scrolling Ticker Bar ── */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full overflow-hidden"
        style={{
          height: 36,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'pointer',
        }}
      >
        <div
          className="whitespace-nowrap flex items-center h-full ticker-scroll"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-primary)',
            animationPlayState: 'running',
          }}
          onMouseEnter={e => e.currentTarget.style.animationPlayState = 'paused'}
          onMouseLeave={e => e.currentTarget.style.animationPlayState = 'running'}
        >
          <span>{doubled}</span>
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* ── Mega Dropdown Panel ── */}
      {open && (
        <div
          className="absolute top-full left-0 w-full overflow-auto"
          style={{
            maxHeight: 'calc(100vh - 92px)',
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

              {/* LLM table */}
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

              {/* Image gen table */}
              <div>
                <p className="text-xs mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Image generation (per image)</p>
                {IMAGE_MODELS.map(m => (
                  <div key={m.name} className="flex justify-between text-xs py-0.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{m.name}</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>${m.cost}</span>
                  </div>
                ))}
              </div>

              {/* Example costs */}
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

              {/* Markup tiers */}
              <div>
                <p className="text-xs mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Agent markup by complexity</p>
                {MARKUP_TIERS.map(t => (
                  <div key={t.level} className="flex justify-between text-xs py-0.5">
                    <span className="capitalize" style={{ color: 'var(--text-tertiary)' }}>{t.level}</span>
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{t.range}</span>
                  </div>
                ))}
              </div>

              {/* Privacy tiers */}
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
```

- [ ] **Step 2: Add ticker scroll CSS animation to index.css**

Add at the end of `src/index.css`:

```css
/* ── Info Ticker scroll animation ── */
@keyframes ticker-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.ticker-scroll span {
  display: inline-block;
  animation: ticker-scroll 120s linear infinite;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/InfoTicker.jsx src/index.css
git commit -m "feat: InfoTicker component — scrolling bar + mega-dropdown panel"
```

---

### Task 2: Integrate InfoTicker into Layout

**Files:**
- Modify: `src/components/Layout.jsx`

- [ ] **Step 1: Import InfoTicker and render below header**

In `src/components/Layout.jsx`:

Add import at the top (after other component imports):
```jsx
import InfoTicker from './InfoTicker';
```

Find the closing `</header>` tag (around line 190) and add InfoTicker immediately after it, before the main content area. The header is inside a sticky container — InfoTicker should be inside it too, so both scroll as one unit.

Replace the sticky header wrapper to include the ticker. Find the header's parent wrapper (the `<div>` or element with `className` containing `sticky top-0 z-50`). The header element itself has these classes. After the `</header>` closing tag, add:

```jsx
<InfoTicker />
```

Then find where the main content padding-top is set. Look for `pt-14` or `padding-top` related to the 56px header height and update it to account for the ticker (56px header + 36px ticker = 92px). Change `pt-14` to `pt-[92px]` wherever the main content offset is defined.

- [ ] **Step 2: Verify the header + ticker stack is sticky**

Ensure the sticky container wraps both `<header>` and `<InfoTicker />`. The structure should be:

```jsx
<div className="sticky top-0 z-50">
  <header className="h-14 ...">
    {/* nav content */}
  </header>
  <InfoTicker />
</div>
<main className="pt-[92px] ...">
  {/* page content */}
</main>
```

If the current layout doesn't use this wrapper pattern, create one.

- [ ] **Step 3: Commit**

```bash
git add src/components/Layout.jsx
git commit -m "feat: integrate InfoTicker below header in Layout"
```

---

## Chunk 2: Route Rename + FilterChips + Marketplace Restructure

### Task 3: Rename route and nav

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Layout.jsx`

- [ ] **Step 1: Update App.jsx routes**

In `src/App.jsx`, find the marketplace route (around line 85):
```jsx
<Route path="/marketplace" element={<MarketplacePage />} />
```
Change to:
```jsx
<Route path="/sovagents" element={<MarketplacePage />} />
<Route path="/marketplace" element={<Navigate to="/sovagents" replace />} />
```

- [ ] **Step 2: Update Layout.jsx nav links**

In `src/components/Layout.jsx`, find the nav item that links to `/marketplace` with label "Agents". Update:
- `to: '/marketplace'` → `to: '/sovagents'`
- `label: 'Agents'` → `label: 'SovAgents'`

Do this in all three nav arrays: `mainNav`, `mobileNav`, and any other navigation definitions.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx src/components/Layout.jsx
git commit -m "feat: rename /marketplace to /sovagents with redirect"
```

---

### Task 4: Create FilterChips component

**Files:**
- Create: `src/components/FilterChips.jsx`

- [ ] **Step 1: Create FilterChips.jsx**

This replaces the filters section from CategorySidebar. Each filter is a chip that can be toggled (for booleans) or opens a small popover (for multi-value).

```jsx
// src/components/FilterChips.jsx
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
          className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap"
          style={{
            background: active ? 'rgba(52, 211, 153, 0.15)' : 'var(--bg-surface)',
            color: active ? 'var(--accent)' : 'var(--text-secondary)',
            border: `1px solid ${active ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
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
    <div className="flex items-center gap-2 flex-wrap py-2">
      {/* Toggle chips */}
      <Chip label="Online" active={filters.onlineOnly} onClick={() => toggle('onlineOnly')} />
      <Chip label="Workspace" active={filters.workspaceOnly} onClick={() => toggle('workspaceOnly')} />
      <Chip label="SovGuard" active={filters.sovguard} onClick={() => toggle('sovguard')} />

      {/* Price range popover */}
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

      {/* Rating popover */}
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

      {/* Trust tier popover */}
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

      {/* Agent type popover */}
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

      {/* Protocol popover */}
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

      {/* Payment terms popover */}
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

      {/* More toggle chips */}
      <Chip label="Private" active={filters.privateMode} onClick={() => toggle('privateMode')} />
      <Chip label="Free Reactivation" active={filters.freeReactivation} onClick={() => toggle('freeReactivation')} />

      {/* Clear all */}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FilterChips.jsx
git commit -m "feat: FilterChips component — horizontal filter row with popovers"
```

---

### Task 5: Restructure MarketplacePage

**Files:**
- Modify: `src/pages/MarketplacePage.jsx`

- [ ] **Step 1: Import FilterChips and add it above the grid**

Add import:
```jsx
import FilterChips from '../components/FilterChips';
```

Find the JSX area between the search bar and the grid (around lines 310-360). Add `<FilterChips>` right after the search/sort controls row, before the trending carousel and browse heading:

```jsx
<FilterChips filters={filters} onFilterChange={setFilters} />
```

Where `setFilters` is a function that updates the filters state object. The existing `filters` state and `onFilterChange` prop from CategorySidebar should be reused — they use the same shape.

- [ ] **Step 2: Remove filter props from CategorySidebar usage**

Find where `<CategorySidebar>` is rendered (around line 363-375). Remove the `filters` and `onFilterChange` props since CategorySidebar will no longer handle filters:

Before:
```jsx
<CategorySidebar
  totalCount={...} categoryCounts={...} selected={...} onSelect={...}
  expanded={...} onToggle={...} selectedSub={...} onSubSelect={...}
  subCounts={...} filters={filters} onFilterChange={setFilters}
/>
```

After:
```jsx
<CategorySidebar
  totalCount={...} categoryCounts={...} selected={...} onSelect={...}
  expanded={...} onToggle={...} selectedSub={...} onSubSelect={...}
  subCounts={...}
/>
```

- [ ] **Step 3: Update page title and headings**

Find the page title (usePageTitle call or `<h2>`) and change:
- `"Browse All Agents"` → `"Browse SovAgents"` (or `"All SovAgents"`)
- Any reference to "Agents" in the heading area → "SovAgents"

Also remove the active filter pills section if it exists — FilterChips handles its own active state display.

- [ ] **Step 4: Update CategorySidebar sticky offset**

The CategorySidebar has `sticky top-24` (96px). With the new ticker, the total sticky header is 92px. Update the `top-24` in MarketplacePage (or CategorySidebar) to `top-[92px]` to account for header (56px) + ticker (36px).

- [ ] **Step 5: Commit**

```bash
git add src/pages/MarketplacePage.jsx
git commit -m "feat: integrate FilterChips, restructure marketplace layout"
```

---

### Task 6: Slim down CategorySidebar

**Files:**
- Modify: `src/components/marketplace/CategorySidebar.jsx`

- [ ] **Step 1: Remove filters section and pricing guide**

In `src/components/marketplace/CategorySidebar.jsx`:

1. Remove the `filtersOpen`/`setFiltersOpen` state (line 21)
2. Remove the `pricingOpen`/`setPricingOpen` state (line 22)
3. Remove the `pricingData`/`setPricingData` state (line 23)
4. Remove the pricing fetch useEffect (lines 25-29)
5. Remove the `filters` and `onFilterChange` props from the function signature (lines 17-18)
6. Remove the entire filters collapsible section (everything between the end of the categories `</nav>` and the pricing guide section — roughly lines 103-330)
7. Remove the entire pricing guide section (roughly lines 330-418)
8. Update the component's `sticky top-24` to `sticky top-[92px]`

The component should only have: the categories collapsible section (header + "All Agents" button + category list with subcategories).

- [ ] **Step 2: Commit**

```bash
git add src/components/marketplace/CategorySidebar.jsx
git commit -m "refactor: CategorySidebar — categories only, remove filters + pricing"
```

---

## Chunk 3: LiveDashboard Removal + Build Verification

### Task 7: Remove LiveDashboard from LandingPage

**Files:**
- Modify: `src/pages/LandingPage.jsx`
- Delete: `src/components/LiveDashboard.jsx`

- [ ] **Step 1: Remove LiveDashboard import and rendering**

In `src/pages/LandingPage.jsx`:

1. Remove the import (line 4):
   ```jsx
   import LiveDashboard from '../components/LiveDashboard';
   ```

2. Remove the `<LiveDashboard />` usage (line 645). The landing page should go straight from `<Hero />` to the next section (ValueTiles / UseCases or whatever follows).

- [ ] **Step 2: Delete LiveDashboard.jsx**

```bash
rm src/components/LiveDashboard.jsx
```

- [ ] **Step 3: Commit**

```bash
git add -u src/pages/LandingPage.jsx src/components/LiveDashboard.jsx
git commit -m "refactor: remove LiveDashboard — replaced by global InfoTicker"
```

---

### Task 8: Build and verify

- [ ] **Step 1: Build the dashboard container**

```bash
cd /home/bigbox/code/junction41-dashboard
sudo docker compose up -d --build
```

- [ ] **Step 2: Verify in browser**

Check these items:
1. Ticker bar appears below header on every page, scrolling right-to-left
2. Click ticker → mega-dropdown opens with 3 columns (pricing, leaderboard, activity)
3. Click outside or click ticker again → dropdown closes
4. Hover on ticker → scroll pauses
5. `/sovagents` route loads the marketplace page
6. `/marketplace` redirects to `/sovagents`
7. Header nav says "SovAgents" and links to `/sovagents`
8. CategorySidebar shows categories only (no filters, no pricing)
9. FilterChips row appears above the grid with all filter options
10. Filter chips open popovers, toggle states work
11. Landing page no longer shows LiveDashboard section
12. Agent cards still show service prices

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: post-build adjustments for sovagents redesign"
```

- [ ] **Step 4: Push**

```bash
git push
```
