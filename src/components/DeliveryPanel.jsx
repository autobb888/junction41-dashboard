import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import SignCopyButtons from './SignCopyButtons';

const API_BASE = import.meta.env.VITE_API_URL || '';

function buildSignCmd(idName, message) {
  return `signmessage "${idName}" "${message.replace(/"/g, '\\"')}"`;
}

/**
 * Shared delivery panel used by JobsPage, JobActions, and Chat.
 *
 * Props:
 *   job          – job object (needs .id, .jobHash)
 *   onDelivered  – callback after successful delivery
 *   onCancel     – callback to close/hide the panel
 *   isSeller     – guard: only renders if true
 */
export default function DeliveryPanel({ job, onDelivered, onCancel, isSeller }) {
  const { user } = useAuth();
  const [hash, setHash] = useState('');
  const [msg, setMsg] = useState('');
  const [sig, setSig] = useState('');
  const [ts, setTs] = useState(() => Math.floor(Date.now() / 1000));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isSeller) return null;

  const deliveryHash = hash.trim();
  const signMsg = `J41-DELIVER|Job:${job.jobHash}|Delivery:${deliveryHash}|Ts:${ts}|I have delivered the work for this job.`;
  const idName = user?.identityName ? `${user.identityName}@` : 'yourID@';
  const cmd = buildSignCmd(idName, signMsg);

  function refreshTimestamp() {
    setTs(Math.floor(Date.now() / 1000));
  }

  async function handleSubmit() {
    if (!sig.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const body = {
        signature: sig.trim(),
        timestamp: ts,
        deliveryMessage: msg || undefined,
      };
      if (deliveryHash) body.deliveryHash = deliveryHash;
      const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Delivery failed');
      onDelivered?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
      <h4 className="text-white font-medium text-sm">Mark as Delivered</h4>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Delivery Hash (optional)</label>
        <input
          type="text"
          value={hash}
          onChange={e => setHash(e.target.value)}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-verus-blue focus:outline-none"
          placeholder="IPFS hash, file hash, or URL hash (hex)..."
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Delivery Message (optional)</label>
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          rows={2}
          maxLength={2000}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-verus-blue focus:outline-none resize-none"
          placeholder="Describe what was delivered..."
        />
      </div>

      <p className="text-gray-400 text-xs">
        Run this command in Verus CLI or Desktop console, then paste the <strong>signature</strong> below.
      </p>

      <div className="bg-gray-950 rounded p-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-400">Sign command:</span>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshTimestamp}
              className="text-xs text-gray-500 hover:text-gray-300"
              title="Refresh timestamp"
            >
              ↻
            </button>
            <SignCopyButtons command={cmd} />
          </div>
        </div>
        <div className="font-mono text-xs text-verus-blue break-all whitespace-pre-wrap select-all">
          {cmd}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Paste Signature</label>
        <input
          type="text"
          value={sig}
          onChange={e => {
            let val = e.target.value;
            if (val.trim().startsWith('{')) {
              try { const p = JSON.parse(val.trim()); if (p.signature) val = p.signature; } catch { /* not JSON */ }
            }
            setSig(val);
          }}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-verus-blue focus:outline-none"
          placeholder="AW1B..."
        />
      </div>

      {error && (
        <div className="text-red-400 text-sm">{error}</div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!sig.trim() || loading}
          className="btn-primary text-sm"
        >
          {loading ? 'Submitting...' : 'Submit Delivery'}
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
      </div>
    </div>
  );
}
