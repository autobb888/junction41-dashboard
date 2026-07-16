import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { apiFetch } from '../utils/api';
import SignCopyButtons from './SignCopyButtons';

export default function PostBountyModal({ isOpen, onClose, onSuccess }) {
  const { user } = useAuth();
  const addToast = useToast();
  const modalRef = useRef(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('VRSCTEST');
  const [category, setCategory] = useState('');
  const [maxClaimants, setMaxClaimants] = useState(1);
  const [applicationDeadline, setApplicationDeadline] = useState('');
  const [minReviews, setMinReviews] = useState('');
  const [minTrustTier, setMinTrustTier] = useState('');
  const [requiredCategory, setRequiredCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  // Signing: user signs the canonical funding commitment in their Verus wallet
  // (CLI / Desktop console) and pastes the signature. The backend verifies it
  // against the exact same string — there is no bounty QR-consent route.
  const [signature, setSignature] = useState('');
  const [timestamp, setTimestamp] = useState(() => Math.floor(Date.now() / 1000));

  // Reset form on close
  useEffect(() => {
    if (!isOpen) {
      setTitle(''); setDescription(''); setAmount(''); setCurrency('VRSCTEST');
      setCategory(''); setMaxClaimants(1); setApplicationDeadline('');
      setMinReviews(''); setMinTrustTier(''); setRequiredCategory('');
      setError(null); setSignature(''); setTimestamp(Math.floor(Date.now() / 1000));
    }
  }, [isOpen]);

  // Load categories
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const res = await apiFetch('/v1/services/categories');
        if (res.ok) {
          const data = await res.json();
          setCategories(data.data || []);
        }
      } catch {}
    })();
  }, [isOpen]);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Escape key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !description.trim() || !amount) {
      setError('Title, description, and amount are required');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Amount must be a positive number');
      return;
    }

    if (!signature.trim()) {
      setError('Please sign the funding commitment and paste your signature');
      return;
    }

    setSubmitting(true);

    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        amount: amountNum,
        currency,
        category: category || undefined,
        maxClaimants,
        applicationDeadline: applicationDeadline || undefined,
        minReviews: minReviews ? parseInt(minReviews) : undefined,
        minTrustTier: minTrustTier || undefined,
        requiredCategory: requiredCategory || undefined,
        signature: signature.trim(),
        timestamp,
      };

      const res = await apiFetch('/v1/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to post bounty');
      }

      addToast?.('Bounty posted!');
      onSuccess?.(data.data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Canonical funding-commitment message — MUST match the backend's verify string
  // in POST /v1/bounties verbatim (title is trimmed the same way the body is sent).
  const idName = user?.identityName ? `${user.identityName}@` : 'yourID@';
  const amountNum = parseFloat(amount);
  const canSign = !!title.trim() && !!description.trim() && !isNaN(amountNum) && amountNum > 0;
  const signMessage = `J41-BOUNTY|Post:${title.trim()}|Amount:${amountNum}|Currency:${currency}|Ts:${timestamp}|I commit to funding this bounty.`;
  const signCmd = `signmessage "${idName}" "${signMessage.replace(/"/g, '\\"')}"`;

  function handleSigInput(val) {
    if (val.trim().startsWith('{')) {
      try { const p = JSON.parse(val.trim()); if (p.signature) val = p.signature; } catch { /* not JSON */ }
    }
    setSignature(val);
  }

  const fieldStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: 6,
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Post a Bounty"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Post a Bounty</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 20 }} aria-label="Close"><X size={20} /></button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div role="alert" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: 12, color: '#F87171', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div>
            <label style={labelStyle}>Title *</label>
            <input style={fieldStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Build a React dashboard component" maxLength={200} />
          </div>

          <div>
            <label style={labelStyle}>Description *</label>
            <textarea style={{ ...fieldStyle, minHeight: 100, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what needs to be done..." maxLength={5000} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Amount *</label>
              <input style={fieldStyle} type="number" step="0.0001" min="0.0001" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50" />
            </div>
            <div>
              <label style={labelStyle}>Currency</label>
              <select style={fieldStyle} value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="VRSCTEST">VRSCTEST</option>
                <option value="VRSC">VRSC</option>
                <option value="tBTC">tBTC</option>
                <option value="DAI">DAI</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={fieldStyle} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">Any</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Max Claimants</label>
              <input style={fieldStyle} type="number" min="1" max="10" value={maxClaimants} onChange={e => setMaxClaimants(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Application Deadline (optional)</label>
            <input style={fieldStyle} type="datetime-local" value={applicationDeadline} onChange={e => setApplicationDeadline(e.target.value)} />
            {!applicationDeadline && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>No deadline — applications stay open until you select someone</p>
            )}
          </div>

          {/* Qualification filters — collapsible */}
          <details style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Qualification Filters (optional)</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div>
                <label style={labelStyle}>Minimum Reviews</label>
                <input style={fieldStyle} type="number" min="0" value={minReviews} onChange={e => setMinReviews(e.target.value)} placeholder="e.g. 3" />
              </div>
              <div>
                <label style={labelStyle}>Minimum Trust Tier</label>
                <select style={fieldStyle} value={minTrustTier} onChange={e => setMinTrustTier(e.target.value)}>
                  <option value="">Any</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Required Service Category</label>
                <select style={fieldStyle} value={requiredCategory} onChange={e => setRequiredCategory(e.target.value)}>
                  <option value="">Any</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </details>

          {maxClaimants > 1 && (
            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: 10, fontSize: 12, color: '#FBBF24' }}>
              Multi-award: selecting {maxClaimants} claimants costs {maxClaimants} × {amount || '0'} = {maxClaimants * (parseFloat(amount) || 0)} {currency} total
            </div>
          )}

          {/* Sign the funding commitment — sign in your Verus wallet, paste the signature */}
          {canSign && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Sign funding commitment *</label>
                <button
                  type="button"
                  onClick={() => { setTimestamp(Math.floor(Date.now() / 1000)); setSignature(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: 12, cursor: 'pointer' }}
                >
                  Refresh
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
                Run this in the Verus CLI or Desktop console (Help → Debug Window → Console), then paste the signature.
              </p>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                  <SignCopyButtons command={signCmd} />
                </div>
                <code style={{ display: 'block', background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10, fontSize: 11, color: 'var(--accent-primary)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  {signCmd}
                </code>
              </div>
              <input
                style={{ ...fieldStyle, fontFamily: 'monospace', fontSize: 13 }}
                value={signature}
                onChange={e => handleSigInput(e.target.value)}
                placeholder="Paste signature (AW1B...)"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !canSign || !signature.trim()}
            style={{
              padding: '12px 24px',
              borderRadius: 10,
              border: 'none',
              background: (submitting || !canSign || !signature.trim()) ? 'var(--text-tertiary)' : 'var(--accent-gradient)',
              color: '#000',
              fontWeight: 600,
              fontSize: 15,
              cursor: (submitting || !canSign || !signature.trim()) ? 'not-allowed' : 'pointer',
              marginTop: 4,
            }}
          >
            {submitting ? 'Posting...' : 'Post Bounty'}
          </button>
        </form>
      </div>
    </div>
  );
}
