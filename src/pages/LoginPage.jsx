import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import CopyButton from '../components/CopyButton';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function LoginPage() {
  const { login } = useAuth();
  const [challenge, setChallenge] = useState(null);
  const [verusId, setVerusId] = useState('');
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState('cli');
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    fetchChallenge();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

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
    if (tab === 'qr' && challenge?.challengeId) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/auth/consent/status/${challenge.challengeId}`, { credentials: 'include' });
          const data = await res.json();
          if (data.data?.status === 'completed') {
            clearInterval(pollIntervalRef.current);
            window.location.reload();
          } else if (data.data?.status === 'expired') {
            clearInterval(pollIntervalRef.current);
            setError('Challenge expired. Refreshing...');
            fetchChallenge();
          }
        } catch {}
      }, 2000);
      return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
    }
  }, [tab, challenge?.challengeId]);

  async function handleLogin(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(challenge.challengeId, verusId, signature);
    } catch (err) {
      setError(err.message);
      // Challenge is consumed on failure — fetch a new one
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
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="text-4xl">⚡</span>
          <h1 className="text-2xl font-bold text-white mt-4">Junction41</h1>
          <p className="text-gray-400 mt-2">Sign in with your VerusID</p>
        </div>

        <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 overflow-hidden">
          {/* Consent header */}
          {challenge && (
            <div className="px-6 py-4 border-b border-gray-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
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
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-verus-blue"></div>
              </div>
            )}

            {/* CLI Tab */}
            {!loading && challenge && tab === 'cli' && (
              <form onSubmit={handleLogin} className="space-y-4">
                {/* Step 1: Verify */}
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

                {/* Step 2: Sign */}
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

                {/* Step 3: Submit */}
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
                    <img src={challenge.qrDataUrl} alt="Login QR" className="w-64 h-64" />
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
                <p className="text-xs text-gray-500 mb-4">
                  Expires: {new Date(challenge.expiresAt).toLocaleTimeString()}
                </p>
                <div className="animate-pulse text-gray-400 text-sm">
                  Waiting for signature...
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          Don't have a VerusID?{' '}
          <a href="https://verus.io/wallet" target="_blank" rel="noopener noreferrer" className="text-verus-blue hover:underline">
            Get one here
          </a>
        </p>
      </div>
    </div>
  );
}
