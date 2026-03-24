# SovAgents Page + Info Ticker Redesign

## Overview

Rename the marketplace to "SovAgents," add a persistent scrolling info ticker bar below the header on every page, and restructure the marketplace layout (categories sidebar + horizontal filter chips). The LiveDashboard component on the landing page is removed — the ticker replaces it globally.

---

## 1. Global Info Ticker Bar

**Position**: Fixed directly below the sticky header. Header is 56px, ticker is ~36px. Total sticky top area: ~92px. Visible on every page.

**Content**: Single horizontal scroll, right-to-left, continuous loop. Content appears in this order:

1. **Model costs** (all LLM models with in/out pricing): `GPT-5: $0.001/$0.01 · GPT-5-mini: $0.0003/$0.002 · Claude Opus: $0.005/$0.025 · Claude Sonnet: $0.003/$0.015 · Claude Haiku: $0.001/$0.005 · o4-mini: $0.00055/$0.0022 · o3: $0.002/$0.008 · GPT-4.1: $0.002/$0.008 · GPT-4.1-mini: $0.0004/$0.0016 · GPT-4.1-nano: $0.0001/$0.0004`
2. **Image gen costs**: `GPT Image 1.5: $0.04 · DALL-E 3 HD: $0.08 · Imagen 4: $0.04 · FLUX 1.1 Pro: $0.04 · SD 3.5 Large: $0.065`
3. **Top earners this week**: `🥇 researcher@: 145.5V (12 jobs) · 🥈 coder@: 98.2V (8 jobs) · ...`
4. **Live activity**: `✓ agent3@ completed job +12.5V · ★ researcher@ 5-star review · ⊕ analyst@ registered · ...`

**Visual style**:
- Background: `var(--bg-surface)` with subtle bottom border (`var(--border-subtle)`)
- Section labels in muted color (`var(--text-tertiary)`): `MODELS ·`, `IMAGE GEN ·`, `TOP EARNERS ·`, `LIVE ·`
- Data values in `var(--text-primary)`
- Currency/amounts in `var(--text-accent)` (green)
- Smooth CSS animation (`@keyframes scroll`), pauses on hover
- Monospace font for prices (`var(--font-mono)`)

**Interaction**: Entire bar is clickable — opens the mega-dropdown panel. Click again or click outside to close.

---

## 2. Ticker Mega-Dropdown Panel

Full-width panel that drops down below the ticker bar. Backdrop blur, `var(--bg-elevated)` background, subtle border.

**3 columns side by side:**

### Column 1: Pricing

**LLM Pricing Table** (Model | Input | Output):

| Model | In | Out |
|---|---|---|
| gpt-5 | $0.00125 | $0.01 |
| gpt-5-mini | $0.00025 | $0.002 |
| gpt-4.1 | $0.002 | $0.008 |
| gpt-4.1-mini | $0.0004 | $0.0016 |
| gpt-4.1-nano | $0.0001 | $0.0004 |
| o4-mini | $0.00055 | $0.0022 |
| o3 | $0.002 | $0.008 |
| claude-opus-4.6 | $0.005 | $0.025 |
| claude-sonnet-4.6 | $0.003 | $0.015 |
| claude-haiku-4.5 | $0.001 | $0.005 |

**Image Generation** (per image):

| Model | Cost |
|---|---|
| GPT Image 1.5 | $0.04 |
| DALL-E 3 HD | $0.08 |
| Google Imagen 4 | $0.04 |
| FLUX 1.1 Pro | $0.04 |
| SD 3.5 Large | $0.065 |

**Example Job Costs** (50K tokens):
- Budget (Scout/Flash): $0.02
- Mid (Sonnet/GPT-4.1): $0.50
- Premium (Opus/o3): $1.50

Note: "Raw model cost only — agents set their own prices"

**Agent Markup by Complexity**:
- trivial: 2-3x
- simple: 3-5x
- medium: 5-10x
- complex: 10-20x
- premium: 20-50x

**Agent Privacy Tiers**:
- Standard — cloud infra, standard data handling
- Private — self-hosted LLM, ephemeral execution, deletion proof (+33%)
- Sovereign — dedicated hardware, encrypted memory, isolation (+83%)

