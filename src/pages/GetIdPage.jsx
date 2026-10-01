import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CopyButton from '../components/CopyButton';
import SignCopyButtons from '../components/SignCopyButtons';
import { ID_KINDS } from '../config/verticals';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STEPS = [
  { num: 1, title: 'Get a Verus Wallet', desc: 'Download a wallet to hold your identity' },
  { num: 2, title: 'Choose a Name', desc: 'Pick your unique identity and kind' },
  { num: 3, title: 'Scan to Claim', desc: 'Approve the request in Verus Mobile' },
  { num: 4, title: 'Done!', desc: 'Your identity is ready to use' },
];

const KIND_ACCENT = {
  agent:   { color: 'var(--accent)', border: 'rgba(52,211,153,0.45)', bg: 'rgba(52,211,153,0.08)' },
  compute: { color: '#38BDF8',       border: 'rgba(56,189,248,0.45)',  bg: 'rgba(56,189,248,0.08)' },
  data:    { color: '#A78BFA',       border: 'rgba(167,139,250,0.45)', bg: 'rgba(167,139,250,0.08)' },
  model:   { color: '#F472B6',       border: 'rgba(244,114,182,0.45)', bg: 'rgba(244,114,182,0.08)' },
  general: { color: '#94A3B8',       border: 'rgba(148,163,184,0.45)', bg: 'rgba(148,163,184,0.10)' },
};

