#!/usr/bin/env node
/**
 * Generates public/og-image.png (1200×630) — the social-share card surfaced
 * by Twitter/Facebook/LinkedIn/Slack/Discord previews of junction41.io.
 *
 * One-shot dependency: `sharp` (heavy native module — not in package.json
 * to keep prod installs lean). Install on demand:
 *   npm i sharp --no-save
 *   npm run og:generate
 *   git checkout package.json package-lock.json   # discard the install record
 *
 * Brand palette (matches src/index.css):
 *   bg     #060816
 *   accent #34D399  (emerald)
 *   text   #F8FAFC
 *
 * sharp ships rsvg + pango + fontconfig, so SVG is rasterized natively.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/og-image.png');

const W = 1200;
const H = 630;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#060816"/>
      <stop offset="100%" stop-color="#0B1226"/>
    </linearGradient>

    <radialGradient id="glow1" cx="0.85" cy="0.15" r="0.6">
      <stop offset="0%" stop-color="#34D399" stop-opacity="0.22"/>
      <stop offset="60%" stop-color="#34D399" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#34D399" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="glow2" cx="0.05" cy="0.95" r="0.55">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.10"/>
      <stop offset="70%" stop-color="#38BDF8" stop-opacity="0.02"/>
      <stop offset="100%" stop-color="#38BDF8" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="headline" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="15%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#34D399"/>
    </linearGradient>

    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#34D399" stop-opacity="0"/>
      <stop offset="50%" stop-color="#34D399" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#34D399" stop-opacity="0"/>
    </linearGradient>

    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#FFFFFF" stroke-opacity="0.025" stroke-width="1"/>
    </pattern>

    <linearGradient id="logoStroke" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#0EA5A0"/>
    </linearGradient>
  </defs>

  <!-- Base background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- Top bar: J41 logo block + wordmark + status -->
  <g transform="translate(80, 70)">
    <!-- Logo block: rounded square with emerald border + "J41" -->
    <rect x="0" y="0" width="76" height="76" rx="16" ry="16"
          fill="#0A1024" stroke="url(#logoStroke)" stroke-width="2.5"/>
    <rect x="6" y="6" width="64" height="64" rx="11" ry="11"
          fill="none" stroke="#34D399" stroke-opacity="0.18" stroke-width="1"/>
    <text x="38" y="52" text-anchor="middle"
          font-family="Inter, 'DejaVu Sans', system-ui, sans-serif"
          font-weight="800" font-size="30" fill="#F8FAFC"
          letter-spacing="-0.02em">J41</text>

    <!-- Wordmark next to logo -->
    <text x="100" y="36"
          font-family="Inter, 'DejaVu Sans', system-ui, sans-serif"
          font-weight="700" font-size="28" fill="#F8FAFC"
          letter-spacing="-0.02em">Junction41</text>
    <text x="100" y="62"
          font-family="'DejaVu Sans Mono', 'Courier New', monospace"
          font-weight="400" font-size="13" fill="#34D399"
          letter-spacing="0.18em">SOVEREIGN AGENT ECONOMY</text>
  </g>

  <!-- Status pill (top right) -->
  <g transform="translate(${W - 80 - 230}, 88)">
    <rect x="0" y="0" width="230" height="36" rx="18" ry="18"
          fill="#34D399" fill-opacity="0.08"
          stroke="#34D399" stroke-opacity="0.25" stroke-width="1"/>
    <circle cx="20" cy="18" r="4" fill="#34D399"/>
    <text x="34" y="23"
          font-family="'DejaVu Sans Mono', 'Courier New', monospace"
          font-weight="600" font-size="12" fill="#34D399"
          letter-spacing="0.18em">LIVE ON VRSCTEST</text>
  </g>

  <!-- Headline -->
  <g transform="translate(80, 270)">
    <text font-family="Inter, 'DejaVu Sans', system-ui, sans-serif"
          font-weight="800" font-size="78" fill="url(#headline)"
          letter-spacing="-0.035em">
      <tspan x="0" dy="0">Infrastructure for the</tspan>
      <tspan x="0" dy="92">agent economy.</tspan>
    </text>
  </g>

  <!-- Subhead -->
  <g transform="translate(80, 478)">
    <text font-family="Inter, 'DejaVu Sans', system-ui, sans-serif"
          font-weight="400" font-size="24" fill="#94A3B8"
          letter-spacing="-0.005em">
      Agents hire agents. Humans hire agents. Agents hire humans.
    </text>
  </g>

  <!-- Bottom rule + URL -->
  <g transform="translate(0, ${H - 60})">
    <rect x="80" y="0" width="${W - 160}" height="1" fill="url(#rule)"/>
    <text x="80" y="32"
          font-family="'DejaVu Sans Mono', 'Courier New', monospace"
          font-weight="500" font-size="14" fill="#64748B"
          letter-spacing="0.14em">SELF-SOVEREIGN · TRUSTLESS · ON-CHAIN REPUTATION</text>
    <text x="${W - 80}" y="32" text-anchor="end"
          font-family="'DejaVu Sans Mono', 'Courier New', monospace"
          font-weight="600" font-size="14" fill="#34D399"
          letter-spacing="0.10em">junction41.io</text>
  </g>
</svg>`;

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9, palette: false })
  .toFile(OUT);

const meta = await sharp(OUT).metadata();
console.log(`✓ wrote ${OUT}`);
console.log(`  ${meta.width}×${meta.height} ${meta.format} (${meta.size ?? '?'} bytes)`);
