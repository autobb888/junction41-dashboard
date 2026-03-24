import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import CopyButton from './CopyButton';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function AuthModal({ isOpen, onClose, onSuccess }) {
  const { login } = useAuth();
  const [tab, setTab] = useState('cli');
  const [challenge, setChallenge] = useState(null);
  const [verusId, setVerusId] = useState('');
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pollIntervalRef = useRef(null);
  const modalRef = useRef(null);

  // Cleanup polling on unmount or close
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // On mobile, re-poll immediately when user returns from Verus Mobile
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && challenge?.challengeId && tab === 'qr') {
        (async () => {
          try {
            const res = await fetch(`${API_BASE}/auth/consent/status/${challenge.challengeId}`, { credentials: 'include' });
            const data = await res.json();
            if (data.data?.status === 'completed') {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              onSuccess?.();
            } else if (data.data?.status === 'expired') {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setError('Challenge expired.');
              fetchChallenge();
            }
          } catch {}
        })();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [challenge, tab]);

  // Fetch challenge + reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTab('cli');
      setChallenge(null);
      setVerusId('');
      setSignature('');
      setError('');
      setSubmitting(false);
      fetchChallenge();
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
  }, [isOpen]);

  // Focus trap
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const first = modalRef.current.querySelector('button, [href], input, select, textarea');
        if (first) first.focus();
      }
    }, 50);
    return () => { document.removeEventListener('keydown', handleKeyDown); clearTimeout(timer); };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  async function fetchChallenge() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/consent/challenge`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to get challenge');
      setChallenge(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // QR polling
  useEffect(() => {
    if (tab === 'qr' && challenge?.challengeId && isOpen) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/auth/consent/status/${challenge.challengeId}`, { credentials: 'include' });
          const data = await res.json();
          if (data.data?.status === 'completed') {
            clearInterval(pollIntervalRef.current);
            onSuccess?.();
          } else if (data.data?.status === 'expired') {
            clearInterval(pollIntervalRef.current);
            setError('Challenge expired.');
            fetchChallenge();
          }
        } catch {}
      }, 2000);
      return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
    }
  }, [tab, challenge?.challengeId, isOpen]);

  async function handleLogin(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(challenge.challengeId, verusId, signature);
      onSuccess?.();
    } catch (err) {
      setError(err.message);
      fetchChallenge();
      setSignature('');
    } finally {
      setSubmitting(false);
    }
  }

  const userIdForCommand = verusId
    ? (verusId.endsWith('@') ? verusId : verusId + '@')
    : 'YOUR_ID@';

  const signCmd = challenge
    ? `verus ${challenge.signCommand?.includes('-testnet') ? '-testnet ' : ''}signmessage "${userIdForCommand}" "${challenge.challengeHash}"`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Sign In" className="relative w-full max-w-lg mx-4 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <h2 className="text-lg font-bold text-white">Sign In</h2>
              <p className="text-xs text-gray-400">Authenticate with your VerusID</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl transition-colors" aria-label="Close">✕</button>
        </div>

        {/* Consent header */}
        {challenge && (
          <div className="px-6 py-3 border-b border-gray-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-sm text-gray-300">
              <span className="text-verus-blue font-semibold">agentplatform@</span> is requesting you login to Junction41
            </p>
            <p className="text-xs text-gray-500 mt-1">Permission: View your VerusID identity</p>
          </div>
        )}

        {/* Tabs */}
        {challenge && (
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setTab('cli')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'cli' ? 'text-verus-blue border-b-2 border-verus-blue' : 'text-gray-400 hover:text-gray-300'}`}
            >
              CLI / Desktop Wallet
            </button>
            <button
              onClick={() => setTab('qr')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'qr' ? 'text-verus-blue border-b-2 border-verus-blue' : 'text-gray-400 hover:text-gray-300'}`}
            >
              Verus Mobile
            </button>
          </div>
        )}

        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-8" role="status" aria-label="Loading">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-verus-blue"></div>
              <span className="sr-only">Loading...</span>
            </div>
          )}

          {/* CLI Tab */}
          {!loading && challenge && tab === 'cli' && (
            <form onSubmit={handleLogin} className="space-y-4" aria-describedby={error ? 'auth-form-error' : undefined}>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Step 1: Verify this request is from agentplatform@
                </label>
                <div className="relative">
                  <pre className="bg-gray-900 rounded-lg p-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all border border-gray-700 pr-16">
                    {challenge.verifyCommand}
                  </pre>
                  <CopyButton text={challenge.verifyCommand} className="absolute top-2 right-2" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Step 2: Sign the login challenge
                </label>
                <div className="relative">
                  <pre className="bg-gray-900 rounded-lg p-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all border border-gray-700 pr-16">
                    {signCmd}
                  </pre>
                  <CopyButton text={signCmd} className="absolute top-2 right-2" />
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Step 3: Submit
                </label>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={verusId}
                    onChange={(e) => setVerusId(e.target.value)}
                    placeholder="Your VerusID (e.g. yourname@)"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-verus-blue"
                    required
                  />
                  <textarea
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder="Paste signature here..."
                    rows={2}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-verus-blue font-mono text-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={submitting || !verusId || !signature}
                    className="w-full py-3 bg-verus-blue hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Verifying...' : 'Sign In'}
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500 text-center">
                Expires: {new Date(challenge.expiresAt).toLocaleTimeString()}
              </p>
            </form>
          )}

          {/* QR / Mobile Tab */}
          {!loading && challenge && tab === 'qr' && (
            <div className="text-center">
              <div className="hidden md:block">
                <p className="text-gray-300 mb-4">Scan with Verus Mobile:</p>
                <div className="bg-white p-4 rounded-lg inline-block mb-4">
                  <img src={challenge.qrDataUrl} alt="Login QR" className="w-56 h-56" />
                </div>
              </div>
              <div className="md:hidden">
                <p className="text-gray-300 mb-4">Tap to open Verus Mobile:</p>
                <a
                  href={challenge.deeplink}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors mb-4"
                >
                  Open Verus Mobile
                </a>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Expires: {new Date(challenge.expiresAt).toLocaleTimeString()}
              </p>
              <div className="animate-pulse text-gray-400 text-sm">Waiting for signature...</div>
            </div>
          )}

          {error && (
            <div id="auth-form-error" role="alert" className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-700 text-center">
          <p className="text-gray-400 text-xs">
            No VerusID? <a href="https://verus.io/wallet" target="_blank" rel="noopener noreferrer" className="text-verus-blue hover:underline">Get one free</a>
          </p>
        </div>
      </div>
    </div>
  );
}
