import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import ResolvedId from './ResolvedId';
import CopyButton from './CopyButton';
import SignCopyButtons from './SignCopyButtons';
import { useDisplayName } from '../context/IdentityContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import HeldMessageIndicator from './HeldMessageIndicator';
import SafetyScanBadge from './SafetyScanBadge';

const API_BASE = import.meta.env.VITE_API_URL || '';

function TypingName({ verusId }) {
  const name = useDisplayName(verusId);
  return <span>{name}</span>;
}
const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

/**
 * Build a signmessage command — single-line format, works in CLI and GUI console.
 */
function buildSignCmd(idName, message) {
  return `signmessage "${idName}" "${message.replace(/"/g, '\\"')}"`;
}

function FileMessage({ content, jobId, messageId }) {
  const [fileInfo, setFileInfo] = useState(null);
  useEffect(() => {
    async function loadFile() {
      try {
        const res = await apiFetch(`/v1/jobs/${jobId}/files`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.data) {
          const file = data.data.find(f => f.messageId === messageId);
          if (file) setFileInfo(file);
        }
      } catch { /* ignore */ }
    }
    loadFile();
  }, [jobId, messageId]);

  if (!fileInfo) return <span>{content}</span>;
  return <FileAttachment fileInfo={fileInfo} jobId={jobId} />;
}

function FileAttachment({ fileInfo, jobId }) {
  const isImage = fileInfo.mimeType?.startsWith('image/');
  const downloadUrl = `${API_BASE}/v1/jobs/${jobId}/files/${fileInfo.id}`;

  return (
    <div style={{ maxWidth: 320 }}>
      {isImage && (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={downloadUrl}
            alt={fileInfo.filename}
            style={{
              maxWidth: '100%', maxHeight: 240, borderRadius: 8,
              border: '1px solid var(--border-default)', display: 'block',
              marginBottom: 6, cursor: 'pointer',
            }}
            loading="lazy"
          />
        </a>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {!isImage && <span style={{ fontSize: 16 }}>{'\uD83D\uDCC4'}</span>}
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileInfo.filename}
          <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>
            {fileInfo.sizeBytes < 1024 ? `${fileInfo.sizeBytes} B`
              : fileInfo.sizeBytes < 1048576 ? `${(fileInfo.sizeBytes / 1024).toFixed(1)} KB`
              : `${(fileInfo.sizeBytes / 1048576).toFixed(1)} MB`}
          </span>
        </span>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--accent)', fontSize: 12, textDecoration: 'none',
            padding: '2px 8px', borderRadius: 4,
            border: '1px solid rgba(52, 211, 153, 0.3)',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          Download
        </a>
      </div>
    </div>
  );
}

