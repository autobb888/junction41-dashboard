import { useState, useEffect } from 'react';
import { AlertTriangle, MessageSquare, RefreshCw, DollarSign, X, CheckCircle, Clock } from 'lucide-react';
import ResolvedId from './ResolvedId';

const API_BASE = import.meta.env.VITE_API_URL || '';

const ACTION_CONFIG = {
  pending: { icon: Clock, color: '#fbbf24', label: 'Awaiting Response' },
  refund: { icon: DollarSign, color: '#34d399', label: 'Refund Issued' },
  rework: { icon: RefreshCw, color: '#fbbf24', label: 'Rework Offered' },
  rejected: { icon: X, color: '#ef4444', label: 'Dispute Rejected' },
};

export default function DisputeTimeline({ jobId }) {
  const [dispute, setDispute] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    fetch(`${API_BASE}/v1/jobs/${jobId}/dispute`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.dispute) setDispute(data.dispute); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading || !dispute) return null;

  const config = ACTION_CONFIG[dispute.action] || ACTION_CONFIG.pending;
  const isPending = dispute.action === 'pending';
  const isRework = dispute.action === 'rework';
  const isResolved = dispute.resolved_at;

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(251, 191, 36, 0.15)' }}>
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-400" />
        Dispute
      </h3>

      <div className="relative pl-6 space-y-5">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-1 bottom-1 w-px" style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* Step 1: Filed */}
        <div className="relative">
          <div className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 border-2" style={{ borderColor: 'var(--bg-surface)' }} />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-amber-400">Dispute Filed</span>
              <span className="text-[10px] text-gray-600">{new Date(dispute.created_at).toLocaleString()}</span>
            </div>
            <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] text-gray-500">by</span>
                <ResolvedId address={dispute.raised_by} size="xs" />
              </div>
              <p className="text-gray-300 text-xs leading-relaxed">{dispute.reason}</p>
            </div>
          </div>
        </div>

        {/* Step 2: Agent Response (if responded) */}
        {!isPending && (
          <div className="relative">
            <div className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full border-2" style={{
              background: config.color,
              borderColor: 'var(--bg-surface)',
            }} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold" style={{ color: config.color }}>{config.label}</span>
                {dispute.resolved_at && (
                  <span className="text-[10px] text-gray-600">{new Date(dispute.resolved_at).toLocaleString()}</span>
                )}
              </div>
              <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {dispute.response && (
                  <p className="text-gray-300 text-xs leading-relaxed mb-2">{dispute.response}</p>
                )}
                <div className="flex flex-wrap gap-3 text-[11px]">
                  {dispute.action === 'refund' && dispute.refund_percent && (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <DollarSign size={11} /> {dispute.refund_percent}% refunded
                    </span>
                  )}
                  {dispute.refund_txid && (
                    <span className="text-gray-500 font-mono">TX: {dispute.refund_txid.slice(0, 12)}...</span>
                  )}
                  {isRework && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <RefreshCw size={11} />
                      {dispute.rework_cost > 0 ? `+${dispute.rework_cost} VRSC` : 'Free rework'}
                    </span>
                  )}
                  {isRework && dispute.rework_accepted !== null && (
                    <span className={dispute.rework_accepted ? 'text-emerald-400' : 'text-red-400'}>
                      {dispute.rework_accepted ? 'Buyer accepted' : 'Buyer declined'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Pending indicator */}
        {isPending && (
          <div className="relative">
            <div className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full border-2 border-gray-700" style={{
              background: 'var(--bg-surface)',
            }}>
              <div className="w-full h-full rounded-full animate-pulse" style={{ background: 'rgba(251,191,36,0.3)' }} />
            </div>
            <p className="text-xs text-gray-500 italic pt-0.5">Waiting for agent to respond...</p>
          </div>
        )}

        {/* Resolved marker */}
        {isResolved && (
          <div className="relative">
            <div className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full border-2" style={{
              background: dispute.action === 'rejected' ? '#ef4444' : '#34d399',
              borderColor: 'var(--bg-surface)',
            }} />
            <div className="flex items-center gap-1.5 pt-0.5">
              <CheckCircle size={12} style={{ color: dispute.action === 'rejected' ? '#ef4444' : '#34d399' }} />
              <span className="text-xs font-medium" style={{ color: dispute.action === 'rejected' ? '#ef4444' : '#34d399' }}>
                {dispute.action === 'rejected' ? 'Closed — Dispute Rejected' : 'Resolved'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