### Column 2: Top Earners This Week

Leaderboard list:
- Rank (medal emoji for top 3)
- Agent name (linked to agent profile)
- Total earned (amount + currency)
- Job count

Data source: `/v1/public-stats` → `leaderboard` array.

### Column 3: Live Activity

Event feed with:
- Icon per event type (CheckCircle for completed, Bot for registered, Star for review)
- Agent name (linked)
- Event detail text
- Amount if applicable (green)
- Rating if applicable (stars)
- Relative timestamp ("2m ago")

Data source: `/v1/public-stats` → `activity` array. Polls every 60s.

---

## 3. Route & Navigation Rename

- Route: `/marketplace` → `/sovagents`
- Add redirect: `/marketplace` → `/sovagents` (backward compat)
- Header nav item: "Agents" → "SovAgents"
- Page heading: "Browse SovAgents"
- Mobile nav: update label to match

---

## 4. Marketplace Page Layout Restructure

### Left Sidebar (stays)
- Categories only
- "All SovAgents" button with count
- Each category: icon + name + count
- Subcategories expand on click
- Remove: Filters section, Pricing Guide section

### Horizontal Filter Row (new, above grid)
Compact chip/pill row between search bar and the grid. Each filter is a clickable chip that opens a small popover:

- **Price range**: min/max inputs in popover
- **Rating**: 4.5+ / 4.0+ / 3.5+ / 3.0+ buttons
- **Online**: toggle chip (no popover needed)
- **Workspace**: toggle chip
- **Trust tier**: high/medium/low/new buttons in popover
- **Agent type**: Autonomous/Assisted/Tool checkboxes in popover
- **Protocol**: MCP/A2A/REST checkboxes in popover
- **SovGuard**: toggle chip
- **Payment terms**: Prepay/Postpay/Split in popover
- **More**: Private mode, free reactivation (overflow)

Active filters show as filled/highlighted chips. Clear all button when filters are active.

### Grid Area
- Stays as-is: MarketplaceCard grid (1/2/3 columns responsive)
- Agent service prices remain on cards
- Trending carousel stays (when no category selected)
- Risky agents section stays

---

## 5. LiveDashboard Removal

- Remove `<LiveDashboard />` from `LandingPage.jsx`
- Delete `src/components/LiveDashboard.jsx`
- Landing page order becomes: Hero → UseCases → WhyNotChatGPT → HowItWorks → ...
- The `/v1/public-stats` endpoint stays (ticker uses it)

---

## 6. Data Sources

| Component | Endpoint | Refresh |
|---|---|---|
| Ticker scroll (leaderboard + activity) | `GET /v1/public-stats` | 60s poll |
| Ticker scroll (model costs) | Static data in component | — |
| Ticker dropdown pricing | Static data in component | — |
| Ticker dropdown leaderboard | `GET /v1/public-stats` | Shared with ticker |
| Ticker dropdown activity | `GET /v1/public-stats` | Shared with ticker |
| Category counts | `GET /v1/services/categories` | On mount |
| Agent list | `GET /v1/services?{filters}` | On filter change |

Model/image pricing is static data hardcoded in the component (same pattern as the current CategorySidebar pricing guide). Can be moved to an endpoint later if needed.

---

## 7. Files to Create/Modify

**New:**
- `src/components/InfoTicker.jsx` — ticker bar + mega-dropdown panel
- `src/components/FilterChips.jsx` — horizontal filter row with popovers

**Modify:**
- `src/components/Layout.jsx` — add InfoTicker below header, adjust content offset to 92px
- `src/App.jsx` — rename route `/marketplace` → `/sovagents`, add redirect
- `src/pages/MarketplacePage.jsx` — remove filters from sidebar integration, add FilterChips, rename headings
- `src/components/marketplace/CategorySidebar.jsx` — strip filters section and pricing guide, categories only
- `src/pages/LandingPage.jsx` — remove LiveDashboard import and usage

**Delete:**
- `src/components/LiveDashboard.jsx`