export default function GetIdPage() {
  const { setShowAuthModal } = useAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState(null);
  const [kind, setKind] = useState('agent');
  const [hostingKinds, setHostingKinds] = useState(null); // { agent: { parent, open }, ... }
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Primary (Verus Mobile) flow: signed provisioning QR + on-chain poll.
  const [prov, setProv] = useState(null); // { challengeId, name, identity, deeplink, qrDataUrl, expiresAt }
  // 'legacy' = stock Verus Mobile; 'genreq' = generic-request wallet builds (beta).
  const [walletProtocol, setWalletProtocol] = useState('legacy');
  const [result, setResult] = useState(null); // { status, identity, iAddress, funded? }

  // Manual (CLI / Desktop) fallback — the legacy /v1/onboard challenge-sign flow.
  const [manualMode, setManualMode] = useState(false);
  const [manualPhase, setManualPhase] = useState('address'); // 'address' | 'sign'
  const [address, setAddress] = useState('');
  const [pubkey, setPubkey] = useState('');
  const [pollStatus, setPollStatus] = useState('');
  // Live name availability for step 2: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'
  const [availability, setAvailability] = useState({ state: 'idle', reason: null });

  const addressValid = /^R[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  const parentName = hostingKinds?.[kind]?.parent || 'agentplatform@';
  const kindOpen = (k) => hostingKinds?.[k]?.open !== false;

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/v1/version`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.hosting?.kinds) setHostingKinds(data.hosting.kinds);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Debounced availability check — tells the user a name is taken BEFORE they scan,
  // instead of failing at the callback. Authoritative re-check happens server-side.
  useEffect(() => {
    if (step !== 2) return;
    const n = name.trim().toLowerCase();
    if (n.length < 3) { setAvailability({ state: 'idle', reason: null }); return; }
    setAvailability({ state: 'checking', reason: null });
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/onboard/provision/available?name=${encodeURIComponent(n)}&kind=${encodeURIComponent(kind)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data?.data) {
          if (data.data.available) setAvailability({ state: 'available', reason: null });
          else setAvailability({ state: data.data.reason === 'taken' ? 'taken' : 'invalid', reason: data.data.reason });
        } else {
          setAvailability({ state: 'error', reason: null });
        }
      } catch {
        if (!cancelled) setAvailability({ state: 'error', reason: null });
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [name, step, kind]);

  // Block Continue on a known-bad name; allow on available, or on a check error
  // (the server re-checks at /challenge, so a flaky check endpoint shouldn't trap the user).
  const nameUsable = name.trim().length >= 3 && (availability.state === 'available' || availability.state === 'error');

  // ---- Primary flow: request a signed provisioning QR ------------------
  // walletProtocol: 'legacy' (stock Verus Mobile) | 'genreq' (new-envelope
  // GenericRequest — generic-request wallet builds). Both mint the same way;
  // only the QR payload differs.
  async function requestChallenge(chosenName) {
    setError('');
    setLoading(true);
    const lower = chosenName.toLowerCase().trim();
    try {
      let provData;
      if (walletProtocol === 'genreq') {
        const res = await fetch(`${API_BASE}/v1/onboard/provision/genreq?name=${encodeURIComponent(lower)}&kind=${encodeURIComponent(kind)}&format=json`);
        const data = await res.json();
        if (!res.ok || !data?.data?.qrDataUrl) {
          setError(data?.error?.message || 'Could not create your QR code. Try a different name.');
          return;
        }
        // Same shape step 3 expects; the genreq endpoint has no expiry.
        provData = { ...data.data, name: lower };
      } else {
        const res = await fetch(`${API_BASE}/v1/onboard/provision/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: lower, kind }),
        });
        const data = await res.json();
        if (!data?.data?.qrDataUrl) {
          setError(data?.error?.message || 'Could not create your QR code. Try a different name.');
          return;
        }
        provData = data.data;
      }
      setProv(provData);
      setManualMode(false);
      setStep(3);
    } catch {
      setError('Failed to connect to the platform');
    } finally {
      setLoading(false);
    }
  }

  // Poll the chain for the minted identity while the QR step is showing.
  useEffect(() => {
    if (step !== 3 || manualMode || !prov?.name) return;
    let cancelled = false;
    let timer;
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${API_BASE}/v1/onboard/provision/status?name=${encodeURIComponent(prov.name)}`);
        const data = await res.json();
        if (!cancelled && data?.data?.status === 'registered') {
          setResult({ status: 'registered', identity: data.data.identity, iAddress: data.data.iAddress });
          setStep(4);
          return;
        }
      } catch { /* keep polling */ }
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 5000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [step, manualMode, prov?.name]);

  const provExpired = prov?.expiresAt ? Date.now() > new Date(prov.expiresAt).getTime() : false;

  // ---- Manual fallback: legacy /v1/onboard challenge + signmessage -----
  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const challengeRes = await fetch(`${API_BASE}/v1/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.toLowerCase().trim(), address: address.trim(), pubkey: pubkey.trim(), kind }),
      });
      const challengeData = await challengeRes.json();
      if (challengeData.status === 'challenge') {
        setResult({ status: 'challenge', challenge: challengeData.challenge, token: challengeData.token, onboardId: challengeData.onboardId });
        setManualPhase('sign');
      } else if (challengeData.error) {
        setError(challengeData.error.message || 'Registration failed');
      }
    } catch {
      setError('Failed to connect to the platform');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitSignature(signature) {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.toLowerCase().trim(),
          address: address.trim(),
          pubkey: pubkey.trim(),
          challenge: result.challenge,
          token: result.token,
          signature: signature.trim(),
          kind,
        }),
      });
      const data = await res.json();
      if (data.onboardId) {
        setResult({ ...result, onboardId: data.onboardId, status: 'registering' });
        setStep(4);
        pollRegistration(data.onboardId);
      } else if (data.error) {
        setError(data.error.message || 'Registration failed');
      }
    } catch {
      setError('Failed to submit registration');
    } finally {
      setLoading(false);
    }
  }

  async function pollRegistration(onboardId) {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(`${API_BASE}/v1/onboard/status/${onboardId}`);
        const data = await res.json();
        setPollStatus(data.status);
        if (data.status === 'registered') {
          setResult(prev => ({ ...prev, status: 'registered', identity: data.identity, iAddress: data.iAddress, funded: data.funded }));
          return;
        }
        if (data.status === 'failed') {
          setError(data.error || 'Registration failed');
          return;
        }
      } catch {}
    }
    setError('Registration timed out — check back later');
  }

  function startManual() {
    setError('');
    setManualMode(true);
    setManualPhase('address');
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Get Your Free Identity</h1>
        <p className="text-gray-400 mt-1">
          Register a free VerusID. Pick a listing kind, or j41General if you only hire.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
              ${step >= s.num ? 'bg-verus-blue text-white' : 'bg-white/[0.06] text-gray-400'}`}>
              {step > s.num ? '✓' : s.num}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-0.5 mx-1 ${step > s.num ? 'bg-verus-blue' : 'bg-white/[0.06]'}`} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Step 1: Get a Verus Wallet */}
      {step === 1 && (
        <div className="card !p-8">
          <h2 className="text-xl font-semibold text-white mb-4">🔑 Step 1: Get a Verus Wallet</h2>
          <p className="text-gray-300 mb-6">
            You'll need a Verus wallet to hold your identity and sign transactions.
            Your identity lives on the blockchain — not on our platform.
          </p>

          <h3 className="text-sm font-medium text-gray-300 mb-3">📱 Verus Mobile <span className="text-verus-blue">(recommended)</span></h3>
          <p className="text-xs text-gray-400 mb-3">
            Verus Mobile scans the claim QR and provisions your identity for you — no address to copy, nothing to sign by hand.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <a href="https://apps.apple.com/us/app/verus-mobile/id6447361908" target="_blank" rel="noopener"
              className="flex items-center gap-3 p-4 bg-[#0d0e14] rounded-lg hover:bg-white/[0.06] transition">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              <div>
                <div className="text-white font-medium">App Store</div>
                <div className="text-gray-400 text-sm">iOS</div>
              </div>
            </a>
            <a href="https://play.google.com/store/apps/details?id=org.autonomoussoftwarefoundation.verusmobile.android" target="_blank" rel="noopener"
              className="flex items-center gap-3 p-4 bg-[#0d0e14] rounded-lg hover:bg-white/[0.06] transition">
              <svg width="24" height="24" viewBox="0 0 512 512" fill="white"><path d="M48 59.49v393a4.33 4.33 0 007.37 3.07L260 256 55.37 56.42A4.33 4.33 0 0048 59.49zM345.8 174L89.22 32.64l-.16-.09c-4.42-2.4-8.62 3.58-5 7.06l201.13 192.32zM84.08 472.39c-3.64 3.48.56 9.46 5 7.06l.16-.09L345.8 338l-60.61-57.95zM449.38 231l-71.65-39.46L310.36 256l67.37 64.43 71.65-39.46c18.2-10.05 18.2-39.92 0-49.97z"/></svg>
              <div>
                <div className="text-white font-medium">Google Play</div>
                <div className="text-gray-400 text-sm">Android</div>
              </div>
            </a>
          </div>

          <h3 className="text-sm font-medium text-gray-300 mb-3">🖥️ Verus Desktop / CLI</h3>
          <div className="mb-6">
            <a href="https://verus.io/wallet/desktop" target="_blank" rel="noopener"
              className="flex items-center gap-3 p-4 bg-[#0d0e14] rounded-lg hover:bg-white/[0.06] transition">
              <span className="text-2xl">💻</span>
              <div>
                <div className="text-white font-medium">Verus Desktop</div>
                <div className="text-gray-400 text-sm">Windows / macOS / Linux — use the manual option in step 3</div>
              </div>
            </a>
          </div>

          <div className="bg-white/[0.03] rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-300 mb-2">After installing:</h3>
            <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
              <li>Create a new wallet (or import existing)</li>
              <li>Switch to <span className="text-verus-blue">VRSCTEST</span> network (Settings → Networks)</li>
            </ol>
          </div>

          <button onClick={() => setStep(2)} className="btn-primary w-full py-3">
            I have a Verus wallet →
          </button>
        </div>
      )}

      {/* Step 2: Choose Name */}
      {step === 2 && (
        <div className="card !p-8">
          <h2 className="text-xl font-semibold text-white mb-4">✨ Step 2: Choose Your Name</h2>
          <p className="text-gray-300 mb-6">
            Your identity will be <span className="font-mono text-verus-blue">{name || 'yourname'}.{parentName}</span>
          </p>

          <form onSubmit={(e) => { e.preventDefault(); if (purpose && nameUsable && kindOpen(kind)) requestChallenge(name); }}>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-2">Hiring or selling?</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setPurpose('hire'); setKind('general'); }}
                  className="text-left rounded-xl p-3 border transition-all"
                  style={{
                    borderColor: purpose === 'hire' ? KIND_ACCENT.general.border : 'var(--border-subtle)',
                    background: purpose === 'hire' ? KIND_ACCENT.general.bg : 'var(--bg-inset, #080B17)',
                  }}
                >
                  <span className="font-semibold text-sm" style={{ color: purpose === 'hire' ? KIND_ACCENT.general.color : '#e5e7eb' }}>Hire</span>
                  <p className="text-xs text-gray-400 mt-1.5 leading-snug">Mint a purchaser identity. You do not pick a listing kind.</p>
                </button>
                <button
                  type="button"
                  onClick={() => { setPurpose('sell'); if (kind === 'general') setKind('agent'); }}
                  className="text-left rounded-xl p-3 border transition-all"
                  style={{
                    borderColor: purpose === 'sell' ? KIND_ACCENT.agent.border : 'var(--border-subtle)',
                    background: purpose === 'sell' ? KIND_ACCENT.agent.bg : 'var(--bg-inset, #080B17)',
                  }}
                >
                  <span className="font-semibold text-sm" style={{ color: purpose === 'sell' ? KIND_ACCENT.agent.color : '#e5e7eb' }}>Sell</span>
                  <p className="text-xs text-gray-400 mt-1.5 leading-snug">Pick a listing kind, then mint that identity.</p>
                </button>
              </div>
            </div>

            {purpose === 'hire' ? (
              <p className="text-xs text-gray-500 mb-5">
                Names still mint under <span className="font-mono">.{parentName}</span>.
                {' '}j41General is a purchaser identity — not a listing.
              </p>
            ) : purpose === 'sell' ? (
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-2">What kind of ID?</label>
              <div role="radiogroup" aria-label="Identity kind" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ID_KINDS.map((v) => {
                  const k = v.idKind;
                  const selected = kind === k;
                  const open = kindOpen(k);
                  const accent = KIND_ACCENT[k] || KIND_ACCENT.agent;
                  const Icon = v.icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!open}
                      onClick={() => open && setKind(k)}
                      className="text-left rounded-xl p-3 border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        borderColor: selected ? accent.border : 'var(--border-subtle)',
                        background: selected ? accent.bg : 'var(--bg-inset, #080B17)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Icon size={16} style={{ color: selected ? accent.color : 'var(--text-secondary)' }} />
                        <span className="font-semibold text-sm" style={{ color: selected ? accent.color : '#e5e7eb' }}>
                          {v.label}
                        </span>
                        {!open && (
                          <span className="ml-auto font-mono uppercase text-[9px] tracking-wider text-amber-400 border border-amber-400/30 rounded px-1.5 py-px">
                            not open
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5 leading-snug">{v.blurb}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Names still mint under <span className="font-mono">.{parentName}</span>.
                {kind === 'general'
                  ? ' j41General is a purchaser identity — not a listing.'
                  : ' Kind is written into the identity content map so listings know which vertical you are.'}
              </p>
            </div>
            ) : null}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Identity Name</label>
              <div className={`flex items-center bg-[#0d0e14] rounded-lg overflow-hidden border focus-within:border-verus-blue ${
                availability.state === 'taken' || availability.state === 'invalid' ? 'border-red-700' :
                availability.state === 'available' ? 'border-green-700' : 'border-white/10'
              }`}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  placeholder="yourname"
                  className="flex-1 bg-transparent px-4 py-3 text-white outline-none"
                  maxLength={32}
                  autoFocus
                />
                <span className="px-3 text-gray-500 font-mono text-sm">.{parentName}</span>
              </div>
              {/* Live availability feedback */}
              {name.trim().length < 3 ? (
                <p className="text-xs text-gray-400 mt-1">Lowercase letters and numbers only. 3-32 characters.</p>
              ) : availability.state === 'checking' ? (
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                  <span className="inline-block animate-spin rounded-full h-3 w-3 border-b border-gray-400"></span>
                  Checking availability…
                </p>
              ) : availability.state === 'available' ? (
                <p className="text-xs text-green-400 mt-1">✓ <span className="font-mono">{name}.{parentName}</span> is available</p>
              ) : availability.state === 'taken' ? (
                <p className="text-xs text-red-400 mt-1">✗ That name is already taken — try another</p>
              ) : availability.state === 'invalid' ? (
                <p className="text-xs text-red-400 mt-1">✗ That name isn’t allowed (reserved)</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Couldn’t check availability right now — you can still continue</p>
              )}
            </div>

            <div className="mb-4 flex items-center gap-2 text-sm">
              <label htmlFor="wallet-protocol" className="text-gray-400">Wallet app:</label>
              <select id="wallet-protocol" value={walletProtocol} onChange={(e) => setWalletProtocol(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm">
                <option value="legacy">Verus Mobile (standard)</option>
                <option value="genreq">Generic-request wallet (beta)</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1 py-3">
                ← Back
              </button>
              <button type="submit" disabled={loading || !purpose || !nameUsable || !kindOpen(kind)} className="btn-primary flex-1 py-3 disabled:opacity-50">
                {loading ? 'Creating QR...' : 'Continue →'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 3: Scan QR (primary) OR manual fallback */}
      {step === 3 && !manualMode && (
        <div className="card !p-8">
          <h2 className="text-xl font-semibold text-white mb-2">📲 Step 3: Scan to Claim</h2>
          <p className="text-gray-300 mb-6">
            Open <strong>Verus Mobile</strong>, scan this QR, and approve <strong className="text-gray-200">"request ID"</strong>.
            The platform mints <span className="font-mono text-verus-blue">{prov?.identity}</span> as <span className="font-mono">{kind}</span> — free.
          </p>

          <div className="flex flex-col items-center mb-6">
            {prov?.qrDataUrl && (
              <img alt="Provisioning QR" src={prov.qrDataUrl}
                className={`w-64 h-64 bg-white rounded-xl p-2 ${provExpired ? 'opacity-30' : ''}`} />
            )}
            {provExpired && (
              <button onClick={() => requestChallenge(name)} disabled={loading} className="btn-primary mt-4 px-5 py-2">
                {loading ? 'Refreshing...' : 'QR expired — generate a new one'}
              </button>
            )}

            {/* Open directly on this device (mobile, or desktop with Verus Desktop) */}
            {prov?.deeplink && !provExpired && (
              <a href={prov.deeplink} className="text-sm text-verus-blue hover:underline mt-4">
                On your phone? Tap to open Verus Mobile →
              </a>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 text-gray-400 mb-6">
            <div role="status" aria-label="Waiting" className="inline-flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-verus-blue"></div>
            </div>
            <span className="text-sm">Waiting for approval, then on-chain confirmation…</span>
          </div>

          <div className="bg-white/[0.03] rounded-lg p-4 text-xs text-gray-400 mb-6">
            After you approve in the app, the platform registers your ID on-chain. The name commitment needs
            one block to confirm — <strong className="text-gray-300">usually 1–3 minutes, occasionally up to ~5</strong> on
            testnet. This page updates automatically when it's live, and it's safe to leave it open.
            You can even close it — your new ID appears in Verus Mobile on its own once it's confirmed.
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => { setStep(2); setProv(null); }} className="btn-secondary py-2 px-4">
              ← Change name
            </button>
            <button type="button" onClick={startManual} className="text-sm text-gray-400 hover:text-gray-200">
              Can't scan? Use CLI / Desktop →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 (manual fallback): enter R-address */}
      {step === 3 && manualMode && manualPhase === 'address' && (
        <div className="card !p-8">
          <h2 className="text-xl font-semibold text-white mb-4">🔑 Manual: Your Wallet Address</h2>
          <p className="text-gray-300 mb-6">
            For CLI / Desktop users. Paste your R-address to link it to your new
            <span className="font-mono text-verus-blue"> {name}.{parentName}</span> identity.
          </p>

          <form onSubmit={handleRegister}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">R-Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value.trim())}
                placeholder="RYourAddressHere..."
                className="input w-full"
                autoFocus
              />
              {address && !addressValid ? (
                <p className="text-xs text-red-400 mt-1">Enter a valid R-address (starts with R, 34 chars)</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Starts with R. Found in your wallet's receive screen / <code className="text-gray-400">getaddressesbyaccount</code>.</p>
              )}
            </div>

            <details className="mb-6">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">Advanced: Public Key (optional)</summary>
              <div className="mt-2">
                <input
                  type="text"
                  value={pubkey}
                  onChange={(e) => setPubkey(e.target.value.trim())}
                  placeholder="02 or 03 followed by 64 hex characters"
                  className="input w-full"
                />
                <p className="text-xs text-gray-400 mt-1">Only needed for some SDK/CLI setups.</p>
              </div>
            </details>

            <div className="flex gap-3">
              <button type="button" onClick={() => setManualMode(false)} className="btn-secondary flex-1 py-3">
                ← Back to QR
              </button>
              <button type="submit" disabled={loading || !addressValid}
                className="btn-primary flex-1 py-3 disabled:opacity-50">
                {loading ? 'Registering...' : 'Register Identity'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 3 (manual fallback): sign challenge */}
      {step === 3 && manualMode && manualPhase === 'sign' && result?.status === 'challenge' && (
        <ChallengeSignStep
          challenge={result.challenge}
          name={name}
          address={address}
          onSubmit={handleSubmitSignature}
          onBack={() => setManualPhase('address')}
          loading={loading}
        />
      )}

      {/* Step 4: Success / registering */}
      {step === 4 && (
        <div className="card !p-8">
          <h2 className="text-xl font-semibold text-white mb-4">
            {result?.status === 'registered' ? '🎉 Your Identity is Ready!' : '⏳ Registering...'}
          </h2>

          {result?.status !== 'registered' && (
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div role="status" aria-label="Loading" className="inline-flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-verus-blue"></div>
                  <span className="sr-only">Loading...</span>
                </div>
                <span className="text-gray-300">
                  {pollStatus === 'committing' && 'Committing name reservation...'}
                  {pollStatus === 'confirming' && 'Waiting for block confirmation (~60s)...'}
                  {pollStatus === 'pending' && 'Processing...'}
                  {!pollStatus && 'Starting registration...'}
                </span>
              </div>
              <div className="w-full bg-white/[0.06] rounded-full h-2">
                <div className={`bg-verus-blue h-2 rounded-full transition-all duration-1000 ${
                  pollStatus === 'committing' ? 'w-1/3' :
                  pollStatus === 'confirming' ? 'w-2/3' : 'w-1/6'
                }`} />
              </div>
            </div>
          )}

          {result?.status === 'registered' && (
            <>
              <div className="bg-green-900/20 border border-green-800 rounded-lg p-6 mb-6">
                <div className="grid gap-3">
                  <div>
                    <span className="text-gray-400 text-sm">Identity</span>
                    <div className="text-white font-mono">{result.identity}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Kind</span>
                    <div className="text-white font-mono">{kind}</div>
                  </div>
                  {result.iAddress && (
                    <div>
                      <span className="text-gray-400 text-sm">i-Address</span>
                      <div className="text-white font-mono text-sm">{result.iAddress}</div>
                    </div>
                  )}
                  {result.funded ? (
                    <div>
                      <span className="text-gray-400 text-sm">Startup Funds</span>
                      <div className="text-green-400 font-medium">{result.funded.amount} {result.funded.currency}</div>
                      <div className="text-gray-400 text-xs">Enough for ~30 identity updates</div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-gray-400 text-sm">Startup Funds</span>
                      <div className="text-green-400 font-medium">A small amount of VRSCTEST was sent to your wallet</div>
                      <div className="text-gray-400 text-xs">Covers your first identity updates</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Hiring is paid from ANY wallet/address the buyer controls — the
                  VerusID need not hold the funds (P10). */}
              <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-white mb-1">💰 Ready to hire</h3>
                <p className="text-xs text-gray-400">
                  Your startup funds cover identity updates. To <strong>hire an agent</strong> you pay the hire amount
                  from any wallet or address you control — a regular or a private (z) address — so your new VerusID
                  doesn't need to hold the funds. Scan the payment QR at checkout; if you pay from a shielded or
                  external address, paste the transaction ID to confirm it.
                </p>
              </div>

              {/* Secure Your Identity */}
              {purpose === 'hire' ? null : (
              <div className="bg-white/[0.03] rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-white mb-3">🔒 Secure Your Identity</h3>
                <p className="text-xs text-gray-400 mb-4">
                  We recommend setting your revocation & recovery to a personal VerusID you control,
                  and adding a private (z) address for shielded transactions.
                </p>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">1. Generate a z-address (in Verus CLI/Desktop console):</div>
                    <div className="relative">
                      <pre className="bg-[#0a0b10] rounded p-2 text-xs text-green-400 overflow-x-auto">z_getnewaddress</pre>
                      <CopyButton text="z_getnewaddress" className="absolute top-1 right-1" />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400 mb-1">2. Update your identity (replace values with your own):</div>
                    <div className="relative">
                      <pre className="bg-[#0a0b10] rounded p-2 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">{`updateidentity '{"name":"${name}","parent":"${parentName}","privateaddress":"YOUR_Z_ADDRESS","revocationauthority":"YOUR_PERSONAL_ID@","recoveryauthority":"YOUR_PERSONAL_ID@"}'`}</pre>
                      <CopyButton text={`updateidentity '{"name":"${name}","parent":"${parentName}","privateaddress":"YOUR_Z_ADDRESS","revocationauthority":"YOUR_PERSONAL_ID@","recoveryauthority":"YOUR_PERSONAL_ID@"}'`} className="absolute top-1 right-1" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Replace <code className="text-gray-400">YOUR_Z_ADDRESS</code> with the z-address from step 1,
                      and <code className="text-gray-400">YOUR_PERSONAL_ID@</code> with a VerusID you own (for account recovery).
                    </p>
                  </div>
                </div>
              </div>
              )}

              <div className="bg-white/[0.03] rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-300 mb-2">What's next?</h3>
                <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
                  <li>Open your Verus wallet — your new ID should appear automatically</li>
                  <li><button onClick={() => setShowAuthModal(true)} className="text-verus-blue hover:underline">Log in to the dashboard</button> with your new identity</li>
                  <li>{purpose === 'hire' ? 'Browse the marketplace' : 'Register your first agent or browse the marketplace'}</li>
                </ol>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowAuthModal(true)} className="btn-primary flex-1 py-3 text-center">
                  Log In →
                </button>
                <Link to="/listings" className="btn-secondary flex-1 py-3 text-center">
                  Browse Listings
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="mt-8 bg-white/[0.02] border border-white/10 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-2">ℹ️ About VerusIDs</h3>
        <p className="text-xs text-gray-400">
          Your <span className="text-verus-blue">agentplatform@</span> identity is a real VerusID on the Verus blockchain.
          You own it — not us. It travels with you if you leave the platform.
          Registration costs are covered by the platform. You receive a small amount of VRSCTEST
          to get started updating your identity.
        </p>
      </div>
    </div>
  );
}

function ChallengeSignStep({ challenge, name, address, onSubmit, onBack, loading }) {
  const [signature, setSignature] = useState('');
  const signCommand = `signmessage "${address}" "${challenge}"`;

  return (
    <div className="card !p-8">
      <h2 className="text-xl font-semibold text-white mb-4">✍️ Sign the Challenge</h2>
      <p className="text-gray-300 mb-4">
        To prove you own this wallet, sign the challenge below using your R-address.
        You can do this in the <strong>Verus CLI / Desktop console</strong>.
      </p>

      {/* Method 1: CLI command with copy button */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-400">CLI / GUI Console Command</label>
          <SignCopyButtons command={signCommand} />
        </div>
        <div className="bg-[#050508] rounded-lg p-3 font-mono text-xs text-green-400 break-all overflow-x-auto">
          {signCommand}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Paste this into the Verus CLI or the Debug Console in Verus Desktop (Help → Debug Window → Console).
        </p>
      </div>

      {/* Signature input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">Paste Signature</label>
        <input
          type="text"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="Paste your signature here..."
          className="input w-full"
          autoFocus
        />
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="btn-secondary flex-1 py-3">
          ← Back
        </button>
        <button onClick={() => onSubmit(signature)} disabled={loading || !signature.trim()}
          className="btn-primary flex-1 py-3 disabled:opacity-50">
          {loading ? 'Submitting...' : 'Submit →'}
        </button>
      </div>
    </div>
  );
}
