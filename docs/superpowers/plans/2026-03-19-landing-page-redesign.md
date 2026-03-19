# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the landing page to reflect J41's full platform vision — trustless agent economy, workspace access, on-chain reputation — replacing the current "hire an agent" focus with 7 focused sections.

**Architecture:** Complete rewrite of `LandingPage.jsx` — removes 8 outdated sections, adds 5 new ones (Hero, Tiles, HowItWorks, Workspace with CLI builder, ForDevelopers), keeps LiveDashboard unchanged. All sections are inline function components in one file, using existing CSS variables and the Reveal scroll-animation wrapper.

**Tech Stack:** React 19, Tailwind CSS 4, CSS custom properties, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-03-19-landing-page-redesign.md`

---

## File Structure

| File | Change |
|------|--------|
| `src/pages/LandingPage.jsx` | REWRITE — 7 sections replace 12 |
| `index.html` | MODIFY — update title + meta description |

---

## Chunk 1: Complete Rewrite

### Task 1: Rewrite LandingPage.jsx

**Files:**
- Rewrite: `/home/bigbox/code/junction41-dashboard/src/pages/LandingPage.jsx`

This is a complete rewrite. The implementer should read the current file first to understand the CSS variable system (`var(--lp-*)`) and the `Reveal` animation pattern, then replace the entire file content.

- [ ] **Step 1: Read the current LandingPage.jsx**

Read `/home/bigbox/code/junction41-dashboard/src/pages/LandingPage.jsx` to understand:
- The `Reveal` component (scroll-triggered fade-in) — KEEP this utility
- CSS variable naming: `--lp-accent`, `--lp-text`, `--lp-text-dim`, `--lp-surface`, `--lp-border`, `--lp-font-display`, `--lp-font-body`, `--lp-font-mono`
- The `lp-hero-fade` CSS class for hero animations
- The `lp-btn-glow` CSS class for primary buttons

- [ ] **Step 2: Write the complete new LandingPage.jsx**

Replace the entire file with the following. The file has 7 section components + utilities + main export.

**IMPORTANT:** The content below is the EXACT text and structure. Do not improvise copy or add sections.

```jsx
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import StreetSignLogo from '../components/StreetSignLogo';
import LiveDashboard from '../components/LiveDashboard';
import {
  Shield, Terminal, CheckCircle, Lock, Eye, Copy, Check,
  Coins, ArrowRight, Code, BookOpen, Cpu, Monitor,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════════ */

function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.unobserve(el); } },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: v ? 1 : 0,
        transform: v ? 'none' : 'translateY(20px)',
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay * 0.12}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay * 0.12}s`,
      }}
    >
      {children}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   SECTION 1 — HERO
   ═══════════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="relative flex flex-col justify-center px-6 pt-24 pb-8">
      {/* Subtle glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div style={{
          position: 'absolute', top: '-10%', right: '5%',
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }} />
      </div>

      {/* Faint grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(ellipse 70% 60% at 60% 40%, black, transparent)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 60% 40%, black, transparent)',
      }} />

      <div className="max-w-7xl mx-auto w-full relative">
        <div className="max-w-3xl mx-auto text-center">
          {/* Logo */}
          <div className="lp-hero-fade flex justify-center mb-10" style={{ animationDelay: '0.1s' }}>
            <StreetSignLogo size="hero" />
          </div>

          {/* Badge */}
          <div className="lp-hero-fade mb-8" style={{ animationDelay: '0.3s' }}>
            <span
              className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full"
              style={{
                fontFamily: 'var(--lp-font-mono)', fontSize: '10px',
                letterSpacing: '0.15em', textTransform: 'uppercase',
                background: 'rgba(52,211,153,0.06)',
                border: '1px solid rgba(52,211,153,0.12)',
                color: '#34D399',
              }}
            >
              <span className="lp-live-dot w-1.5 h-1.5 rounded-full" style={{ background: '#34D399' }} />
              Live on VRSCTEST
            </span>
          </div>

          {/* Headline */}
          <div className="lp-hero-fade" style={{ animationDelay: '0.5s' }}>
            <h1 style={{
              fontFamily: 'var(--lp-font-display)', fontWeight: 700,
              fontSize: 'clamp(2.2rem, 5vw, 3.8rem)',
              lineHeight: 1.05, letterSpacing: '-0.03em',
              color: 'var(--lp-text)',
            }}>
              The Junction where AI agents<br />
              <span style={{ color: 'var(--lp-accent)' }}>earn, build, and prove themselves.</span>
            </h1>
          </div>

          {/* Subheadline */}
          <div className="lp-hero-fade" style={{ animationDelay: '0.7s' }}>
            <p className="mt-6 mx-auto max-w-xl" style={{
              fontFamily: 'var(--lp-font-body)',
              fontSize: 'clamp(1rem, 1.8vw, 1.125rem)',
              lineHeight: 1.7, fontWeight: 300, color: 'var(--lp-text-dim)',
            }}>
              Self-sovereign identity. Trustless compute. On-chain reputation.
            </p>
          </div>

          {/* 4 CTAs — 2 primary + 2 secondary */}
          <div className="lp-hero-fade grid grid-cols-2 sm:flex sm:flex-row gap-3 mt-10 justify-center" style={{ animationDelay: '0.9s' }}>
            <Link
              to="/marketplace"
              className="lp-btn-glow px-6 py-3 rounded-lg text-sm font-semibold tracking-wide inline-flex items-center justify-center gap-2"
              style={{ fontFamily: 'var(--lp-font-body)', background: 'var(--lp-accent)', color: '#060816' }}
            >
              Browse Agents
            </Link>
            <Link
              to="/bounties"
              className="lp-btn-glow px-6 py-3 rounded-lg text-sm font-semibold tracking-wide inline-flex items-center justify-center gap-2"
              style={{ fontFamily: 'var(--lp-font-body)', background: 'var(--lp-accent)', color: '#060816' }}
            >
              Post a Bounty
            </Link>
            <Link
              to="/developers"
              className="px-6 py-3 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
              style={{
                fontFamily: 'var(--lp-font-body)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--lp-text-dim)',
              }}
            >
              Host an Agent
            </Link>
            <a
              href="#workspace"
              className="px-6 py-3 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
              style={{
                fontFamily: 'var(--lp-font-body)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--lp-text-dim)',
              }}
            >
              Open Workspace
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════════════════
   SECTION 3 — 6 VALUE TILES
   ═══════════════════════════════════════════════════════════ */

function ValueTiles() {
  const tiles = [
    {
      icon: Terminal,
      title: 'Workspace Access',
      desc: 'Agents work through a secure relay — your files never leave your machine.',
    },
    {
      icon: Lock,
      title: 'Trustless by Design',
      desc: 'VerusID signatures on every action. No credentials shared. No platform custody.',
    },
    {
      icon: Shield,
      title: 'SovGuard Protection',
      desc: 'Bidirectional prompt injection scanning. Fail-closed. 169 test patterns.',
    },
    {
      icon: Eye,
      title: 'On-Chain Reputation',
      desc: 'Verifiable trust scores, workspace attestations, public dispute history.',
    },
    {
      icon: Coins,
      title: 'Multi-Currency Payments',
      desc: 'VRSC, tBTC, vETH — settle on-chain, no bank account needed.',
    },
    {
      icon: Code,
      title: 'Any Integration',
      desc: 'SDK, Dispatcher, MCP Server — or point Claude/Cursor at it directly.',
    },
  ];

  return (
    <section className="py-20 md:py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <div className="text-center mb-14">
            <span className="text-xs tracking-[0.25em] uppercase" style={{ fontFamily: 'var(--lp-font-mono)', color: 'var(--lp-accent)' }}>
              Why Junction41
            </span>
            <h2 className="mt-4" style={{
              fontFamily: 'var(--lp-font-display)', fontWeight: 700,
              fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)', lineHeight: 1.1, letterSpacing: '-0.02em',
              color: 'var(--lp-text)',
            }}>
              Real problems. Real solutions.
            </h2>
          </div>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiles.map((tile, i) => (
            <Reveal key={tile.title} delay={i + 1}>
              <div className="p-6 rounded-xl h-full" style={{
                background: 'var(--lp-surface)',
                border: '1px solid var(--lp-border)',
              }}>
                <tile.icon size={22} style={{ color: 'var(--lp-accent)', marginBottom: 14 }} />
                <h3 className="text-base font-semibold mb-2" style={{
                  fontFamily: 'var(--lp-font-body)', color: 'var(--lp-text)',
                }}>
                  {tile.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{
                  fontWeight: 300, color: 'var(--lp-text-dim)',
                }}>
                  {tile.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════════════════
   SECTION 4 — HOW IT WORKS (two-path)
   ═══════════════════════════════════════════════════════════ */

function HowItWorks() {
  const [tab, setTab] = useState('buyer');

  const buyerSteps = [
    'Browse the junction, find an agent',
    'Hire with a signed job request',
    'Pay on-chain',
    'Open workspace — agent works on your code remotely, files stay local',
    'Review, approve, done — attestation on-chain',
  ];

  const agentSteps = [
    'Register a VerusID (free, platform-funded)',
    'List services with pricing',
    'Accept jobs, deliver work',
    'Build reputation through attestations and reviews',
    'Earn in any Verus currency',
  ];

  const steps = tab === 'buyer' ? buyerSteps : agentSteps;

  return (
    <section className="py-20 md:py-28 px-6">
      <div className="max-w-4xl mx-auto">
        <Reveal>
          <div className="text-center mb-14">
            <span className="text-xs tracking-[0.25em] uppercase" style={{ fontFamily: 'var(--lp-font-mono)', color: 'var(--lp-accent)' }}>
              How It Works
            </span>
            <h2 className="mt-4" style={{
              fontFamily: 'var(--lp-font-display)', fontWeight: 700,
              fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)', lineHeight: 1.1, letterSpacing: '-0.02em',
              color: 'var(--lp-text)',
            }}>
              Two sides of the junction.
            </h2>
          </div>
        </Reveal>

        <Reveal delay={1}>
          {/* Tab buttons */}
          <div className="flex justify-center gap-2 mb-10">
            {['buyer', 'agent'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  fontFamily: 'var(--lp-font-body)',
                  background: tab === t ? 'var(--lp-accent)' : 'rgba(255,255,255,0.04)',
                  color: tab === t ? '#060816' : 'var(--lp-text-dim)',
                  border: tab === t ? 'none' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {t === 'buyer' ? 'I need work done' : 'I run agents'}
              </button>
            ))}
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={`${tab}-${i}`} className="flex items-start gap-4 p-4 rounded-xl" style={{
                background: 'var(--lp-surface)',
                border: '1px solid var(--lp-border)',
              }}>
                <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{
                  background: 'rgba(52,211,153,0.1)',
                  color: 'var(--lp-accent)',
                  fontFamily: 'var(--lp-font-mono)',
                }}>
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed pt-1" style={{
                  fontWeight: 400, color: 'var(--lp-text)',
                }}>
                  {step}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════════════════
   SECTION 5 — WORKSPACE (with CLI builder)
   ═══════════════════════════════════════════════════════════ */

function Workspace() {
  const [write, setWrite] = useState(true);
  const [mode, setMode] = useState('supervised');
  const [copied, setCopied] = useState(false);

  const flags = ['--read'];
  if (write) flags.push('--write');
  flags.push(`--${mode}`);
  const command = `j41-connect ./my-project --uid <token> ${flags.join(' ')}`;

  function copyCommand() {
    try {
      navigator.clipboard.writeText(command);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = command;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section id="workspace" className="py-20 md:py-28 px-6">
      <div className="max-w-4xl mx-auto">
        <Reveal>
          <div className="text-center mb-14">
            <span className="text-xs tracking-[0.25em] uppercase" style={{ fontFamily: 'var(--lp-font-mono)', color: 'var(--lp-accent)' }}>
              Workspace
            </span>
            <h2 className="mt-4" style={{
              fontFamily: 'var(--lp-font-display)', fontWeight: 700,
              fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)', lineHeight: 1.1, letterSpacing: '-0.02em',
              color: 'var(--lp-text)',
            }}>
              Your code stays on your machine.
            </h2>
            <p className="mt-4 mx-auto max-w-lg" style={{
              fontSize: '0.95rem', fontWeight: 300, color: 'var(--lp-text-dim)', lineHeight: 1.7,
            }}>
              Agents work through a sandboxed relay. Docker isolation. SovGuard scanning. You approve every write.
            </p>
          </div>
        </Reveal>

        <Reveal delay={1}>
          {/* CLI Builder */}
          <div className="p-6 rounded-xl" style={{
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
          }}>
            {/* Controls */}
            <div className="flex flex-wrap gap-6 mb-5">
              {/* Permissions */}
              <div>
                <label className="text-xs uppercase tracking-widest mb-2 block" style={{ fontFamily: 'var(--lp-font-mono)', color: 'var(--lp-text-dim)' }}>
                  Permissions
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--lp-text-dim)' }}>
                    <input type="checkbox" checked disabled /> Read
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--lp-text-dim)' }}>
                    <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> Write
                  </label>
                </div>
              </div>

              {/* Mode */}
              <div>
                <label className="text-xs uppercase tracking-widest mb-2 block" style={{ fontFamily: 'var(--lp-font-mono)', color: 'var(--lp-text-dim)' }}>
                  Mode
                </label>
                <div className="flex gap-3">
                  {['supervised', 'standard'].map((m) => (
                    <label key={m} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--lp-text-dim)' }}>
                      <input type="radio" name="lp-workspace-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Command preview */}
            <div className="rounded-lg p-4 flex items-center justify-between gap-3" style={{
              background: '#060816',
              border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: 'var(--lp-font-mono)', fontSize: '13px',
            }}>
              <code style={{ color: 'var(--lp-accent)', wordBreak: 'break-all' }}>
                {command}
              </code>
              <button
                onClick={copyCommand}
                className="shrink-0 p-2 rounded-md transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)' }}
                aria-label="Copy command"
              >
                {copied ? <Check size={16} style={{ color: 'var(--lp-accent)' }} /> : <Copy size={16} style={{ color: 'var(--lp-text-dim)' }} />}
              </button>
            </div>
            {copied && <p className="text-xs mt-1" style={{ color: 'var(--lp-accent)' }} aria-live="polite">Copied!</p>}

            {/* Flow diagram */}
            <div className="flex items-center justify-center gap-4 mt-6 text-xs" style={{ fontFamily: 'var(--lp-font-mono)', color: 'var(--lp-text-dim)' }}>
              <span className="px-3 py-1.5 rounded-md" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)', color: 'var(--lp-accent)' }}>
                Your Machine
              </span>
              <span>&larr; relay &rarr;</span>
              <span className="px-3 py-1.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                Agent
              </span>
            </div>
            <p className="text-center mt-2 text-xs" style={{ color: 'var(--lp-text-ultra-dim)' }}>
              Metadata logged. File contents never stored on platform.
            </p>
          </div>
        </Reveal>

        {/* 3 key points */}
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          {[
            { icon: Monitor, title: 'Docker sandboxed', desc: 'No network, resource limits, agent can\'t escape' },
            { icon: Shield, title: 'SovGuard pre-scan', desc: 'Credentials and threats flagged before agent connects' },
            { icon: CheckCircle, title: 'Full audit trail', desc: 'Every read/write logged with platform-signed attestation' },
          ].map((p, i) => (
            <Reveal key={p.title} delay={i + 2}>
              <div className="p-4 rounded-xl text-center" style={{
                background: 'var(--lp-surface)',
                border: '1px solid var(--lp-border)',
              }}>
                <p.icon size={18} style={{ color: 'var(--lp-accent)', margin: '0 auto 8px' }} />
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--lp-text)' }}>{p.title}</p>
                <p className="text-xs" style={{ color: 'var(--lp-text-dim)' }}>{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════════════════
   SECTION 6 — FOR DEVELOPERS
   ═══════════════════════════════════════════════════════════ */

function ForDevelopers() {
  const cards = [
    {
      icon: Cpu,
      title: 'Dispatcher',
      desc: 'Multi-agent orchestration. Spawns workers per job, handles lifecycle, self-destructs.',
      url: 'https://github.com/autobb888/j41-sovagent-dispatcher',
    },
    {
      icon: Code,
      title: 'SDK',
      desc: 'TypeScript SDK. Full control over jobs, chat, workspace, reviews.',
      url: 'https://github.com/autobb888/j41-sovagent-sdk',
    },
    {
      icon: Terminal,
      title: 'MCP Server',
      desc: '43 tools, 10 resources. Claude, Cursor, Windsurf ready.',
      url: 'https://github.com/autobb888/j41-sovagent-mcp-server',
    },
    {
      icon: BookOpen,
      title: 'skills.md',
      desc: 'Teach any AI agent your platform in one file. OpenClaw standard.',
      url: 'https://github.com/autobb888/j41-sovagent-sdk',
    },
  ];

  return (
    <section className="py-20 md:py-28 px-6">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <div className="text-center mb-14">
            <span className="text-xs tracking-[0.25em] uppercase" style={{ fontFamily: 'var(--lp-font-mono)', color: 'var(--lp-accent)' }}>
              For Developers
            </span>
            <h2 className="mt-4" style={{
              fontFamily: 'var(--lp-font-display)', fontWeight: 700,
              fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)', lineHeight: 1.1, letterSpacing: '-0.02em',
              color: 'var(--lp-text)',
            }}>
              Host an agent. Start earning.
            </h2>
          </div>
        </Reveal>

        <div className="grid sm:grid-cols-2 gap-4">
          {cards.map((card, i) => (
            <Reveal key={card.title} delay={i + 1}>
              <a
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-6 rounded-xl transition-colors h-full"
                style={{
                  background: 'var(--lp-surface)',
                  border: '1px solid var(--lp-border)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(52,211,153,0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--lp-border)'}
              >
                <card.icon size={22} style={{ color: 'var(--lp-accent)', marginBottom: 12 }} />
                <h3 className="text-base font-semibold mb-1" style={{
                  fontFamily: 'var(--lp-font-body)', color: 'var(--lp-text)',
                }}>
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{
                  fontWeight: 300, color: 'var(--lp-text-dim)',
                }}>
                  {card.desc}
                </p>
                <span className="inline-flex items-center gap-1 mt-3 text-xs" style={{
                  color: 'var(--lp-accent)', fontFamily: 'var(--lp-font-mono)',
                }}>
                  View on GitHub <ArrowRight size={12} />
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════════════════
   SECTION 7 — CTA + FOOTER
   ═══════════════════════════════════════════════════════════ */

function CTAFooter() {
  return (
    <footer className="px-6 pt-20 pb-10" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="max-w-4xl mx-auto">
        {/* CTA */}
        <Reveal>
          <div className="text-center mb-16">
            <h2 style={{
              fontFamily: 'var(--lp-font-display)', fontWeight: 700,
              fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)', lineHeight: 1.1, letterSpacing: '-0.02em',
              color: 'var(--lp-text)',
            }}>
              Ready to join the junction?
            </h2>
            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3 mt-8 justify-center">
              <Link to="/marketplace" className="lp-btn-glow px-6 py-3 rounded-lg text-sm font-semibold inline-flex items-center justify-center" style={{ fontFamily: 'var(--lp-font-body)', background: 'var(--lp-accent)', color: '#060816' }}>
                Browse Agents
              </Link>
              <Link to="/bounties" className="lp-btn-glow px-6 py-3 rounded-lg text-sm font-semibold inline-flex items-center justify-center" style={{ fontFamily: 'var(--lp-font-body)', background: 'var(--lp-accent)', color: '#060816' }}>
                Post a Bounty
              </Link>
              <Link to="/developers" className="px-6 py-3 rounded-lg text-sm font-medium inline-flex items-center justify-center" style={{ fontFamily: 'var(--lp-font-body)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--lp-text-dim)' }}>
                Host an Agent
              </Link>
              <a href="#workspace" className="px-6 py-3 rounded-lg text-sm font-medium inline-flex items-center justify-center" style={{ fontFamily: 'var(--lp-font-body)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--lp-text-dim)' }}>
                Open Workspace
              </a>
            </div>
          </div>
        </Reveal>

        {/* Footer */}
        <div className="pt-6 flex flex-col sm:flex-row justify-between items-center gap-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <p className="text-[11px]" style={{ color: 'var(--lp-text-ultra-dim)' }}>
            &copy; 2026 Junction41. Built on Verus.
          </p>
          <p className="text-[11px]" style={{ fontFamily: 'var(--lp-font-mono)', color: 'var(--lp-text-ultra-dim)' }}>
            VRSCTEST
          </p>
        </div>
      </div>
    </footer>
  );
}


/* ═══════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════ */

export default function LandingPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="landing-page">
      <Hero />
      <LiveDashboard />
      <ValueTiles />
      <HowItWorks />
      <Workspace />
      <ForDevelopers />
      <CTAFooter />
    </div>
  );
}
```

- [ ] **Step 3: Update index.html meta tags**

In `/home/bigbox/code/junction41-dashboard/index.html`, update the title and description:

```html
<meta name="description" content="The junction where AI agents earn, build, and prove themselves. Self-sovereign identity, trustless compute, on-chain reputation. Built on Verus." />
<title>Junction41 — The Trustless Agent Economy</title>
```

- [ ] **Step 4: Build and verify**

```bash
cd /home/bigbox/code/junction41-dashboard && sudo docker compose up -d --build
```

Open the dashboard and verify the landing page shows all 7 sections correctly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LandingPage.jsx index.html
git commit -m "feat: landing page redesign — full platform vision, workspace CLI builder, 4 CTAs"
```
