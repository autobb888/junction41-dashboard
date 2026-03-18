import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import ResolvedId from '../components/ResolvedId';
import JobStepper from '../components/JobStepper';
import Chat from '../components/Chat';
import AlertBanner from '../components/AlertBanner';
import JobActions from '../components/JobActions';
import DisputeTimeline from '../components/DisputeTimeline';
import ReviewModal from '../components/ReviewModal';

// Status badges now use CSS classes from index.css (badge + badge-{status})

export default function JobDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [existingReview, setExistingReview] = useState(null);
  const [autoOpenPayment, setAutoOpenPayment] = useState(false);
  const chatRef = useRef(null);
  const prevStatusRef = useRef(null);

  useEffect(() => {
    fetchJob();
  }, [id]);

  // Poll for status changes when waiting on the other party (e.g. buyer waiting for agent to accept)
  useEffect(() => {
    if (!job || loading) return;
    const waitingStatuses = ['requested', 'accepted', 'delivered'];
    if (!waitingStatuses.includes(job.status)) return;
    const interval = setInterval(fetchJob, 5000);
    return () => clearInterval(interval);
  }, [job?.status, job?.id, loading]);

  // Auto-open payment when job is accepted and buyer hasn't paid yet
  useEffect(() => {
    if (!job || loading) return;
    const isBuyer = job.buyerVerusId === user?.verusId;
    if (!isBuyer) return;

    const needsPayment = job.status === 'accepted' && !job.payment?.txid;

    // Trigger on transition (requested → accepted) OR on first load if already accepted
    if (needsPayment && (prevStatusRef.current === 'requested' || prevStatusRef.current === null)) {
      setAutoOpenPayment(true);
    }
    prevStatusRef.current = job.status;
  }, [job?.status, loading]);

  // Handle ?action=pay URL param
  useEffect(() => {
    if (searchParams.get('action') === 'pay' && job && !loading) {
      setAutoOpenPayment(true);
      // Clean up URL param
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [job, loading, searchParams]);

  function handleJobStarted() {
    fetchJob();
    setTimeout(() => chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }

  async function fetchJob() {
    try {
      const res = await apiFetch(`/v1/jobs/${id}`);
      if (res.status === 401) return; // apiFetch triggers auth modal
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to fetch job');
      }
      const data = await res.json();
      setJob(data.data);

      // Check for existing review on this job
      if (data.data?.jobHash) {
        try {
          const reviewRes = await apiFetch(`/v1/reviews/job/${data.data.jobHash}`);
          if (reviewRes.ok) {
            const reviewData = await reviewRes.json();
            if (reviewData.data) {
              // API returns single review object or array
              const review = Array.isArray(reviewData.data) ? reviewData.data[0] : reviewData.data;
              if (review) setExistingReview(review);
            }
          }
        } catch { /* no review yet */ }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12" role="status" aria-label="Loading">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-verus-blue mx-auto"></div>
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300">
        {error}
      </div>
    );
  }

  if (!job) return null;

  const isBuyer = job.buyerVerusId === user?.verusId;
  const isSeller = job.sellerVerusId === user?.verusId;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Safety Alerts (buyers only) */}
      {isBuyer && <AlertBanner jobId={id} />}

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/jobs" className="text-gray-400 hover:text-white">
          ← Back
        </Link>
        <span className={`badge badge-${job.status}`}>
          {job.status.replace('_', ' ')}
        </span>
      </div>

      {/* Job Progress Stepper */}
      <div className="card" style={{ padding: '16px 24px' }}>
        <JobStepper status={job.status} hasPayment={!!job.payment?.txid} />
      </div>

      {/* Waiting for agent — shown when buyer is waiting for acceptance */}
      {isBuyer && job.status === 'requested' && (() => {
        const lastSeen = job.seller?.lastSeenAt;
        const seenAgo = lastSeen ? Math.floor((Date.now() - new Date(lastSeen + (lastSeen.endsWith('Z') ? '' : 'Z')).getTime()) / 1000) : null;
        const isOnline = seenAgo !== null && seenAgo < 60;
        const isRecent = seenAgo !== null && seenAgo < 300;
        return (
          <div className="card" style={{ padding: '20px 24px', borderColor: isOnline ? 'rgba(74,222,128,0.2)' : 'var(--border-subtle)' }}>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 text-verus-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                </div>
                {isOnline && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-900"></span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-white font-medium text-sm">
                  {isOnline
                    ? 'Waiting for SovAgent to accept...'
                    : isRecent
                      ? 'Waiting for SovAgent to come back online...'
                      : 'Request sent — waiting for SovAgent response'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {isOnline
                    ? 'Agent is online — should respond shortly'
                    : isRecent
                      ? `Last seen ${Math.floor(seenAgo / 60)} min ago — may respond soon`
                      : lastSeen
                        ? `Last seen ${seenAgo > 86400 ? Math.floor(seenAgo / 86400) + 'd' : seenAgo > 3600 ? Math.floor(seenAgo / 3600) + 'h' : Math.floor(seenAgo / 60) + 'm'} ago`
                        : 'Agent has not been seen yet'}
                </p>
              </div>
              {isOnline && (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
                  </span>
                  <span className="text-green-400 text-xs font-medium">Online</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Job Info */}
      <div className="card space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-white">{job.description}</h1>
            <p className="text-gray-400 mt-1">
              Job #{job.jobHash.slice(0, 8)}...
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-verus-blue">
              {job.amount} {job.currency}
            </p>
            <p className="text-gray-500 text-sm">
              {job.payment.terms}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
          <div>
            <p className="text-gray-500 text-sm mb-1">Buyer</p>
            <ResolvedId address={job.buyerVerusId} size="sm" />
          </div>
          <div>
            <p className="text-gray-500 text-sm mb-1">Seller</p>
            <ResolvedId address={job.sellerVerusId} size="sm" />
          </div>
        </div>

        {/* Payment Status */}
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-400 text-sm">Payment Status</p>
              <p className="text-white">
                {job.payment.txid ? (
                  <span className="text-green-400">✓ Paid ({job.payment.txid.slice(0, 16)}...)</span>
                ) : (
                  <span className="text-yellow-400">Pending</span>
                )}
              </p>
            </div>
            {job.payment.address && (
              <div className="text-right">
                <p className="text-gray-400 text-sm">Pay to</p>
                <p className="text-white font-mono text-xs">{job.payment.address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Delivery */}
        {job.delivery && (
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-2">Delivery</p>
            <p className="text-white break-all font-mono text-sm">{job.delivery.hash}</p>
            {job.delivery.message && (
              <p className="text-gray-300 mt-2">{job.delivery.message}</p>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="pt-4 border-t border-gray-700">
          <p className="text-gray-400 text-sm mb-2">Timeline</p>
          <div className="space-y-1 text-sm">
            <p className="text-gray-300">
              <span className="text-gray-500">Requested:</span> {new Date(job.timestamps.requested).toLocaleString()}
            </p>
            {job.timestamps.accepted && (
              <p className="text-gray-300">
                <span className="text-gray-500">Accepted:</span> {new Date(job.timestamps.accepted).toLocaleString()}
              </p>
            )}
            {job.timestamps.delivered && (
              <p className="text-gray-300">
                <span className="text-gray-500">Delivered:</span> {new Date(job.timestamps.delivered).toLocaleString()}
              </p>
            )}
            {job.timestamps.completed && (
              <p className="text-gray-300">
                <span className="text-gray-500">Completed:</span> {new Date(job.timestamps.completed).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Dispute Timeline */}
      {['disputed', 'resolved', 'resolved_rejected', 'rework'].includes(job.status) && (
        <DisputeTimeline jobId={id} />
      )}

      {/* Job Actions */}
      {(isBuyer || isSeller) && (
        <div className="card">
          <JobActions job={job} onUpdate={fetchJob} autoOpenPayment={autoOpenPayment} onAutoOpenConsumed={() => setAutoOpenPayment(false)} onJobStarted={handleJobStarted} />
        </div>
      )}

      {/* Real-time Chat */}
      {(isBuyer || isSeller) && job.status !== 'cancelled' && (
        <div ref={chatRef}>
          <Chat jobId={id} job={job} onJobStatusChanged={() => fetchJob()} onJobAccepted={() => setAutoOpenPayment(true)} />
        </div>
      )}

      {/* Review Section — shown when job is completed */}
      {job.status === 'completed' && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">Review</h3>
          {existingReview ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 text-lg">
                  {'★'.repeat(existingReview.rating)}{'☆'.repeat(5 - existingReview.rating)}
                </span>
                <span className="text-gray-400 text-sm">
                  {existingReview.rating}/5
                </span>
              </div>
              {existingReview.message && (
                <p className="text-gray-300">{existingReview.message}</p>
              )}
              <p className="text-gray-400 text-xs">
                Reviewed by <ResolvedId verusId={existingReview.buyerVerusId || existingReview.buyer_verus_id} />
              </p>
            </div>
          ) : isBuyer ? (
            <button
              onClick={() => setShowReview(true)}
              className="bg-teal-600 hover:bg-teal-500 text-white font-medium px-6 py-3 rounded-lg transition-colors"
            >
              ⭐ Leave a Review
            </button>
          ) : (
            <p className="text-gray-500">No review yet</p>
          )}
        </div>
      )}

      {/* Review Modal */}
      {showReview && (
        <ReviewModal
          job={job}
          onClose={() => setShowReview(false)}
          onSubmitted={() => fetchJob()}
        />
      )}
    </div>
  );
}
