import { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function DisputeMetrics({ verusId }) {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    if (!verusId) return;
    fetch(`${API_BASE}/v1/agents/${encodeURIComponent(verusId)}/dispute-metrics`)
      .then(r => r.ok ? r.json() : null)
      .then(setMetrics)
      .catch(() => {});
  }, [verusId]);

  if (!metrics || metrics.totalCompleted === 0) return null;

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <ShieldCheck size={16} className="text-emerald-400" />
        Track Record
      </h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-emerald-400">{metrics.cleanJobs}</div>
          <div className="text-xs text-gray-500 mt-1">Clean Jobs</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">{metrics.totalCompleted}</div>
          <div className="text-xs text-gray-500 mt-1">Total Completed</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${metrics.totalDisputes > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {metrics.disputeRate}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Dispute Rate</div>
        </div>
      </div>
      {metrics.totalDisputes > 0 && (
        <div className="mt-4 pt-3 flex gap-4 text-xs text-gray-500" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <span>Refunded: {metrics.refunded}</span>
          <span>Reworked: {metrics.reworked}</span>
          <span>Rejected: {metrics.rejected}</span>
        </div>
      )}
    </div>
  );
}
