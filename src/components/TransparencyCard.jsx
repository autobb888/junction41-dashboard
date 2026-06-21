import { useState, useEffect } from 'react';
import {
  Briefcase, AlertTriangle, Clock, Calendar, MessageSquare, Star,
  Database, Share2, Cpu, Server
} from 'lucide-react';
import TrustBadge from './TrustBadge';

const API_BASE = import.meta.env.VITE_API_URL || '';

function formatResponseTime(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} hr`;
}

function formatIdentityAge(days) {
  if (days == null) return '—';
  if (days < 1) return 'today';
  if (days < 365) return `${Math.round(days)} day${days >= 2 ? 's' : ''}`;
  return `${(days / 365).toFixed(1)} years`;
}

function RadialGauge({ value }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const [offset, setOffset] = useState(circ);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(circ - (circ * pct) / 100));
    return () => cancelAnimationFrame(id);
  }, [pct, circ]);
  return (
    <div style={{ position: 'relative', width: 132, height: 132, margin: '0 auto' }}>
      <svg width="132" height="132" viewBox="0 0 120 120">
        <defs>
          <linearGradient id="j41GaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34D399" />
            <stop offset="1" stopColor="#38BDF8" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--bg-overlay)" strokeWidth="9" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke="url(#j41GaugeGrad)" strokeWidth="9"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{
            transition: 'stroke-dashoffset 1.4s cubic-bezier(0.2,0.8,0.2,1)',
            filter: 'drop-shadow(0 0 5px rgba(52,211,153,0.6))',
          }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{Math.round(pct)}</span>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>Trust</span>
      </div>
    </div>
  );
}

function MetricTile({ icon: Icon, label, value }) {
  return (
    <div style={{ background: 'var(--bg-overlay)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <Icon size={12} /> {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function StatRow({ icon: Icon, label, value, muted }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <Icon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: muted ? 'var(--text-muted)' : 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

export default function TransparencyCard({ verusId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!verusId) return;
    setLoading(true);
    fetch(`${API_BASE}/v1/agents/${encodeURIComponent(verusId)}/transparency`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.data) setData(d.data); else setError('No data'); })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [verusId]);

  if (loading) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center' }} role="status" aria-label="Loading">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-verus-blue mx-auto" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (error || !data) return null;

  const v = data.verified || {};
  const d = data.declared || {};
  const c = data.computed || {};
  const trustLevel = c.trustLevel || 'new';
  const trustScore = c.trustScore ?? 0;
  const ratingValue = v.averageRating != null ? `${v.averageRating.toFixed(1)} ★` : '—';

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Transparency</h2>
        <TrustBadge level={trustLevel} score={trustScore} />
      </div>

      {/* Radial trust gauge */}
      <RadialGauge value={trustScore} />

      {/* Staleness warning */}
      {c.declarationStale && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', margin: '16px 0',
          borderRadius: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)',
          fontSize: 12, color: '#fbbf24',
        }}>
          <AlertTriangle size={14} /> Declarations may be outdated
        </div>
      )}

      {/* Verified — metric tiles */}
      <div style={{ marginTop: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
          Verified
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <MetricTile icon={Briefcase} label="Jobs done" value={v.jobsCompleted ?? '—'} />
          <MetricTile icon={AlertTriangle} label="Dispute rate" value={v.disputeRate != null ? `${(v.disputeRate * 100).toFixed(1)}%` : '—'} />
          <MetricTile icon={Clock} label="Avg response" value={formatResponseTime(v.avgResponseTimeSeconds)} />
          <MetricTile icon={Calendar} label="Identity age" value={formatIdentityAge(v.identityAgeDays)} />
          <MetricTile icon={MessageSquare} label="Reviews" value={v.reviewCount ?? '—'} />
          <MetricTile icon={Star} label="Rating" value={ratingValue} />
        </div>
      </div>

      {/* Declared */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
          Self-Declared
        </div>
        <StatRow icon={Database} label="Data retention" value={d.dataRetention || 'Not declared'} muted={!d.dataRetention} />
        <StatRow icon={Share2} label="Third-party sharing" value={d.thirdPartySharing || 'Not declared'} muted={!d.thirdPartySharing} />
        <StatRow icon={Cpu} label="AI model" value={d.aiModel || 'Not declared'} muted={!d.aiModel} />
        <StatRow icon={Server} label="Hosting" value={d.hosting || 'Not declared'} muted={!d.hosting} />
      </div>
    </div>
  );
}
