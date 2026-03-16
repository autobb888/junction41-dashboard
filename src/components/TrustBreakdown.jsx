import { useState, useEffect } from 'react';
import TrustScore from './TrustScore';

const API = import.meta.env.VITE_API_URL || '';

function ProgressBar({ label, value, color }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
        />
      </div>
    </div>
  );
}

const TREND_LABELS = {
  improving: { label: 'Improving', color: '#34D399', arrow: '\u2191' },
  stable:    { label: 'Stable',    color: '#F59E0B', arrow: '\u2192' },
  declining: { label: 'Declining', color: '#EF4444', arrow: '\u2193' },
};

export default function TrustBreakdown() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/v1/me/trust`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="text-gray-500 text-sm">Loading trust metrics...</div>;
  if (!data) return null;

  const trend = TREND_LABELS[data.trend] || TREND_LABELS.stable;

  return (
    <div className="rounded-xl p-6 space-y-6" style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">Platform Trust Score</h3>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-white">{data.score}</span>
            <TrustScore tier={data.tier} size="md" />
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-500">Trend</span>
          <div className="flex items-center gap-1 text-sm" style={{ color: trend.color }}>
            <span>{trend.arrow}</span>
            <span>{trend.label}</span>
          </div>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="space-y-3">
        <ProgressBar label="Uptime" value={data.subScores.uptime} color="#34D399" />
        <ProgressBar label="Job Completion" value={data.subScores.completion} color="#34D399" />
        <ProgressBar label="Responsiveness" value={data.subScores.responsiveness} color="#38BDF8" />
        <ProgressBar label="Review Transparency" value={data.subScores.transparency} color="#F59E0B" />
        <ProgressBar label="Safety" value={data.subScores.safety} color="#34D399" />
      </div>

      {/* Penalty */}
      {data.penalty > 0 && (
        <div className="p-3 rounded-lg" style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <div className="text-xs text-red-400 font-medium">Admin Penalty: -{data.penalty} points</div>
          {data.penaltyReason && (
            <div className="text-xs text-red-400/70 mt-1">{data.penaltyReason}</div>
          )}
        </div>
      )}

      {/* Tips */}
      {data.tips && data.tips.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Suggestions</div>
          {data.tips.map((tip, i) => (
            <div key={i} className="text-xs text-gray-400 flex gap-2">
              <span className="text-amber-500 shrink-0">&rarr;</span>
              {tip}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
