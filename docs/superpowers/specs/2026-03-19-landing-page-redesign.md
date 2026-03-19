# Landing Page Redesign — Full Platform Vision

## Overview

Redesign the landing page to reflect J41's full scope — not just "hire an agent" but the complete trustless agent economy: workspace access, on-chain reputation, multi-currency payments, and a developer ecosystem.

**Current state:** The landing page sells "hire an AI agent" with ~12 sections, some verbose, some outdated (WhyNotChatGPT). The platform has grown significantly — workspace, bounties, trust scores, dispute resolution, workspace attestations — none of which are properly represented.

**New direction:** Vision-first (D) with self-select paths (C). Lead with what J41 is becoming, then let visitors choose their path. 7 sections, no fluff, real data only.

## Section 1: Hero

**Headline:** The Junction where AI agents earn, build, and prove themselves
**Subheadline:** Self-sovereign identity. Trustless compute. On-chain reputation.

**4 CTAs:** 2 primary (filled), 2 secondary (outline)
- Browse Agents → `/marketplace` (primary)
- Post a Bounty → `/bounties` (primary)
- Host an Agent → `/developers` (secondary)
- Open Workspace → scrolls to `#workspace` section anchor (secondary)

Mobile: 2x2 grid.

No fake stats in the hero. Just the message and the four paths.

## Section 2: LiveDashboard (keep existing)

Real platform data from `/v1/public-stats`. Active agents, completed jobs, services, reviews. Weekly leaderboard. Activity feed. Polls every 60s.

No changes to functionality — this component already exists and shows honest data.

## Section 3: 6 Tiles

Value proposition grid. Each tile has a short title and a one-liner. No paragraphs, no icons-for-the-sake-of-icons.

| Tile | One-liner |
|------|-----------|
| Workspace Access | Agents work through a secure relay — your files never leave your machine |
| Trustless by Design | VerusID signatures on every action. No credentials shared. No platform custody. |
| SovGuard Protection | Bidirectional prompt injection scanning. Fail-closed. 169 test patterns. |
| On-Chain Reputation | Verifiable trust scores, workspace attestations, public dispute history |
| Multi-Currency Payments | VRSC, tBTC, vETH — settle on-chain, no bank account needed |
| Any Integration | SDK, Dispatcher, MCP Server — or point Claude/Cursor at it directly |

Same dark card style as existing landing page (`var(--lp-surface)`, `var(--lp-border)`).

## Section 4: How It Works

Two-path view — buyer and agent side by side (or tabbed on mobile).

**Buyer path:**
1. Browse the junction, find an agent
2. Hire with a signed job request
3. Pay on-chain
4. Open workspace — agent works on your code remotely, files stay local
5. Review, approve, done — attestation on-chain

**Agent path:**
1. Register a VerusID (free, platform-funded)
2. List services with pricing
3. Accept jobs, deliver work
4. Build reputation through attestations and reviews
5. Earn in any Verus currency

No fluff — just the steps. Each step is one line.

## Section 5: Workspace

The differentiator section — shows what makes J41 different from every other agent platform.

**Headline:** "Your code stays on your machine"
**Subheadline:** Agents work through a sandboxed relay. Docker isolation. SovGuard scanning. You approve every write.

**Interactive CLI builder:**
- Checkboxes: Read (always on, disabled) / Write
- Radio: Supervised (default) / Standard (mutually exclusive modes)
- Command updates live: `j41-connect ./my-project --uid <token> --read --write --supervised`
- `./my-project` and `--uid <token>` are static placeholders (not editable)
- Copy button with aria-live "Copied!" feedback
- Small flow diagram: `Your Machine ← Relay → Agent` (metadata only, no file contents stored)
- All toggles use semantic `<input>` elements for accessibility

**3 key points below the builder:**
- Docker sandboxed — no network, resource limits, agent can't escape
- SovGuard pre-scan — credentials and threats flagged before agent connects
- Full audit trail — every read/write logged with platform-signed attestation

## Section 6: For Developers

4 cards — one per integration path:

| Card | Description |
|------|-------------|
| Dispatcher | Multi-agent orchestration. Spawns workers per job, handles lifecycle, self-destructs. |
| SDK | TypeScript SDK. Full control over jobs, chat, workspace, reviews. |
| MCP Server | 43 tools, 10 resources. Claude, Cursor, Windsurf ready. |
| skills.md (OpenClaw) | Teach any AI agent your platform in one file. |

Each card has a "View on GitHub" link.

## Section 7: CTA + Footer

**Headline:** "Ready to join the junction?"
**4 CTAs repeated:** Browse Agents / Post a Bounty / Host an Agent / Open Workspace

Footer with links to docs, GitHub, app.j41.io.

## What's Removed

| Removed/Replaced Section | Why |
|--------------------------|-----|
| WhyNotChatGPT | Dated, defensive, talks about competitors not us |
| Architecture diagram | Too technical for landing page — belongs in docs |
| Roadmap section | Moves to docs or a separate page (data was stale anyway) |
| TrustSafety verbose section | Condensed into the 6 tiles |
| UseCases verbose section | Replaced by How It Works two-path |
| Dispatcher section | Condensed into For Developers 4-card grid |
| DeveloperTeaser | Replaced by the 4-card For Developers section |
| CTASection | Replaced by new Section 7 with 4 CTAs |

## Technical Notes

- Single file change: `src/pages/LandingPage.jsx`
- Workspace CLI builder is a new inline component (not a separate file — it's small)
- Reuses existing CSS variables and card patterns
- LiveDashboard component unchanged
- Keep the `Reveal` scroll-animation wrapper for section fade-ins (existing pattern)
- `Counter` utility can be removed if no longer used (LiveDashboard has its own)
- Mobile responsive: tiles go 2-column, How It Works tabs (default: buyer), CLI builder full-width, hero CTAs 2x2 grid
- SEO: update `<title>` and meta description to match new messaging
