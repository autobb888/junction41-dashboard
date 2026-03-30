import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import QRCode from 'react-qr-code';
import CopyButton from './CopyButton';
import SignCopyButtons from './SignCopyButtons';
import DisputeModal from './DisputeModal';
import DeliveryPanel from './DeliveryPanel';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Build a signmessage command — single-line format, works in CLI and GUI console.
 */
function buildSignCmd(idName, message) {
  return `signmessage "${idName}" "${message.replace(/"/g, '\\"')}"`;
}

/**
 * Reusable job action panels (accept, pay, deliver, complete, dispute, cancel).
 * Used by both JobsPage (card expand) and JobDetailPage.
 */

/**
 * PaymentQR — generates a VerusPay invoice QR via the server endpoint.
 * Verus Mobile natively understands VerusPay invoices.
 */
function PaymentQR({ jobId, type, amount, currency, onTxDetected }) {
  const [qrData, setQrData] = useState(null);
  const [qrError, setQrError] = useState(null);
  const [polling, setPolling] = useState(true);
  const [detectedTxid, setDetectedTxid] = useState(null);
  const intervalRef = useRef(null);
  const seenTxidsRef = useRef(new Set());

  // Fetch VerusPay invoice from server
  useEffect(() => {
    let mounted = true;
    async function fetchQr() {
      try {
        const res = await fetch(`${API_BASE}/v1/jobs/${jobId}/payment-qr?type=${type}`, { credentials: 'include' });
        if (res.ok && mounted) {
          const data = await res.json();
          setQrData(data.data);
        } else if (mounted) {
          setQrError('Failed to generate payment QR');
        }
      } catch {
        if (mounted) setQrError('Failed to generate payment QR');
      }
    }
    fetchQr();

    // Snapshot existing txids
    async function snapshotExisting() {
      try {
        const res = await fetch(`${API_BASE}/v1/jobs/${jobId}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.data?.payment?.txid) seenTxidsRef.current.add(data.data.payment.txid);
          if (data.data?.payment?.platformFeeTxid) seenTxidsRef.current.add(data.data.payment.platformFeeTxid);
        }
      } catch {}
    }
    snapshotExisting();

    // Poll for payment detection
    intervalRef.current = setInterval(async () => {
      if (!mounted) return;
      try {
        const res = await fetch(`${API_BASE}/v1/jobs/${jobId}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const job = data.data;
        if (job?.payment?.txid && !seenTxidsRef.current.has(job.payment.txid)) {
          onTxDetected?.(job.payment.txid, 'agent');
          seenTxidsRef.current.add(job.payment.txid);
          setDetectedTxid(job.payment.txid);
          setPolling(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
        if (job?.payment?.platformFeeTxid && !seenTxidsRef.current.has(job.payment.platformFeeTxid)) {
          onTxDetected?.(job.payment.platformFeeTxid, 'fee');
          seenTxidsRef.current.add(job.payment.platformFeeTxid);
          setDetectedTxid(job.payment.platformFeeTxid);
          setPolling(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {}
    }, 10000);

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId, type]);

  if (qrError) {
    return <p className="text-xs text-red-400">{qrError}</p>;
  }

  if (!qrData) {
    return (
      <div className="flex items-center justify-center py-6" role="status" aria-label="Loading">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-verus-blue"></div>
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  // Combined type: no QR (multi-output TX), show CLI command and addresses
  if (type === 'combined' && qrData.sendcurrencyParams) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
          Send a single transaction paying both agent and platform fee ({qrData.totalAmount?.toFixed?.(4)} {currency} total)
        </p>
        <div className="w-full space-y-2">
          <div className="bg-gray-950 rounded p-2">
            <p className="text-xs text-gray-400 mb-1">Agent: {qrData.agentPayment?.amount?.toFixed?.(4)} {currency}</p>
            <p className="text-xs font-mono break-all" style={{ color: 'var(--text-secondary)' }}>{qrData.agentPayment?.address}</p>
          </div>
          <div className="bg-gray-950 rounded p-2">
            <p className="text-xs text-gray-400 mb-1">Platform fee: {qrData.feePayment?.amount?.toFixed?.(4)} {currency}</p>
            <p className="text-xs font-mono break-all" style={{ color: 'var(--text-secondary)' }}>{qrData.feePayment?.address}</p>
          </div>
        </div>
        <div className="w-full">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400">Verus command:</p>
            <SignCopyButtons command={qrData.cliCommand} />
          </div>
          <div className="bg-gray-950 rounded p-3 font-mono text-xs text-verus-blue break-all whitespace-pre-wrap select-all">
            {qrData.cliCommand}
          </div>
        </div>
        {polling && !detectedTxid && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <div className="animate-spin rounded-full h-3 w-3 border-b border-verus-blue"></div>
            Waiting for payment...
          </div>
        )}
        {detectedTxid && (
          <div className="flex items-center gap-2 text-xs text-green-400">
            <span>&#10003;</span> Payment detected
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-3 rounded-lg">
        <QRCode value={qrData.qrString} size={200} level="M" />
      </div>
      <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
        Scan with Verus Mobile to pay <span className="text-white font-medium">{qrData.amount?.toFixed?.(4) || amount} {currency}</span>
      </p>
      <div className="w-full bg-gray-950 rounded p-2 text-center">
        <p className="text-xs font-mono break-all" style={{ color: 'var(--text-secondary)' }}>{qrData.address}</p>
      </div>
      {qrData.deeplink && /^verus(id|pay)?:/i.test(qrData.deeplink) && (
        <a href={qrData.deeplink} className="text-xs text-verus-blue hover:underline">
          Open in Verus Mobile →
        </a>
      )}
      {polling && !detectedTxid && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <div className="animate-spin rounded-full h-3 w-3 border-b border-verus-blue"></div>
          Waiting for payment...
        </div>
      )}
      {detectedTxid && (
        <div className="flex items-center gap-2 text-xs text-green-400">
          <span>&#10003;</span> Payment detected
        </div>
      )}
    </div>
  );
}

function ExtensionPanel({ job, loading, setLoading, setError, onUpdate, onCancel }) {
  const [extAmount, setExtAmount] = useState('');
  const [extReason, setExtReason] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [extId, setExtId] = useState(null);
  const [txidInput, setTxidInput] = useState('');

  const handleRequestExtension = async () => {
    if (!extAmount || Number(extAmount) <= 0) return;
    setLoading(true);
    setError(null);
    try {
      // Create extension request
      const extRes = await fetch(`${API_BASE}/v1/jobs/${job.id}/extensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: Number(extAmount), reason: extReason || undefined }),
      });
      const extData = await extRes.json();
      if (!extRes.ok) throw new Error(extData.error?.message || 'Failed to request extension');
      setExtId(extData.data?.id);

      // Check if auto-approved (paused jobs) — if so, show payment immediately
      const extStatus = extData.data?.status;
      if (extStatus === 'approved' || job.status === 'paused') {
        const invRes = await fetch(`${API_BASE}/v1/jobs/${job.id}/extension-invoice?amount=${extAmount}`, { credentials: 'include' });
        const invData = await invRes.json();
        if (invRes.ok) setInvoice(invData.data);
        else throw new Error(invData.error?.message || 'Failed to get invoice');
      } else {
        // Pending — agent needs to approve. Close panel and notify user.
        onCancel();
        onUpdate?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPayment = async () => {
    if (!txidInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // Find the extension to pay
      let payExtId = extId;
      if (!payExtId) {
        const exts = await fetch(`${API_BASE}/v1/jobs/${job.id}/extensions`, { credentials: 'include' });
        const extList = await exts.json();
        const approved = extList.data?.find(e => e.status === 'approved');
        payExtId = approved?.id;
      }
      if (!payExtId) { setError('No approved extension found'); return; }

      const payRes = await fetch(`${API_BASE}/v1/jobs/${job.id}/extensions/${payExtId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agentTxid: txidInput.trim(), feeTxid: txidInput.trim() }),
      });
      if (payRes.ok) { onCancel(); onUpdate?.(); }
      else { const d = await payRes.json(); setError(d.error?.message || 'Payment failed'); }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!invoice) {
    // Step 1: Enter amount
    return (
      <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
        <h4 className="text-white font-medium text-sm">Extend Session</h4>
        <p className="text-gray-400 text-xs">Add more funds to continue working with this agent.</p>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Additional Amount ({job.currency})</label>
          <input type="number" step="0.001" min="0.001" value={extAmount}
            onChange={(e) => setExtAmount(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-verus-blue focus:outline-none"
            placeholder="Enter amount..."
          />
          {extAmount && Number(extAmount) > 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Total: {Number(extAmount).toFixed(4)} + {(Number(extAmount) * 0.05).toFixed(4)} fee = {(Number(extAmount) * 1.05).toFixed(4)} {job.currency}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Reason (optional)</label>
          <textarea value={extReason} onChange={(e) => setExtReason(e.target.value)} rows={2} maxLength={500}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-verus-blue focus:outline-none"
            placeholder="e.g. Job requires more tokens than originally scoped..."
          />
        </div>
        <div className="flex gap-2">
          <button onClick={handleRequestExtension} disabled={!extAmount || Number(extAmount) <= 0 || loading} className="btn-primary text-sm">
            {loading ? 'Submitting...' : (job.status === 'paused' ? 'Get Payment Details' : 'Request Extension')}
          </button>
          <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
        </div>
      </div>
    );
  }

  // Step 2: Show sendcurrency command + txid input
  return (
    <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
      <h4 className="text-white font-medium text-sm">Extension Payment</h4>
      <div className="p-3 rounded-lg" style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
        <p className="text-xs text-gray-400 mb-1">Total: <span className="text-white font-mono">{invoice.totalAmount} {invoice.currency}</span></p>
        <p className="text-xs text-gray-500">Agent: {invoice.agentPayment?.amount} + Fee: {invoice.feePayment?.amount}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1">Run this command in your wallet:</p>
        <div className="bg-gray-950 p-2 rounded mb-2">
          <code className="text-xs font-mono text-white break-all">{invoice.cliCommand}</code>
        </div>
        <SignCopyButtons command={invoice.cliCommand} />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Transaction ID — paste after sending</label>
        <input type="text" value={txidInput} onChange={(e) => setTxidInput(e.target.value)}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-verus-blue focus:outline-none"
          placeholder="Paste txid..."
        />
        {txidInput.trim().startsWith('opid-') && (
          <div className="mt-2 p-2.5 rounded-lg" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.25)' }}>
            <p className="text-xs text-amber-400 mb-1.5">That's an operation ID. Run this in your wallet to get the txid:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-white flex-1 break-all">z_getoperationresult '["{txidInput.trim()}"]'</code>
              <SignCopyButtons command={`z_getoperationresult '["${txidInput.trim()}"]'`} />
            </div>
            <p className="text-xs text-amber-400/70 mt-1">Copy the <code>txid</code> from the result and paste it above.</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={handleSubmitPayment} disabled={!txidInput.trim() || loading} className="btn-primary text-sm">
          {loading ? 'Verifying...' : 'Submit Extension Payment'}
        </button>
        <button onClick={() => { setInvoice(null); setTxidInput(''); onCancel(); }} className="btn-secondary text-sm">Cancel</button>
      </div>
    </div>
  );
}


export default function JobActions({ job, onUpdate, autoOpenPayment, onAutoOpenConsumed, onJobStarted }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [signPanel, setSignPanel] = useState(null);
  const [signatureInput, setSignatureInput] = useState('');

  const isBuyer = job.buyerVerusId === user?.verusId;
  const isSeller = job.sellerVerusId === user?.verusId;
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [currentDispute, setCurrentDispute] = useState(null);
  const [extensionAmount, setExtensionAmount] = useState('');
  const [extensionInvoice, setExtensionInvoice] = useState(null);

  async function fetchDispute() {
    try {
      const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/dispute`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCurrentDispute(data.dispute);
      }
    } catch {}
  }

  // Auto-open payment panel when autoOpenPayment is set
  useEffect(() => {
    if (autoOpenPayment && isBuyer && job.status === 'accepted' && !signPanel) {
      if (!job.payment?.txid) {
        // Default to combined payment (single TX for both agent + fee)
        setSignPanel({ action: 'payment-combined', type: 'combined-txid' });
        setSignatureInput('');
      } else if (!job.payment?.platformFeeTxid) {
        setSignPanel({ action: 'platform-fee', type: 'fee-txid' });
        setSignatureInput('');
      }
      onAutoOpenConsumed?.();
    }
  }, [autoOpenPayment, job.status, job.payment?.txid, job.payment?.platformFeeTxid]);

  async function handleAction(action, body = {}) {
    setLoading(true);
    setError(null);
    try {
      const timestamp = body.timestamp || Math.floor(Date.now() / 1000);
      const { timestamp: _, ...restBody } = body;
      const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ timestamp, ...restBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Action failed');

      // Auto-advance: after agent payment, move to platform fee step
      if (action === 'payment' && data.data?.payment?.txid && !data.data?.payment?.platformFeeTxid) {
        setSignatureInput('');
        setSignPanel({ action: 'platform-fee', type: 'fee-txid' });
        if (onUpdate) onUpdate();
        return; // Don't close panel
      }

      // After platform-fee or payment-combined succeeds and job is in_progress, notify parent
      if ((action === 'platform-fee' || action === 'payment-combined') && data.data?.status === 'in_progress') {
        setSignPanel(null);
        setSignatureInput('');
        if (onUpdate) onUpdate();
        onJobStarted?.();
        return;
      }

      setSignPanel(null);
      setSignatureInput('');
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (['completed', 'cancelled'].includes(job.status)) return null;

  return (
    <div className="space-y-3">
      {error && <div className="text-red-400 text-sm">{error}</div>}

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        {/* Seller: Accept */}
        {isSeller && job.status === 'requested' && !signPanel && (
          <button
            onClick={() => {
              const ts = Math.floor(Date.now() / 1000);
              const msg = `J41-ACCEPT|Job:${job.jobHash}|Buyer:${job.buyerVerusId}|Amt:${job.amount} ${job.currency}|Ts:${ts}|I accept this job and commit to delivering the work.`;
              const idName = user?.identityName ? `${user.identityName}@` : 'yourID@';
              const cmd = buildSignCmd(idName, msg);
              setSignPanel({ action: 'accept', message: msg, command: cmd, timestamp: ts });
              setSignatureInput('');
            }}
            disabled={loading}
            className="btn-primary text-sm"
          >
            Accept Job
          </button>
        )}

        {/* Buyer: Payment options (two-step or combined) */}
        {isBuyer && job.status === 'accepted' && !job.payment?.txid && !signPanel && (
          <>
            <button
              onClick={() => { setSignPanel({ action: 'payment-combined', type: 'combined-txid' }); setSignatureInput(''); }}
              disabled={loading}
              className="btn-primary text-sm"
            >
              Pay All in One TX
            </button>
            <button
              onClick={() => { setSignPanel({ action: 'payment', type: 'txid' }); setSignatureInput(''); }}
              disabled={loading}
              className="btn-secondary text-sm"
            >
              Pay in 2 Steps
            </button>
          </>
        )}

        {/* Buyer: Submit platform fee (step 2 of 2-step flow) */}
        {isBuyer && job.status === 'accepted' && job.payment?.txid && !job.payment?.platformFeeTxid && !signPanel && (
          <button
            onClick={() => { setSignPanel({ action: 'platform-fee', type: 'fee-txid' }); setSignatureInput(''); }}
            disabled={loading}
            className="btn-primary text-sm"
          >
            Pay Platform Fee ({job.payment?.feeAmount?.toFixed(4)} {job.currency})
          </button>
        )}

        {/* Status messages */}
        {isBuyer && job.status === 'accepted' && job.payment?.txid && job.payment?.platformFeeTxid && (
          <span className="text-yellow-400 text-sm">⏳ Both payments submitted — verifying...</span>
        )}
        {isBuyer && job.status === 'accepted' && job.payment?.txid && !job.payment?.platformFeeTxid && (
          <span className="text-green-400 text-sm">✓ Agent payment submitted — now pay platform fee</span>
        )}
        {isSeller && job.status === 'accepted' && (
          <span className="text-yellow-400 text-sm">⏳ Waiting for buyer payment...</span>
        )}

        {/* Extension request button (in-progress jobs) */}
        {(isBuyer || isSeller) && job.status === 'in_progress' && !signPanel && (
          <button
            onClick={() => { setSignPanel({ action: 'extension', type: 'extension' }); setSignatureInput(''); }}
            disabled={loading}
            className="btn-secondary text-sm"
          >
            Request Extension
          </button>
        )}

        {/* Seller: Deliver */}
        {isSeller && job.status === 'in_progress' && !signPanel && (
          <button
            onClick={() => { setSignPanel({ action: 'deliver', type: 'delivery' }); setSignatureInput(''); }}
            disabled={loading}
            className="btn-primary text-sm"
          >
            Mark Delivered
          </button>
        )}

        {/* Buyer: Complete or Reject Delivery */}
        {isBuyer && job.status === 'delivered' && !signPanel && (
          <>
            <button
              onClick={() => {
                const ts = Math.floor(Date.now() / 1000);
                const msg = `J41-COMPLETE|Job:${job.jobHash}|Ts:${ts}|I confirm the work has been delivered satisfactorily.`;
                const idName = user?.identityName ? `${user.identityName}@` : 'yourID@';
                const cmd = buildSignCmd(idName, msg);
                setSignPanel({ action: 'complete', message: msg, command: cmd, timestamp: ts });
                setSignatureInput('');
              }}
              disabled={loading}
              className="btn-primary text-sm"
            >
              Confirm Complete
            </button>
            <button
              onClick={() => { setSignPanel({ action: 'reject-delivery', type: 'reject-delivery' }); setSignatureInput(''); }}
              disabled={loading}
              className="btn-danger text-sm"
            >
              Reject Delivery
            </button>
          </>
        )}

        {/* Cancel (buyer, requested only) */}
        {isBuyer && job.status === 'requested' && (
          <button onClick={() => handleAction('cancel')} disabled={loading} className="btn-danger text-sm">
            Cancel
          </button>
        )}

        {/* Dispute — buyer can file during in_progress, delivered, or paused */}
        {isBuyer && ['in_progress', 'delivered', 'paused'].includes(job.status) && (
          <button onClick={() => setShowDisputeModal(true)} disabled={loading} className="btn-danger text-sm">
            Dispute
          </button>
        )}

        {/* Respond to dispute — agent side */}
        {isSeller && job.status === 'disputed' && (
          <button onClick={() => { fetchDispute(); setShowDisputeModal(true); }} disabled={loading} className="btn-danger text-sm">
            Respond to Dispute
          </button>
        )}

        {/* Rework offer — buyer side */}
        {isBuyer && job.status === 'disputed' && (
          <button onClick={() => { fetchDispute(); setShowDisputeModal(true); }} disabled={loading} className="text-sm px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20">
            View Dispute
          </button>
        )}
      </div>

      {/* Paused Job — reactivate or extend (buyer only) */}
      {job.status === 'paused' && isBuyer && (
        <div className="p-4 rounded-lg mb-3" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
          <p className="text-amber-400 font-medium text-sm mb-2">Session Paused</p>
          <p className="text-xs text-gray-400 mb-3">
            Agent idle for {job.pausedAt ? Math.round((Date.now() - new Date(job.pausedAt.endsWith('Z') ? job.pausedAt : job.pausedAt + 'Z').getTime()) / 60000) : '?'} minutes.
            {(job.lifecycle?.reactivationFee || 0) > 0
              ? ' Reactivate to continue or extend with additional payment.'
              : ' Resume to continue the session.'}
          </p>
          <div className="flex gap-2 flex-wrap">
            {(job.lifecycle?.reactivationFee || 0) > 0 ? (
              <>
                <button
                  onClick={() => { setSignPanel({ action: 'reactivate', type: 'reactivate' }); setSignatureInput(''); }}
                  disabled={loading}
                  className="btn-primary text-sm"
                >
                  Reactivate ({job.lifecycle.reactivationFee} {job.currency} + fee)
                </button>
                <button
                  onClick={() => { setSignPanel({ action: 'extend', type: 'extend-paused' }); setSignatureInput(''); }}
                  disabled={loading}
                  className="btn-secondary text-sm"
                >
                  Extend Session
                </button>
              </>
            ) : (
              <button
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/reactivate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({}),
                    });
                    if (res.ok) onUpdate?.();
                    else {
                      const data = await res.json();
                      setError(data.error?.message || 'Reactivation failed');
                    }
                  } catch (err) { setError(err.message); }
                  finally { setLoading(false); }
                }}
                disabled={loading}
                className="btn-primary text-sm"
              >
                {loading ? 'Resuming...' : 'Resume Session (Free)'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Reconnect Agent — either party, active jobs (not paused) */}
      {['in_progress', 'delivered'].includes(job.status) && (
        <button
          onClick={async () => {
            setLoading(true);
            try {
              const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/reconnect`, {
                method: 'POST',
                credentials: 'include',
              });
              if (!res.ok) {
                const data = await res.json();
                setError(data.error?.message || 'Failed to reconnect');
              }
            } catch (err) {
              setError(err.message);
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
        >
          {loading ? 'Sending...' : 'Reconnect Agent'}
        </button>
      )}

      {/* Review window countdown */}
      {job.status === 'delivered' && job.reviewWindowExpiresAt && (
        <ReviewWindowCountdown expiresAt={job.reviewWindowExpiresAt} />
      )}

      {/* Dispute Modal */}
      {showDisputeModal && (
        <DisputeModal
          job={job}
          dispute={currentDispute}
          role={isBuyer ? 'buyer' : 'seller'}
          onClose={() => { setShowDisputeModal(false); setCurrentDispute(null); }}
          onAction={() => onUpdate?.()}
        />
      )}

      {/* Sign Panel (accept/complete) */}
      {signPanel && !['txid', 'delivery', 'fee-txid', 'extension', 'combined-txid', 'reject-delivery'].includes(signPanel.type) && (
        <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
          <h4 className="text-white font-medium text-sm">Sign to {signPanel.action}</h4>
          <p className="text-gray-400 text-xs">Run this command in Verus CLI or Desktop console, then paste the <strong>signature</strong> value below.</p>
          <div className="bg-gray-950 rounded p-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-400">Sign command:</span>
              <SignCopyButtons command={signPanel.command} />
            </div>
            <div className="font-mono text-xs text-verus-blue break-all whitespace-pre-wrap select-all">
              {signPanel.command}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Paste Signature (base64 string starting with A...)</label>
            <input
              type="text" value={signatureInput}
              onChange={(e) => {
                let val = e.target.value;
                // Auto-extract signature from JSON if user pastes full signmessage output
                if (val.trim().startsWith('{')) {
                  try {
                    const parsed = JSON.parse(val.trim());
                    if (parsed.signature) val = parsed.signature;
                  } catch { /* not JSON, use as-is */ }
                }
                setSignatureInput(val);
              }}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-verus-blue focus:outline-none"
              placeholder="AW1B..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { handleAction(signPanel.action, { signature: signatureInput.trim(), timestamp: signPanel.timestamp }); }}
              disabled={!signatureInput.trim() || loading}
              className="btn-primary text-sm"
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
            <button onClick={() => { setSignPanel(null); setSignatureInput(''); }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Agent Payment Panel */}
      {signPanel && signPanel.type === 'txid' && (
        <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-white font-medium text-sm">Step 1: Pay Agent</h4>
            <span className="text-xs text-gray-500">Step 1 of 2</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div className="bg-verus-blue h-1.5 rounded-full" style={{ width: '50%' }}></div>
          </div>
          <p className="text-gray-400 text-xs">
            Send <span className="text-white font-medium">{job.amount} {job.currency}</span> to the agent. Scan the QR or paste the transaction ID manually.
          </p>

          <PaymentQR
            jobId={job.id}
            type="agent"
            amount={job.amount}
            currency={job.currency}
            onTxDetected={(txid, t) => {
              if (t === 'agent') setSignatureInput(txid);
            }}
          />

          <p className="text-gray-500 text-xs">After this, you'll also pay the 5% platform fee ({job.payment?.feeAmount?.toFixed(4)} {job.currency}) in a second transaction.</p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Transaction ID — auto-fills when payment detected</label>
            <input
              type="text" value={signatureInput} onChange={(e) => setSignatureInput(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-verus-blue focus:outline-none"
              placeholder="Paste txid..."
            />
            {signatureInput.trim().startsWith('opid-') && (
              <div className="mt-2 p-2.5 rounded-lg" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.25)' }}>
                <p className="text-xs text-amber-400 mb-1.5">That's an operation ID, not a transaction ID. Run this in your wallet to get the txid:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-white flex-1 break-all">z_getoperationresult '["{signatureInput.trim()}"]'</code>
                  <SignCopyButtons command={`z_getoperationresult '["${signatureInput.trim()}"]'`} />
                </div>
                <p className="text-xs text-amber-400/70 mt-1">Copy the <code>txid</code> from the result and paste it above.</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { handleAction('payment', { txid: signatureInput.trim() }); }}
              disabled={!signatureInput.trim() || loading}
              className="btn-primary text-sm"
            >
              {loading ? 'Verifying...' : 'Submit Agent Payment'}
            </button>
            <button onClick={() => { setSignPanel(null); setSignatureInput(''); }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Platform Fee Panel */}
      {signPanel && signPanel.type === 'fee-txid' && (
        <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-white font-medium text-sm">Step 2: Pay Platform Fee</h4>
            <span className="text-xs text-emerald-400">Final Step</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '100%' }}></div>
          </div>
          <p className="text-gray-400 text-xs">
            Send <span className="text-white font-medium">{job.payment?.feeAmount?.toFixed(4)} {job.currency}</span> (5% fee) to the SovGuard address. Scan the QR or paste manually.
          </p>

          <PaymentQR
            jobId={job.id}
            type="fee"
            amount={job.payment?.feeAmount}
            currency={job.currency}
            onTxDetected={(txid, t) => {
              if (t === 'fee') setSignatureInput(txid);
            }}
          />

          <p className="text-green-400 text-xs">✓ Agent payment already submitted. This is the final step — job starts after both payments.</p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Transaction ID — auto-fills when payment detected</label>
            <input
              type="text" value={signatureInput} onChange={(e) => setSignatureInput(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-verus-blue focus:outline-none"
              placeholder="Paste txid..."
            />
            {signatureInput.trim().startsWith('opid-') && (
              <div className="mt-2 p-2.5 rounded-lg" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.25)' }}>
                <p className="text-xs text-amber-400 mb-1.5">That's an operation ID, not a transaction ID. Run this in your wallet to get the txid:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-white flex-1 break-all">z_getoperationresult '["{signatureInput.trim()}"]'</code>
                  <SignCopyButtons command={`z_getoperationresult '["${signatureInput.trim()}"]'`} />
                </div>
                <p className="text-xs text-amber-400/70 mt-1">Copy the <code>txid</code> from the result and paste it above.</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { handleAction('platform-fee', { txid: signatureInput.trim() }); }}
              disabled={!signatureInput.trim() || loading}
              className="btn-primary text-sm"
            >
              {loading ? 'Verifying...' : 'Submit Platform Fee'}
            </button>
            <button onClick={() => { setSignPanel(null); setSignatureInput(''); }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Extension Request + Payment Panel */}
      {signPanel && signPanel.type === 'extension' && (
        <ExtensionPanel
          job={job} loading={loading} setLoading={setLoading} setError={setError}
          onUpdate={onUpdate}
          onCancel={() => { setSignPanel(null); setSignatureInput(''); }}
        />
      )}

      {/* Delivery Panel */}
      {signPanel && signPanel.type === 'delivery' && (
        <DeliveryPanel
          job={job}
          isSeller={isSeller}
          onDelivered={() => { setSignPanel(null); onUpdate(); }}
          onCancel={() => { setSignPanel(null); setSignatureInput(''); }}
        />
      )}

      {/* Combined Payment Panel (single TX for both agent + fee) */}
      {signPanel && signPanel.type === 'combined-txid' && (
        <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
          <h4 className="text-white font-medium text-sm">Combined Payment (Agent + Platform Fee)</h4>
          <p className="text-gray-400 text-xs">
            Send a single transaction that pays both the agent and the platform fee.
            Use the <code>sendcurrency</code> command below to create a multi-output transaction.
          </p>

          <PaymentQR
            jobId={job.id}
            type="combined"
            amount={job.amount}
            currency={job.currency}
            onTxDetected={(txid) => setSignatureInput(txid)}
          />

          <div>
            <label className="block text-xs text-gray-400 mb-1">Transaction ID — paste after sending</label>
            <input
              type="text" value={signatureInput} onChange={(e) => setSignatureInput(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-verus-blue focus:outline-none"
              placeholder="Paste txid..."
            />
            {signatureInput.trim().startsWith('opid-') && (
              <div className="mt-2 p-2.5 rounded-lg" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.25)' }}>
                <p className="text-xs text-amber-400 mb-1.5">That's an operation ID, not a transaction ID. Run this in your wallet to get the txid:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-white flex-1 break-all">z_getoperationresult '["{signatureInput.trim()}"]'</code>
                  <SignCopyButtons command={`z_getoperationresult '["${signatureInput.trim()}"]'`} />
                </div>
                <p className="text-xs text-amber-400/70 mt-1">Copy the <code>txid</code> from the result and paste it above.</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { handleAction('payment-combined', { txid: signatureInput.trim() }); }}
              disabled={!signatureInput.trim() || loading}
              className="btn-primary text-sm"
            >
              {loading ? 'Verifying...' : 'Submit Combined Payment'}
            </button>
            <button onClick={() => { setSignPanel(null); setSignatureInput(''); }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Reactivation Payment Panel */}
      {signPanel && signPanel.type === 'reactivate' && (
        <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
          <h4 className="text-white font-medium text-sm">Reactivate Session</h4>
          <p className="text-gray-400 text-xs">
            Pay the reactivation fee to resume. Agent continues where they left off.
          </p>

          <PaymentQR
            jobId={job.id}
            type="combined"
            amount={job.lifecycle?.reactivationFee || 0}
            currency={job.currency}
            onTxDetected={(txid) => setSignatureInput(txid)}
          />

          <div>
            <label className="block text-xs text-gray-400 mb-1">Transaction ID — paste after sending</label>
            <input
              type="text" value={signatureInput} onChange={(e) => setSignatureInput(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-verus-blue focus:outline-none"
              placeholder="Paste txid..."
            />
            {signatureInput.trim().startsWith('opid-') && (
              <div className="mt-2 p-2.5 rounded-lg" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.25)' }}>
                <p className="text-xs text-amber-400 mb-1.5">That's an operation ID. Run this in your wallet to get the txid:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-white flex-1 break-all">z_getoperationresult '["{signatureInput.trim()}"]'</code>
                  <SignCopyButtons command={`z_getoperationresult '["${signatureInput.trim()}"]'`} />
                </div>
                <p className="text-xs text-amber-400/70 mt-1">Copy the <code>txid</code> from the result and paste it above.</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/reactivate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ txid: signatureInput.trim() }),
                  });
                  if (res.ok) { setSignPanel(null); setSignatureInput(''); onUpdate?.(); }
                  else {
                    const data = await res.json();
                    setError(data.error?.message || 'Reactivation failed');
                  }
                } catch (err) { setError(err.message); }
                finally { setLoading(false); }
              }}
              disabled={!signatureInput.trim() || loading}
              className="btn-primary text-sm"
            >
              {loading ? 'Verifying...' : 'Submit Reactivation Payment'}
            </button>
            <button onClick={() => { setSignPanel(null); setSignatureInput(''); }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Extend Paused Session Panel */}
      {signPanel && signPanel.type === 'extend-paused' && (
        <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
          <h4 className="text-white font-medium text-sm">Extend Session</h4>
          <p className="text-gray-400 text-xs">
            Add more funds to continue working. The agent resumes automatically after payment.
          </p>

          {!extensionInvoice ? (
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">Amount ({job.currency})</label>
              <input
                type="number" step="0.001" min="0.001" value={extensionAmount}
                onChange={(e) => setExtensionAmount(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-verus-blue focus:outline-none"
                placeholder="Enter amount..."
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!extensionAmount || parseFloat(extensionAmount) <= 0) return;
                    setLoading(true);
                    try {
                      // Create extension request (auto-approved for paused jobs)
                      const extRes = await fetch(`${API_BASE}/v1/jobs/${job.id}/extensions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ amount: parseFloat(extensionAmount) }),
                      });
                      const extData = await extRes.json();
                      if (!extRes.ok) { setError(extData.error?.message || 'Failed'); return; }
                      // Fetch invoice
                      const invRes = await fetch(`${API_BASE}/v1/jobs/${job.id}/extension-invoice?amount=${extensionAmount}`, { credentials: 'include' });
                      if (invRes.ok) {
                        const invData = await invRes.json();
                        setExtensionInvoice({ ...invData.data, extensionId: extData.data?.id });
                      }
                    } catch (err) { setError(err.message); }
                    finally { setLoading(false); }
                  }}
                  disabled={!extensionAmount || parseFloat(extensionAmount) <= 0 || loading}
                  className="btn-primary text-sm"
                >
                  {loading ? 'Loading...' : 'Get Payment Details'}
                </button>
                <button onClick={() => { setSignPanel(null); setExtensionAmount(''); setExtensionInvoice(null); }} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-lg" style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <p className="text-xs text-gray-400 mb-1">Total: <span className="text-white font-mono">{extensionInvoice.totalAmount} {extensionInvoice.currency}</span></p>
                <p className="text-xs text-gray-500">Agent: {extensionInvoice.agentPayment?.amount} + Fee: {extensionInvoice.feePayment?.amount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Run this command in your wallet:</p>
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-xs font-mono text-white flex-1 break-all bg-gray-950 p-2 rounded">{extensionInvoice.cliCommand}</code>
                </div>
                <SignCopyButtons command={extensionInvoice.cliCommand} />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Transaction ID — paste after sending</label>
                <input
                  type="text" value={signatureInput} onChange={(e) => setSignatureInput(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-verus-blue focus:outline-none"
                  placeholder="Paste txid..."
                />
                {signatureInput.trim().startsWith('opid-') && (
                  <div className="mt-2 p-2.5 rounded-lg" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.25)' }}>
                    <p className="text-xs text-amber-400 mb-1.5">That's an operation ID. Run this in your wallet to get the txid:</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-white flex-1 break-all">z_getoperationresult '["{signatureInput.trim()}"]'</code>
                      <SignCopyButtons command={`z_getoperationresult '["${signatureInput.trim()}"]'`} />
                    </div>
                    <p className="text-xs text-amber-400/70 mt-1">Copy the <code>txid</code> from the result and paste it above.</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!signatureInput.trim()) return;
                    setLoading(true);
                    try {
                      // Submit extension payment — use stored extensionId or fallback to latest approved
                      let extId = extensionInvoice?.extensionId;
                      if (!extId) {
                        const exts = await fetch(`${API_BASE}/v1/jobs/${job.id}/extensions`, { credentials: 'include' });
                        const extList = await exts.json();
                        const latestExt = extList.data?.find(e => e.status === 'approved');
                        extId = latestExt?.id;
                      }
                      if (extId) {
                        const payRes = await fetch(`${API_BASE}/v1/jobs/${job.id}/extensions/${extId}/payment`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ agentTxid: signatureInput.trim(), feeTxid: signatureInput.trim() }),
                        });
                        if (payRes.ok) { setSignPanel(null); setSignatureInput(''); setExtensionAmount(''); setExtensionInvoice(null); onUpdate?.(); }
                        else { const d = await payRes.json(); setError(d.error?.message || 'Payment failed'); }
                      } else { setError('No approved extension found'); }
                    } catch (err) { setError(err.message); }
                    finally { setLoading(false); }
                  }}
                  disabled={!signatureInput.trim() || loading}
                  className="btn-primary text-sm"
                >
                  {loading ? 'Verifying...' : 'Submit Extension Payment'}
                </button>
                <button onClick={() => { setSignPanel(null); setSignatureInput(''); setExtensionAmount(''); setExtensionInvoice(null); }} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reject Delivery Panel */}
      {signPanel && signPanel.type === 'reject-delivery' && (
        <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
          <h4 className="text-white font-medium text-sm">Reject Delivery</h4>
          <p className="text-gray-400 text-xs">
            Send the work back to the agent. Provide a reason so they know what needs to be fixed.
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Reason</label>
            <textarea
              value={signatureInput}
              onChange={(e) => setSignatureInput(e.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-verus-blue focus:outline-none"
              placeholder="Describe what needs to be fixed..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { handleAction('reject-delivery', { reason: signatureInput.trim() }); }}
              disabled={!signatureInput.trim() || loading}
              className="btn-danger text-sm"
            >
              {loading ? 'Submitting...' : 'Reject Delivery'}
            </button>
            <button onClick={() => { setSignPanel(null); setSignatureInput(''); }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewWindowCountdown({ expiresAt }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    function tick() {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('Expired');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${mins}m ${secs}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const isExpired = remaining === 'Expired';

  return (
    <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: isExpired ? '#ef4444' : '#fbbf24' }}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: isExpired ? '#ef4444' : '#fbbf24' }} />
      Review window: {remaining}
    </div>
  );
}
