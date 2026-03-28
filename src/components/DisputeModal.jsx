import { useState } from 'react';
import { AlertTriangle, RefreshCw, X, DollarSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';

function buildSignCmd(idName, message) {
  return `signmessage "${idName}" "${message.replace(/"/g, '\\"')}"`;
}

export default function DisputeModal({ job, dispute, role, onClose, onAction }) {
  const { user } = useAuth();
  // role: 'buyer' or 'seller'
  // dispute: null (filing) or existing dispute object
  const [reason, setReason] = useState('');
  const [response, setResponse] = useState('');
  const [action, setAction] = useState('refund');
  const [refundPercent, setRefundPercent] = useState(50);
  const [reworkCost, setReworkCost] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sig, setSig] = useState('');
  const [ts] = useState(() => Math.floor(Date.now() / 1000));

  const isFilingPhase = !dispute;
  const isRespondPhase = dispute?.action === 'pending' && role === 'seller';
  const isReworkAcceptPhase = dispute?.action === 'rework' && !dispute?.rework_accepted && role === 'buyer';

  const idName = user?.identityName ? `${user.identityName}@` : 'yourID@';

  // Sign message templates
  const fileMsg = `J41-DISPUTE|Job:${job.jobHash}|Reason:${reason}|Ts:${ts}|I am raising a dispute on this job.`;
  const respondMsg = `J41-DISPUTE-RESPOND|Job:${job.jobHash}|Action:${action}|Msg:${response}|Ts:${ts}|I respond to this dispute.`;
  const reworkAcceptMsg = `J41-REWORK-ACCEPT|Job:${job.jobHash}|Ts:${ts}|I accept the rework terms.`;

  function handleSigInput(val) {
    if (val.trim().startsWith('{')) {
      try { const p = JSON.parse(val.trim()); if (p.signature) val = p.signature; } catch { /* not JSON */ }
    }
    setSig(val);
  }

  async function handleFile() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/dispute`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, timestamp: ts, signature: sig.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to file dispute');
      }
      onAction?.('filed');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRespond() {
    setLoading(true);
    setError('');
    try {
      const body = {
        action,
        message: response,
        timestamp: ts,
        signature: sig.trim(),
      };
      if (action === 'refund') body.refundPercent = refundPercent;
      if (action === 'rework') body.reworkCost = reworkCost;

      const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/dispute/respond`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to respond');
      }
      onAction?.('responded');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReworkAccept() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/dispute/rework-accept`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: ts, signature: sig.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed');
      }
      onAction?.('rework_accepted');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function SignatureSection({ message }) {
    const cmd = buildSignCmd(idName, message);
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs text-gray-400">Sign this in Verus CLI or Desktop console:</p>
        <div className="rounded-lg p-3 font-mono text-xs break-all whitespace-pre-wrap select-all"
          style={{ background: 'var(--bg-inset)', color: 'var(--accent-blue, #60a5fa)', border: '1px solid var(--border-subtle)' }}>
          {cmd}
        </div>
        <input
          type="text"
          value={sig}
          onChange={e => handleSigInput(e.target.value)}
          className="w-full rounded-lg p-2 text-sm font-mono text-white"
          style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
          placeholder="Paste signature (AW1B...)"
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-xl p-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-400" />
            <h3 className="text-base font-bold text-white">
              {isFilingPhase ? 'File a Dispute' : isRespondPhase ? 'Respond to Dispute' : 'Rework Offer'}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Filing phase — buyer */}
        {isFilingPhase && (
          <>
            <p className="text-sm text-gray-400 mb-3">Describe the issue with the delivered work.</p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full rounded-lg p-3 text-sm text-white resize-none"
              style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
              rows={4}
              placeholder="What went wrong?"
              maxLength={2000}
            />
            <p className="text-xs text-gray-500 mt-1 text-right">{reason.length}/2000</p>
            {reason.length >= 10 && <SignatureSection message={fileMsg} />}
            <button
              onClick={handleFile}
              disabled={loading || reason.length < 10 || !sig.trim()}
              className="w-full mt-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 text-black disabled:opacity-50"
            >
              {loading ? 'Filing...' : 'File Dispute'}
            </button>
          </>
        )}

        {/* Respond phase — agent */}
        {isRespondPhase && (
          <>
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-inset)' }}>
              <p className="text-xs text-gray-500 mb-1">Buyer says:</p>
              <p className="text-sm text-gray-300 italic">{dispute.reason}</p>
            </div>

            {/* Action selector */}
            <div className="flex gap-2 mb-4">
              {[
                { key: 'refund', label: 'Refund', icon: DollarSign },
                { key: 'rework', label: 'Rework', icon: RefreshCw },
                { key: 'rejected', label: 'Reject', icon: X },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setAction(opt.key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    action === opt.key ? 'text-white' : 'text-gray-500'
                  }`}
                  style={{
                    background: action === opt.key ? 'rgba(255,255,255,0.1)' : 'transparent',
                    border: `1px solid ${action === opt.key ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <opt.icon size={14} /> {opt.label}
                </button>
              ))}
            </div>

            {/* Refund slider */}
            {action === 'refund' && (
              <div className="mb-4">
                <label className="text-xs text-gray-400 mb-1 block">Refund: {refundPercent}%</label>
                <input
                  type="range" min={10} max={100} step={5}
                  value={refundPercent}
                  onChange={e => setRefundPercent(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
                {job.amount && (
                  <p className="text-xs text-emerald-400 mt-1">
                    {((job.amount * refundPercent) / 100).toFixed(4)} {job.currency || 'VRSCTEST'} back to buyer
                  </p>
                )}
              </div>
            )}

            {/* Rework cost */}
            {action === 'rework' && (
              <div className="mb-4">
                <label className="text-xs text-gray-400 mb-1 block">Additional cost (0 = free rework)</label>
                <input
                  type="number" min={0} step={0.001}
                  value={reworkCost}
                  onChange={e => setReworkCost(Number(e.target.value))}
                  className="w-full rounded-lg p-2 text-sm text-white"
                  style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
                />
              </div>
            )}

            <textarea
              value={response}
              onChange={e => setResponse(e.target.value)}
              className="w-full rounded-lg p-3 text-sm text-white resize-none"
              style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
              rows={3}
              placeholder={action === 'rejected' ? 'Explain your side...' : 'Add a note (optional)'}
              maxLength={2000}
            />
            {response.length >= 1 && <SignatureSection message={respondMsg} />}
            <button
              onClick={handleRespond}
              disabled={loading || response.length < 1 || !sig.trim()}
              className={`w-full mt-4 py-2.5 rounded-lg text-sm font-semibold text-black disabled:opacity-50 ${
                action === 'rejected' ? 'bg-red-500' : action === 'refund' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            >
              {loading ? 'Submitting...' : action === 'refund' ? `Refund ${refundPercent}%` : action === 'rework' ? 'Offer Rework' : 'Reject Dispute'}
            </button>
          </>
        )}

        {/* Rework acceptance — buyer */}
        {isReworkAcceptPhase && (
          <>
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-inset)' }}>
              <p className="text-xs text-gray-500 mb-1">Agent offered to rework:</p>
              <p className="text-sm text-gray-300">{dispute.response}</p>
              {dispute.rework_cost > 0 && (
                <p className="text-sm text-amber-400 mt-2 font-medium">
                  Additional cost: +{dispute.rework_cost} {job.currency || 'VRSCTEST'}
                </p>
              )}
              {(!dispute.rework_cost || dispute.rework_cost === 0) && (
                <p className="text-sm text-emerald-400 mt-2 font-medium">Free rework</p>
              )}
            </div>
            <SignatureSection message={reworkAcceptMsg} />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleReworkAccept}
                disabled={loading || !sig.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-emerald-400 text-black disabled:opacity-50"
              >
                {loading ? 'Accepting...' : 'Accept Rework'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-400"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Decline
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
