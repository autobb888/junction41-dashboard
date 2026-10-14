import { useState, useRef, useEffect, useCallback } from 'react';
import QRCode from 'react-qr-code';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import SignCopyButtons from './SignCopyButtons';
import { REVIEWABLE_STATUSES } from '../utils/jobReview';
import { safeWalletDeeplink } from '../utils/walletDeeplink';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STAR_LABELS = ['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];

/**
 * Desktop fallback. The phone path signs the server's canonical line instead.
 * This multiline form is the one the command-line paste path already verifies.
 */
function buildReviewMessage(agentVerusId, jobHash, message, rating, timestamp) {
  return [
    'Junction41 Review',
    '===========================',
    `Agent: ${agentVerusId}`,
    `Job: ${jobHash}`,
    `Rating: ${rating || 'N/A'}`,
    `Message: ${message || 'No message'}`,
    `Timestamp: ${timestamp}`,
    '',
    'I confirm this review is genuine.',
  ].join('\n');
}

export default function ReviewModal({ job, onClose, onSubmitted, canSubmit = true, hidden = false }) {
  const { user } = useAuth();
  const addToast = useToast();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState('');
  const [prosePublic, setProsePublic] = useState(true);
  const [step, setStep] = useState('compose'); // compose | submitting | done
  const [signature, setSignature] = useState('');
  const [sigCleared, setSigCleared] = useState(false);
  const sigClearedTimer = useRef(null);
  const [error, setError] = useState(null);
  const [timestamp] = useState(() => Math.floor(Date.now() / 1000));
  const [phoneChallenge, setPhoneChallenge] = useState(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState(null);
  const [phoneNeedsSave, setPhoneNeedsSave] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const phoneGen = useRef(0);
  const requestPhoneRef = useRef(async () => {});
  const confirmLock = useRef(false);
  const onCloseRef = useRef(onClose);
  const onSubmittedRef = useRef(onSubmitted);
  const addToastRef = useRef(addToast);
  onCloseRef.current = onClose;
  onSubmittedRef.current = onSubmitted;
  addToastRef.current = addToast;

  const isNegativeOutcome = ['disputed', 'cancelled'].includes(job.status);
  const modalTitle = isNegativeOutcome ? 'Rate This Experience' : 'Leave a Review';
  const shielded = job.payment?.kind === 'shielded';
  const waitingOnDelivery = !canSubmit && !REVIEWABLE_STATUSES.includes(job.status);

  function clearSignatureWithWarning() {
    if (signature) {
      setSignature('');
      setSigCleared(true);
      if (sigClearedTimer.current) clearTimeout(sigClearedTimer.current);
      sigClearedTimer.current = setTimeout(() => setSigCleared(false), 4000);
    }
  }

  function invalidateSignedReview() {
    phoneGen.current += 1;
    confirmLock.current = false;
    setPhoneChallenge(null);
    setPhoneNeedsSave(false);
    setPhoneError(null);
    clearSignatureWithWarning();
  }

  useEffect(() => {
    return () => { if (sigClearedTimer.current) clearTimeout(sigClearedTimer.current); };
  }, []);

  const modalRef = useRef(null);

  const agentVerusId = job.seller?.verusId || job.sellerVerusId;
  const idName = user?.identityName ? `${user.identityName}@` : (user?.verusId || 'yourID@');

  const signMessage = rating >= 1
    ? buildReviewMessage(agentVerusId, job.jobHash, message, rating, timestamp)
    : null;
  const signCommand = signMessage
    ? `signmessage "${idName}" "${signMessage.replace(/"/g, '\\"')}"`
    : null;
  const safePhoneLink = phoneChallenge ? safeWalletDeeplink(phoneChallenge.deeplink) : null;

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
    if (hidden) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, hidden]);

  useEffect(() => {
    const challengeId = phoneChallenge?.challengeId;
    if (!challengeId) return undefined;
    const gen = phoneGen.current;
    let stopped = false;

    async function confirmPhone() {
      if (gen !== phoneGen.current || confirmLock.current) return;
      confirmLock.current = true;
      setStep('submitting');
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/v1/reviews/consent/confirm/${challengeId}`, {
          method: 'POST',
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (gen !== phoneGen.current) return;
          throw new Error(data.error?.message || 'Could not save the review');
        }
        setStep('done');
        addToastRef.current?.('Review submitted!');
        setTimeout(() => {
          onSubmittedRef.current?.();
          onCloseRef.current?.();
        }, 2000);
      } catch (err) {
        if (gen !== phoneGen.current) return;
        confirmLock.current = false;
        setError(err.message || 'Could not save the review');
        setStep('compose');
        setPhoneNeedsSave(true);
      }
    }

    async function tick() {
      try {
        const res = await fetch(`${API_BASE}/v1/reviews/consent/status/${challengeId}`, { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (stopped || gen !== phoneGen.current) return;
        const status = data.data?.status;
        if (status === 'awaiting_confirm') {
          clearInterval(timer);
          confirmPhone();
        } else if (status === 'expired') {
          clearInterval(timer);
          setPhoneChallenge(null);
          setPhoneError('This request expired. Generate a new one.');
        } else if (status === 'completed') {
          clearInterval(timer);
          setStep('done');
          setTimeout(() => {
            onSubmittedRef.current?.();
            onCloseRef.current?.();
          }, 800);
        }
      } catch { /* keep polling */ }
    }

    tick();
    const timer = setInterval(tick, 2500);
    function onVis() {
      if (document.visibilityState === 'visible') tick();
    }
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [phoneChallenge, retryToken]);

  async function requestPhone() {
    if (!canSubmit || rating < 1) return;
    const gen = ++phoneGen.current;
    confirmLock.current = false;
    setPhoneNeedsSave(false);
    setPhoneError(null);
    setError(null);
    setPhoneBusy(true);
    try {
      const res = await fetch(`${API_BASE}/v1/reviews/consent/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jobHash: job.jobHash,
          rating,
          message: message || '',
          ...(shielded ? { prosePublic } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (gen !== phoneGen.current) return;
      if (!res.ok) throw new Error(data.error?.message || 'Could not create the signing request');
      if (!data.data?.challengeId || !data.data?.deeplink) {
        throw new Error('The signing request did not include a phone code');
      }
      if (!safeWalletDeeplink(data.data.deeplink)) {
        throw new Error('The phone link could not be drawn.');
      }
      setPhoneChallenge({
        challengeId: data.data.challengeId,
        deeplink: data.data.deeplink,
        expiresAt: data.data.expiresAt,
      });
    } catch (err) {
      if (gen !== phoneGen.current) return;
      setPhoneChallenge(null);
      setPhoneError(err.message || 'Could not create the signing request');
    } finally {
      if (gen === phoneGen.current) setPhoneBusy(false);
    }
  }

  requestPhoneRef.current = requestPhone;

  // The window that opens on a finished job is the phone code. Five stars is
  // selected so the code is on screen; changing the stars asks for a new one.
  useEffect(() => {
    if (hidden || !canSubmit || rating >= 1) return;
    setRating(5);
  }, [hidden, canSubmit, rating]);

  useEffect(() => {
    if (hidden || !canSubmit || rating < 1) return undefined;
    const handle = setTimeout(() => { requestPhoneRef.current(); }, 300);
    return () => clearTimeout(handle);
  }, [hidden, canSubmit, rating, message, prosePublic, shielded]);

  async function handleSubmit() {
    if (!canSubmit) return;
    if (!signature.trim()) {
      setError('Please paste your signature');
      return;
    }

    setStep('submitting');
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/v1/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agentVerusId,
          buyerVerusId: user.verusId,
          jobHash: job.jobHash,
          message: message || '',
          rating,
          timestamp,
          signature: signature.trim(),
          ...(shielded ? { prosePublic } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to submit review');

      setStep('done');
      addToast?.('Review submitted!');
      setTimeout(() => {
        onSubmitted?.();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
      setStep('compose');
    }
  }

  if (hidden) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={modalTitle} className="bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">{modalTitle}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl" aria-label="Close">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {step === 'compose' && (
            <>
              {!canSubmit && (
                <p className="text-amber-200 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
                  {waitingOnDelivery
                    ? 'Fill this in now. It sends after the work is delivered — stay on this page.'
                    : 'This review window has closed.'}
                </p>
              )}
              {canSubmit && job.status === 'delivered' && (
                <p className="text-sm text-gray-400">
                  Confirm completion on this page to release payment. Closing this keeps what you have typed.
                </p>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-2">Rating</label>
                <div className="flex gap-2 items-center">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => {
                        if (star === rating) return;
                        invalidateSignedReview();
                        setRating(star);
                      }}
                      className="text-3xl transition-transform hover:scale-110"
                    >
                      {star <= (hoverRating || rating) ? '★' : '☆'}
                    </button>
                  ))}
                  {(hoverRating || rating) > 0 && (
                    <span className="text-sm text-gray-400 ml-2">
                      {STAR_LABELS[(hoverRating || rating) - 1]}
                    </span>
                  )}
                </div>
              </div>

              {canSubmit && (
                <div className="text-center space-y-3">
                  <p className="text-gray-300 text-sm">Scan with Verus Mobile and approve the review. Five stars is selected until you change it.</p>
                  <p className="text-amber-400/90 text-xs max-w-sm mx-auto leading-relaxed">
                    On the phone, turn on Wallet Settings → General Settings → Enable experimental deeplinks, because this review asks the wallet to sign the text.
                  </p>
                  {safePhoneLink ? (
                    <>
                      <div className="bg-white p-5 rounded-lg inline-block mb-2 max-w-full">
                        <QRCode value={safePhoneLink} size={480} level="L" title="Review QR" style={{ height: 'auto', maxWidth: '100%', width: 'min(480px, 100%)' }} />
                      </div>
                      <a href={safePhoneLink} className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg">
                        Open in Verus Mobile
                      </a>
                      <div className="flex items-center justify-center gap-2 text-gray-400">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-400"></div>
                        <span className="text-sm">Waiting for the phone…</span>
                      </div>
                      {phoneNeedsSave && (
                        <button
                          type="button"
                          onClick={() => { confirmLock.current = false; setRetryToken(n => n + 1); }}
                          className="w-full bg-teal-600 hover:bg-teal-500 text-white font-medium py-3 rounded-lg"
                        >
                          Save the review
                        </button>
                      )}
                      <button type="button" onClick={requestPhone} disabled={phoneBusy} className="block mx-auto text-xs text-gray-500 hover:text-gray-300">
                        New code
                      </button>
                    </>
                  ) : (
                    <p className="text-gray-300 text-sm">{phoneError ? 'The phone code is not ready.' : 'Preparing the phone code…'}</p>
                  )}
                  {phoneError && (
                    <>
                      <p className="text-red-400 text-sm">{phoneError}</p>
                      <button
                        type="button"
                        onClick={requestPhone}
                        disabled={phoneBusy}
                        className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition-colors"
                      >
                        Try the phone code again
                      </button>
                    </>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="review-message" className="block text-sm text-gray-400 mb-2">Review (optional)</label>
                <textarea
                  id="review-message"
                  value={message}
                  onChange={e => { setMessage(e.target.value); invalidateSignedReview(); }}
                  placeholder="How was your experience?"
                  rows={3}
                  maxLength={500}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 resize-none"
                />
                <div className="text-xs text-gray-400 text-right mt-1">{message.length}/500</div>
              </div>

              {shielded && (
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400">
                  <input
                    type="checkbox"
                    checked={prosePublic}
                    onChange={e => { setProsePublic(e.target.checked); invalidateSignedReview(); }}
                    className="accent-teal-500"
                  />
                  <span>
                    {prosePublic
                      ? 'Public review — the words can appear with the score'
                      : 'Stars only — the words stay with the agent'}
                  </span>
                </label>
              )}

              {signCommand && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-400">Desktop or command line</summary>
                  <div className="mt-3 space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Sign this message with your VerusID
                      </label>
                      <div className="bg-black/40 border border-white/10 rounded-lg p-3">
                        <code className="text-xs text-green-400 break-all select-all">
                          {signCommand}
                        </code>
                      </div>
                      <SignCopyButtons command={signCommand} className="mt-2" />
                    </div>
                    <div>
                      <label htmlFor="review-signature" className="block text-sm text-gray-400 mb-2">Paste signature</label>
                      <input
                        id="review-signature"
                        type="text"
                        value={signature}
                        onChange={e => {
                          let val = e.target.value;
                          if (val.trim().startsWith('{')) {
                            try { const p = JSON.parse(val.trim()); if (p.signature) val = p.signature; } catch { /* not JSON */ }
                          }
                          setSignature(val);
                          setSigCleared(false);
                        }}
                        placeholder="Paste the signature output here..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 font-mono text-sm"
                      />
                      {sigCleared && (
                        <p className="text-amber-400 text-xs mt-1 animate-pulse">
                          Signature cleared — sign again after editing
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={!signature.trim() || !canSubmit}
                      className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition-colors"
                    >
                      {canSubmit ? 'Submit Review' : (waitingOnDelivery ? 'Waiting for delivery' : 'Review window closed')}
                    </button>
                  </div>
                </details>
              )}
            </>
          )}

          {step === 'submitting' && (
            <div className="text-center py-8">
              <div className="animate-spin text-3xl mb-3">⏳</div>
              <p className="text-gray-400">Verifying signature and submitting review...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-white font-medium">Review submitted!</p>
              <p className="text-gray-400 text-sm mt-1">Thank you for your feedback</p>
            </div>
          )}

          {error && (
            <div id="review-form-error" role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