export default function Chat({ jobId, job, onJobStatusChanged, onJobAccepted }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [readReceipts, setReadReceipts] = useState({});
  const [expanded, setExpanded] = useState(false);
  const [heldMessages, setHeldMessages] = useState([]);
  const [peerOnline, setPeerOnline] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(null);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  // End-session state
  const [jobStatus, setJobStatus] = useState(job?.status);
  const [endSessionPanel, setEndSessionPanel] = useState(null);
  // null | 'deliver' | 'complete' | 'review' | 'done'
  const [sessionEndingInfo, setSessionEndingInfo] = useState(null);
  // { requestedBy, reason } — from WS event
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Delivery panel state
  const [deliveryMsg, setDeliveryMsg] = useState('');
  const [deliverySig, setDeliverySig] = useState('');
  const [deliveryTs, setDeliveryTs] = useState(null);

  // Complete + review panel state
  const [completeSig, setCompleteSig] = useState('');
  const [completeTs, setCompleteTs] = useState(null);
  const [completeStep, setCompleteStep] = useState('review'); // review | sign
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewPublic, setReviewPublic] = useState(true);


  // Extension panel state
  const [extAmount, setExtAmount] = useState('');
  const [extReason, setExtReason] = useState('');

  // File upload state
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // { file, preview }
  const fileInputRef = useRef(null);

  const isBuyer = job?.buyerVerusId === user?.verusId;
  const isSeller = job?.sellerVerusId === user?.verusId;

  // Sync job status from prop
  useEffect(() => {
    if (job?.status) setJobStatus(job.status);
  }, [job?.status]);

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load initial messages via REST
  useEffect(() => {
    async function loadMessages() {
      try {
        const res = await apiFetch(`/v1/jobs/${jobId}/messages`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.data) {
          setMessages(data.data);
        }
      } catch { /* ignore */ }
    }
    loadMessages();
  }, [jobId]);

  // Socket.IO connection (get chat token first, then connect)
  useEffect(() => {
    let socket;
    let cancelled = false;

    async function connectChat() {
      // Get one-time chat token via REST API
      try {
        const tokenRes = await fetch(`${API_BASE}/v1/chat/token`, { credentials: 'include' });
        if (!tokenRes.ok) {
          // Chat token fetch failed
          return;
        }
        const tokenData = await tokenRes.json();
        const chatToken = tokenData.data?.token;
        if (!chatToken || cancelled) return;

        socket = io(WS_URL, {
          path: '/ws',
          auth: { token: chatToken },
          withCredentials: true,
          transports: ['websocket', 'polling'],
        });
      } catch (err) {
        // Chat token error
        return;
      }
      if (cancelled) { socket?.disconnect(); return; }
      socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_job', { jobId });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('message', (msg) => {
      setMessages(prev => {
        // Deduplicate by server id
        if (prev.some(m => m.id === msg.id)) return prev;
        // Replace optimistic message from same sender with same content
        const optimisticIdx = prev.findIndex(m =>
          m.pending && m.senderVerusId === msg.senderVerusId && m.content === msg.content
        );
        if (optimisticIdx !== -1) {
          const next = [...prev];
          next[optimisticIdx] = msg;
          return next;
        }
        return [...prev, msg];
      });
    });

    socket.on('typing', (data) => {
      if (data.verusId !== user?.verusId) {
        setTypingUser(data.verusId);
        // Clear after 3s
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
      }
    });

    socket.on('message_held', (data) => {
      setHeldMessages(prev => [...prev, { id: data.id || Date.now(), timestamp: Date.now() }]);
    });

    socket.on('read', (data) => {
      setReadReceipts(prev => ({ ...prev, [data.verusId]: data.readAt }));
    });

    socket.on('error', (err) => {
      // Socket error — handled via connected state
    });

    socket.on('user_joined', (data) => {
      if (data.verusId !== user?.verusId) {
        setPeerOnline(true);
      }
    });

    socket.on('user_left', (data) => {
      if (data.verusId !== user?.verusId) {
        setPeerOnline(false);
      }
    });

    socket.on('session_expiring', (data) => {
      setSessionWarning(`Session expires in ${data.remainingSeconds}s`);
      setTimeout(() => setSessionWarning(null), 30000);
    });

    // End-session WS listeners
    socket.on('session_ending', (data) => {
      setSessionEndingInfo({ requestedBy: data.requestedBy, reason: data.reason });
    });

    socket.on('file_uploaded', (data) => {
      // Server creates the chat message via REST, not socket, so add it here
      setMessages(prev => {
        // If message already exists (e.g. arrived via 'message' event), enrich it
        const exists = prev.some(m => m.id === data.messageId);
        if (exists) {
          return prev.map(m =>
            m.id === data.messageId
              ? { ...m, fileId: data.id, fileName: data.filename, fileMimeType: data.mimeType, fileSizeBytes: data.sizeBytes }
              : m
          );
        }
        // Otherwise add as new message with file metadata
        return [...prev, {
          id: data.messageId,
          senderVerusId: data.uploaderVerusId,
          content: `\uD83D\uDCCE Uploaded file: ${data.filename}`,
          createdAt: new Date().toISOString(),
          fileId: data.id,
          fileName: data.filename,
          fileMimeType: data.mimeType,
          fileSizeBytes: data.sizeBytes,
        }];
      });
    });

    socket.on('job_status_changed', (data) => {
      setJobStatus(data.status);
      onJobStatusChanged?.();
      // Auto-open payment for buyer when agent accepts
      if (data.status === 'accepted' && isBuyer) {
        onJobAccepted?.();
      }
      // Auto-open relevant panel for buyer
      if (data.status === 'delivered' && isBuyer) {
        setEndSessionPanel(null); // Let them see the delivered banner
      }
      if (data.status === 'completed') {
        setEndSessionPanel('done');
      }
    });

    } // end connectChat

    connectChat();

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.emit('leave_job', { jobId });
        socketRef.current.disconnect();
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [jobId, user?.verusId]);

  // Send read receipt when viewing messages
  useEffect(() => {
    if (connected && messages.length > 0 && socketRef.current) {
      socketRef.current.emit('read', { jobId });
    }
  }, [messages.length, connected, jobId]);

  function handleSend(e) {
    e.preventDefault();
    // If there's a pending file, send it
    if (pendingFile) {
      sendFile();
      return;
    }
    const content = input.trim();
    if (!content || !socketRef.current || !connected) return;

    // Optimistic: show message immediately at reduced opacity
    const optimisticId = `pending-${Date.now()}-${Math.random()}`;
    setMessages(prev => [...prev, {
      id: optimisticId,
      senderVerusId: user?.verusId,
      content,
      createdAt: new Date().toISOString(),
      pending: true,
    }]);

    socketRef.current.emit('message', { jobId, content });
    setInput('');
  }

  function handleInputChange(e) {
    setInput(e.target.value);
    // Send typing indicator (throttled to once per 2s)
    const now = Date.now();
    if (socketRef.current && connected && now - lastTypingSentRef.current > 2000) {
      socketRef.current.emit('typing', { jobId });
      lastTypingSentRef.current = now;
    }
  }

  // File selection — stages the file, doesn't upload yet
  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setPendingFile({ file, preview });
  }

  function clearPendingFile() {
    if (pendingFile?.preview) URL.revokeObjectURL(pendingFile.preview);
    setPendingFile(null);
  }

  // Upload the pending file
  async function sendFile() {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile.file);
      const res = await apiFetch(`/v1/jobs/${jobId}/files`, {
        method: 'POST',
        body: formData,
      });
      if (res.status === 401) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error?.message || 'Upload failed');
        return;
      }
      clearPendingFile();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  // API actions
  async function handleEndSession() {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/v1/jobs/${jobId}/end-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: 'user_requested' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to request end session');
      // After signaling, open appropriate panel
      if (isSeller) {
        setEndSessionPanel('deliver');
      } else {
        // Buyer goes straight to complete+review
        setEndSessionPanel('complete');
      }
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeliver() {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/v1/jobs/${jobId}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          deliveryHash: 'pending',
          deliveryMessage: deliveryMsg || undefined,
          timestamp: deliveryTs,
          signature: deliverySig.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Delivery failed');
      setEndSessionPanel(null);
      setDeliveryMsg('');
      setDeliverySig('');
      setDeliveryTs(null);
      onJobStatusChanged?.();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete() {
    setActionLoading(true);
    setActionError(null);
    try {
      const body = {
        timestamp: completeTs,
        signature: completeSig.trim(),
      };
      if (reviewRating >= 1) {
        body.rating = reviewRating;
        body.reviewMessage = reviewMessage || '';
        body.publicReview = reviewPublic;
      }
      const res = await fetch(`${API_BASE}/v1/jobs/${jobId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Completion failed');
      setCompleteSig('');
      setCompleteTs(null);
      setEndSessionPanel('done');
      onJobStatusChanged?.();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRequestExtension() {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/v1/jobs/${jobId}/extensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: Number(extAmount), reason: extReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to request extension');
      setEndSessionPanel(null);
      setSessionEndingInfo(null);
      setExtAmount('');
      setExtReason('');
      onJobStatusChanged?.();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const height = expanded ? '600px' : '400px';
  const idName = user?.identityName ? `${user.identityName}@` : 'yourID@';
  const isSessionDone = endSessionPanel === 'done' || (jobStatus === 'completed' && !endSessionPanel);
  const isSessionPaused = jobStatus === 'paused';
  const inputDisabled = isSessionDone || isSessionPaused;

  // Render the action bar content based on current state
  function renderActionBar() {
    // Done state
    if (endSessionPanel === 'done') {
      return (
        <div style={{
          padding: '12px 16px', background: 'rgba(34, 197, 94, 0.1)',
          borderTop: '1px solid rgba(34, 197, 94, 0.3)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#22c55e', fontSize: 16 }}>&#10003;</span>
          <span style={{ color: '#22c55e', fontWeight: 600, fontSize: 14 }}>Session Complete</span>
        </div>
      );
    }


    // Completion panel (buyer, job delivered)
    if (endSessionPanel === 'complete' && isBuyer) {
      if (!completeTs) setCompleteTs(Math.floor(Date.now() / 1000));
      const ts = completeTs || Math.floor(Date.now() / 1000);

      // Step 1: Review (stars + message)
      if (completeStep === 'review') {
        return (
          <div style={{
            padding: '12px 16px', background: 'var(--bg-tertiary)',
            borderTop: '1px solid var(--border-primary)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              Complete & Review
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onMouseEnter={() => setReviewHover(star)}
                  onMouseLeave={() => setReviewHover(0)}
                  onClick={() => setReviewRating(star)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 24, color: star <= (reviewHover || reviewRating) ? '#eab308' : '#4b5563',
                  }}
                >
                  {star <= (reviewHover || reviewRating) ? '\u2605' : '\u2606'}
                </button>
              ))}
              {(reviewHover || reviewRating) > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, alignSelf: 'center' }}>
                  {['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'][(reviewHover || reviewRating) - 1]}
                </span>
              )}
            </div>
            <textarea
              value={reviewMessage}
              onChange={e => setReviewMessage(e.target.value)}
              placeholder="How was your experience? (optional)"
              rows={2}
              maxLength={500}
              style={{
                width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13,
                resize: 'none', outline: 'none',
              }}
            />
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
              cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
            }}>
              <input
                type="checkbox"
                checked={reviewPublic}
                onChange={e => setReviewPublic(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>
                {reviewPublic
                  ? 'Public review \u2014 visible on agent profile with your name'
                  : 'Private feedback \u2014 only the agent sees this, not published on-chain'}
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => { setCompleteStep('sign'); setCompleteSig(''); }}
                disabled={reviewRating < 1}
                className="btn-primary"
                style={{ padding: '6px 14px', fontSize: 13 }}
              >
                Continue to Sign
              </button>
              <button
                onClick={() => { setEndSessionPanel(null); setCompleteTs(null); setReviewRating(0); setReviewMessage(''); }}
                style={{
                  background: 'none', border: '1px solid var(--border-primary)',
                  borderRadius: 6, padding: '6px 14px', fontSize: 13,
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        );
      }

      // Step 2: Sign (includes review data in message)
      const msg = reviewRating >= 1
        ? `J41-COMPLETE|Job:${job.jobHash}|Rating:${reviewRating}|Msg:${reviewMessage || ''}|Ts:${ts}|I confirm delivery and submit this review.`
        : `J41-COMPLETE|Job:${job.jobHash}|Ts:${ts}|I confirm the work has been delivered satisfactorily.`;
      const cmd = buildSignCmd(idName, msg);

      return (
        <div style={{
          padding: '12px 16px', background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-primary)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            Sign to Complete{reviewRating >= 1 ? ` (${reviewRating}\u2605)` : ''}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            Sign this to confirm completion{reviewRating >= 1 ? ' and submit your review' : ''}:
          </p>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 6, padding: 8,
            fontFamily: 'monospace', fontSize: 11, color: '#34D399',
            wordBreak: 'break-all', whiteSpace: 'pre-wrap', marginBottom: 8,
          }}>
            {cmd}
          </div>
          <SignCopyButtons command={cmd} />
          <input
            type="text"
            value={completeSig}
            onChange={e => {
              let val = e.target.value;
              if (val.trim().startsWith('{')) {
                try { const p = JSON.parse(val.trim()); if (p.signature) val = p.signature; } catch { /* not JSON */ }
              }
              setCompleteSig(val);
            }}
            placeholder="Paste signature..."
            style={{
              width: '100%', marginTop: 8, background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)', borderRadius: 6,
              padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'monospace',
              fontSize: 13, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={handleComplete}
              disabled={!completeSig.trim() || actionLoading}
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              {actionLoading ? 'Submitting...' : 'Confirm Complete'}
            </button>
            <button
              onClick={() => { setCompleteStep('review'); setCompleteSig(''); }}
              style={{
                background: 'none', border: '1px solid var(--border-primary)',
                borderRadius: 6, padding: '6px 14px', fontSize: 13,
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              Back
            </button>
          </div>
        </div>
      );
    }

    // Delivery panel (seller)
    if (endSessionPanel === 'deliver' && isSeller) {
      if (!deliveryTs) setDeliveryTs(Math.floor(Date.now() / 1000));
      const ts = deliveryTs || Math.floor(Date.now() / 1000);
      const deliveryHash = 'pending';
      const msg = `J41-DELIVER|Job:${job.jobHash}|Delivery:${deliveryHash}|Ts:${ts}|I have delivered the work for this job.`;
      const cmd = buildSignCmd(idName, msg);

      return (
        <div style={{
          padding: '12px 16px', background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-primary)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            Mark as Delivered
          </div>
          <textarea
            value={deliveryMsg}
            onChange={e => setDeliveryMsg(e.target.value)}
            placeholder="Delivery message (optional)..."
            rows={2}
            maxLength={1000}
            style={{
              width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
              borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13,
              resize: 'none', outline: 'none', marginBottom: 8,
            }}
          />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            Sign this message:
          </p>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 6, padding: 8,
            fontFamily: 'monospace', fontSize: 11, color: '#34D399',
            wordBreak: 'break-all', whiteSpace: 'pre-wrap', marginBottom: 8,
          }}>
            {cmd}
          </div>
          <SignCopyButtons command={cmd} />
          <input
            type="text"
            value={deliverySig}
            onChange={e => {
              let val = e.target.value;
              if (val.trim().startsWith('{')) {
                try { const p = JSON.parse(val.trim()); if (p.signature) val = p.signature; } catch { /* not JSON */ }
              }
              setDeliverySig(val);
            }}
            placeholder="Paste signature..."
            style={{
              width: '100%', marginTop: 8, background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)', borderRadius: 6,
              padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'monospace',
              fontSize: 13, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={handleDeliver}
              disabled={!deliverySig.trim() || actionLoading}
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              {actionLoading ? 'Submitting...' : 'Submit Delivery'}
            </button>
            <button
              onClick={() => { setEndSessionPanel(null); setDeliverySig(''); setDeliveryMsg(''); setDeliveryTs(null); }}
              style={{
                background: 'none', border: '1px solid var(--border-primary)',
                borderRadius: 6, padding: '6px 14px', fontSize: 13,
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    // Extension panel
    if (endSessionPanel === 'extend') {
      return (
        <div style={{
          padding: '12px 16px', background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-primary)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            Extend Session
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Request additional payment to continue the session.
          </p>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              Additional Amount ({job.currency})
            </label>
            <input
              type="number"
              step="0.01"
              min="0.001"
              value={extAmount}
              onChange={e => setExtAmount(e.target.value)}
              placeholder="e.g. 100"
              style={{
                width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              Reason (optional)
            </label>
            <textarea
              value={extReason}
              onChange={e => setExtReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. Job requires more tokens..."
              style={{
                width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13,
                resize: 'none', outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleRequestExtension}
              disabled={!extAmount || Number(extAmount) <= 0 || actionLoading}
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              {actionLoading ? 'Submitting...' : 'Request Extension'}
            </button>
            <button
              onClick={() => { setEndSessionPanel(null); setExtAmount(''); setExtReason(''); }}
              style={{
                background: 'none', border: '1px solid var(--border-primary)',
                borderRadius: 6, padding: '6px 14px', fontSize: 13,
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    // --- Banners and action buttons (no panel open) ---

    // Completed state — show done banner (review is on the JobDetailPage)
    if (jobStatus === 'completed' && !endSessionPanel) {
      return (
        <div style={{
          padding: '10px 16px', background: 'rgba(34, 197, 94, 0.1)',
          borderTop: '1px solid rgba(34, 197, 94, 0.3)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#22c55e', fontSize: 14 }}>&#10003;</span>
          <span style={{ color: '#22c55e', fontWeight: 600, fontSize: 13 }}>
            {isBuyer ? 'Job completed — scroll down to leave a review' : 'Session Complete'}
          </span>
        </div>
      );
    }

    // Delivered state — buyer sees "Confirm & Review"
    if (jobStatus === 'delivered') {
      if (isBuyer) {
        return (
          <div style={{
            padding: '10px 16px', background: 'rgba(52, 211, 153, 0.1)',
            borderTop: '1px solid rgba(52, 211, 153, 0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: '#34D399', fontWeight: 600, fontSize: 13 }}>
              Work delivered — ready to confirm?
            </span>
            <button
              onClick={() => setEndSessionPanel('complete')}
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              Confirm & Review
            </button>
          </div>
        );
      }
      return (
        <div style={{
          padding: '10px 16px', background: 'rgba(52, 211, 153, 0.1)',
          borderTop: '1px solid rgba(52, 211, 153, 0.3)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#34D399', fontWeight: 600, fontSize: 13 }}>
            Delivered — waiting for buyer confirmation
          </span>
        </div>
      );
    }

    // Session ending signal received from other party
    if (jobStatus === 'in_progress' && sessionEndingInfo && sessionEndingInfo.requestedBy !== user?.verusId) {
      return (
        <div style={{
          padding: '10px 16px', background: 'rgba(245, 158, 11, 0.1)',
          borderTop: '1px solid rgba(245, 158, 11, 0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 13 }}>
              Session ending: {sessionEndingInfo.reason || 'Other party requested end'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setEndSessionPanel('extend')}
              style={{
                background: 'none', border: '1px solid var(--border-primary)',
                borderRadius: 6, padding: '6px 14px', fontSize: 13,
                color: 'var(--text-primary)', cursor: 'pointer',
              }}
            >
              Extend Session
            </button>
            <button
              onClick={() => {
                if (isSeller) {
                  setEndSessionPanel('deliver');
                } else {
                  // Buyer can't complete until seller delivers — signal back
                  handleEndSession();
                }
              }}
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              {isSeller ? 'End & Deliver' : 'End & Complete'}
            </button>
          </div>
        </div>
      );
    }

    // Buyer/seller already requested end — show waiting state
    if (jobStatus === 'in_progress' && sessionEndingInfo && sessionEndingInfo.requestedBy === user?.verusId) {
      return (
        <div style={{
          padding: '10px 16px', background: 'rgba(245, 158, 11, 0.1)',
          borderTop: '1px solid rgba(245, 158, 11, 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 13 }}>
            End session requested — waiting for {isBuyer ? 'seller to deliver' : 'buyer to confirm'}...
          </span>
        </div>
      );
    }

    // In-progress — show end session button
    if (jobStatus === 'in_progress') {
      return (
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={handleEndSession}
            disabled={actionLoading}
            style={{
              background: 'none', border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 6, padding: '5px 12px', fontSize: 12,
              color: '#ef4444', cursor: 'pointer',
            }}
          >
            {actionLoading ? 'Ending...' : isSeller ? 'End Session' : 'End Session Early'}
          </button>
        </div>
      );
    }

    return null;
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height, transition: 'height 0.2s',
      background: '#0a0a0a', border: '1px solid #1a1a2e', borderRadius: 6,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", "Cascadia Code", ui-monospace, monospace',
    }}>
      {/* Header — terminal title bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 14px', borderBottom: '1px solid #1a1a2e',
        background: '#0f0f14',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: !connected ? '#ef4444' : peerOnline ? '#34d399' : '#f59e0b',
            display: 'inline-block', boxShadow: connected ? `0 0 6px ${peerOnline ? '#34d39966' : '#f59e0b66'}` : 'none',
          }} title={!connected ? 'Disconnected' : peerOnline ? 'Peer online' : 'Peer offline'} />
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, letterSpacing: '0.03em' }}>
            session
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', color: '#4b5563',
            cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            letterSpacing: '0.05em',
          }}
        >
          {expanded ? '[-] collapse' : '[+] expand'}
        </button>
      </div>

      {/* Messages — terminal log */}
      <div role="log" aria-live="polite" aria-label="Chat messages" style={{
        flex: 1, overflowY: 'auto', padding: '10px 14px',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {messages.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <p style={{ color: '#374151', fontSize: 12, fontFamily: 'inherit', marginBottom: 4 }}>
              -- no messages --
            </p>
            <p style={{ color: '#1f2937', fontSize: 11, fontFamily: 'inherit' }}>
              waiting for input...
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderVerusId === user?.verusId;
            const isFlagged = msg.safetyScore != null && msg.safetyScore >= 0.4;
            return (
              <div
                key={msg.id}
                style={{
                  padding: '6px 0',
                  borderLeft: isFlagged ? '2px solid #eab308' : '2px solid transparent',
                  paddingLeft: 10,
                  opacity: msg.pending ? 0.45 : 1,
                }}
              >
                {/* Role prefix + metadata line */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                    color: isMe ? '#34d399' : '#818cf8',
                  }}>
                    {isMe ? 'you' : 'agent'}
                  </span>
                  <span style={{ color: '#2a2a3a', fontSize: 11 }}>&rsaquo;</span>
                  <span style={{ fontSize: 10, color: '#374151', fontFamily: 'inherit' }}>
                    <ResolvedId address={msg.senderVerusId} size="sm" showAddress={false} />
                  </span>
                  {msg.signed && (
                    <span style={{ fontSize: 9, color: '#34d399', fontFamily: 'inherit', letterSpacing: '0.05em' }}>verified</span>
                  )}
                  <SafetyScanBadge score={msg.safetyScore} warning={isFlagged} />
                  {isFlagged && (
                    <span style={{ fontSize: 9, color: '#eab308', fontFamily: 'inherit' }}>flagged</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#1f2937', fontFamily: 'inherit' }}>
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  {isMe && (
                    <span style={{ fontSize: 10, color: '#374151' }}>
                      {Object.keys(readReceipts).length > 0 ? '\u2713\u2713' : '\u2713'}
                    </span>
                  )}
                </div>
                {/* Message content */}
                <div style={{
                  margin: 0, color: '#d1d5db', fontSize: 13, wordBreak: 'break-word',
                  lineHeight: 1.55, paddingLeft: 2,
                }} className="chat-markdown terminal-chat-content">
                  {msg.content?.startsWith('\uD83D\uDCCE Uploaded file:') && msg.fileId ? (
                    <FileAttachment fileInfo={{ id: msg.fileId, filename: msg.fileName, mimeType: msg.fileMimeType, sizeBytes: msg.fileSizeBytes }} jobId={jobId} />
                  ) : msg.content?.startsWith('\uD83D\uDCCE Uploaded file:') ? (
                    <FileMessage content={msg.content} jobId={jobId} messageId={msg.id} />
                  ) : (
                    <Markdown rehypePlugins={[rehypeSanitize]}>{msg.content}</Markdown>
                  )}
                </div>
              </div>
            );
          })
        )}
        {heldMessages.map(h => (
          <HeldMessageIndicator key={h.id} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Session expiry warning */}
      {sessionWarning && (
        <div style={{
          padding: '4px 14px', fontSize: 11, color: '#f59e0b',
          background: '#0f0f14', borderTop: '1px solid #1a1a2e',
          fontFamily: 'inherit',
        }}>
          ! {sessionWarning}
        </div>
      )}

      {/* Typing indicator */}
      {typingUser && (
        <div style={{
          padding: '3px 14px', fontSize: 11, color: '#374151',
          fontFamily: 'inherit',
        }}>
          <TypingName verusId={typingUser} /> typing<span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div style={{
          padding: '4px 14px', fontSize: 11, color: '#ef4444',
          background: 'rgba(239, 68, 68, 0.06)', borderTop: '1px solid #1a1a2e',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center',
        }}>
          <span style={{ marginRight: 4 }}>err:</span> {actionError}
          <button
            onClick={() => setActionError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
          >
            [x]
          </button>
        </div>
      )}

      {/* End-session action bar */}
      {renderActionBar()}

      {/* Reconnection banner */}
      {!connected && !inputDisabled && (
        <div style={{
          padding: '4px 14px', textAlign: 'center', fontSize: 11,
          background: '#0f0f14', color: '#f59e0b',
          borderTop: '1px solid #1a1a2e', fontFamily: 'inherit',
        }}>
          reconnecting...
        </div>
      )}

      {/* Pending file preview */}
      {pendingFile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
          borderTop: '1px solid #1a1a2e', background: '#0f0f14',
        }}>
          {pendingFile.preview ? (
            <img src={pendingFile.preview} alt="preview" style={{
              width: 36, height: 36, objectFit: 'cover', borderRadius: 3,
              border: '1px solid #1a1a2e',
            }} />
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: 3, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 14,
              background: '#0a0a0a', border: '1px solid #1a1a2e', color: '#4b5563',
            }}>
              f
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              {pendingFile.file.name}
            </p>
            <p style={{ fontSize: 10, color: '#374151', margin: 0, fontFamily: 'inherit' }}>
              {(pendingFile.file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={clearPendingFile}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#4b5563', fontSize: 11, fontFamily: 'inherit',
            }}
            onMouseEnter={e => e.target.style.color = '#ef4444'}
            onMouseLeave={e => e.target.style.color = '#4b5563'}
            title="Remove attachment"
          >
            [x]
          </button>
        </div>
      )}

      {/* Input — terminal prompt */}
      <form
        onSubmit={handleSend}
        style={{
          display: 'flex', gap: 0, padding: '0',
          borderTop: '1px solid #1a1a2e',
          alignItems: 'center', background: '#0f0f14',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.zip,.tar,.gz,.7z,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={inputDisabled || uploading}
          title="Attach file"
          style={{
            background: 'none', border: 'none', cursor: inputDisabled ? 'default' : 'pointer',
            padding: '8px 6px 8px 14px', color: '#4b5563',
            opacity: inputDisabled || uploading ? 0.3 : 0.7,
            fontSize: 14, lineHeight: 1, flexShrink: 0, fontFamily: 'inherit',
          }}
          onMouseEnter={e => { if (!inputDisabled) { e.target.style.opacity = 1; e.target.style.color = '#34d399'; } }}
          onMouseLeave={e => { e.target.style.opacity = inputDisabled ? 0.3 : 0.7; e.target.style.color = '#4b5563'; }}
        >
          {uploading ? '...' : '+'}
        </button>
        <span style={{ color: '#34d399', fontSize: 13, fontFamily: 'inherit', padding: '0 4px 0 2px', opacity: inputDisabled ? 0.3 : 1 }}>&rsaquo;</span>
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder={pendingFile ? `send ${pendingFile.file.name}` : isSessionPaused ? 'session paused' : inputDisabled ? 'session ended' : ''}
          maxLength={4000}
          disabled={inputDisabled}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            padding: '10px 4px', color: '#d1d5db',
            outline: 'none', fontSize: 13, fontFamily: 'inherit',
            opacity: inputDisabled ? 0.3 : 1,
          }}
        />
        <button
          type="submit"
          disabled={(!input.trim() && !pendingFile) || !connected || inputDisabled || uploading}
          style={{
            background: 'none', border: 'none', padding: '8px 14px',
            color: (!input.trim() && !pendingFile) || !connected || inputDisabled ? '#1f2937' : '#34d399',
            cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            fontWeight: 500, letterSpacing: '0.05em',
          }}
        >
          {uploading ? 'sending' : 'send'}
        </button>
      </form>
    </div>
  );
}
