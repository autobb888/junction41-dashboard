import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { io } from 'socket.io-client';
import { Terminal, Copy, Check, Shield, Eye, XCircle } from 'lucide-react';

const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

export default function WorkspacePanel({ job }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Permission config (before token generation)
  const [mode, setMode] = useState('supervised');
  const [writeEnabled, setWriteEnabled] = useState(true);

  // Generated token data — only store the command string, not the full response
  const [command, setCommand] = useState(null);

  // Fetch existing session on mount
  useEffect(() => {
    fetchSession();
  }, [job.id]);

  // Socket.IO for real-time workspace status updates
  useEffect(() => {
    if (!session) return;
    let socket;
    let cancelled = false;

    (async () => {
      try {
        const chatTokenRes = await apiFetch('/v1/chat/token');
        if (cancelled || !chatTokenRes.ok) return;
        const chatTokenData = await chatTokenRes.json();
        const chatToken = chatTokenData.data?.token;
        if (cancelled || !chatToken) return;

        socket = io(WS_URL, {
          path: '/ws',
          auth: { token: chatToken },
          withCredentials: true,
          transports: ['websocket', 'polling'],
        });

        if (cancelled) { socket.disconnect(); return; }

        socket.on('connect', () => {
          socket.emit('join_job', { jobId: job.id });
        });

        socket.on('workspace:update', (data) => {
          const { status, counts } = data;
          setSession((prev) => prev ? {
            ...prev,
            status,
            counts: counts || prev.counts,
          } : prev);
        });
      } catch {
        // Socket.IO connection failed — status will refresh on next poll
      }
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.emit('leave_job', { jobId: job.id });
        socket.disconnect();
      }
    };
  }, [session?.id, job.id]);

  async function fetchSession() {
    try {
      const res = await apiFetch(`/v1/workspace/${job.id}`);
      if (res.status === 401) return;
      if (!res.ok) {
        setError('Unable to check workspace status');
        return;
      }
      const data = await res.json();
      // I4: Always sync session state — clear when backend returns null
      setSession(data.data || null);
      // Restore connect command from backend if session is pending
      if (data.data?.connectCommand && !command) {
        setCommand(data.data.connectCommand);
      }
    } catch {
      setError('Unable to check workspace status');
    } finally {
      setLoading(false);
    }
  }

  async function generateToken() {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/workspace/${job.id}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          permissions: { read: true, write: writeEnabled },
        }),
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Failed to generate token');
        return;
      }
      // I11: Only store the command string, not workspaceUid or other credentials
      setCommand(data.data.command);
      await fetchSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function abortWorkspace() {
    if (!confirm('Abort workspace? This will immediately disconnect the agent.')) return;
    try {
      const res = await apiFetch(`/v1/workspace/${job.id}/abort`, { method: 'POST' });
      if (res.ok) {
        await fetchSession();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function copyCommand() {
    if (!command) return;
    const full = `# Install (once):\nyarn global add @j41/connect\n\n# Start workspace:\n${command}`;
    try {
      navigator.clipboard.writeText(full);
    } catch {
      // I5: Fallback for insecure contexts
      const textarea = document.createElement('textarea');
      textarea.value = full;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return null;

  // ── Active Session View ────────────────────────────────────────
  if (session && session.status !== 'completed' && session.status !== 'aborted') {
    return (
      <div className="card" style={{ borderColor: 'var(--border-accent)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal size={18} style={{ color: 'var(--accent-primary)' }} />
            <h3 className="text-white font-semibold">Workspace</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge badge-${session.status === 'active' ? 'in_progress' : session.status}`}>
              {session.status}
            </span>
            <button
              onClick={abortWorkspace}
              className="text-red-400 hover:text-red-300 transition-colors"
              title="Abort workspace"
            >
              <XCircle size={18} />
            </button>
          </div>
        </div>

        {/* Mode + Permissions */}
        <div className="flex gap-4 text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          <span className="flex items-center gap-1">
            {session.mode === 'supervised' ? <Eye size={14} /> : <Shield size={14} />}
            {session.mode}
          </span>
          <span>Read: on</span>
          {session.permissions?.write && <span>Write: on</span>}
        </div>

        {/* Pending — show connect command so buyer can run j41-connect */}
        {session.status === 'pending' && command && (
          <div className="mb-4">
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Run this command to connect your project:
            </p>
            <div className="rounded-lg p-4 font-mono text-xs" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}>
              <p style={{ color: 'var(--text-tertiary)' }}># Install (once):</p>
              <p className="text-white mb-2">yarn global add @j41/connect</p>
              <p style={{ color: 'var(--text-tertiary)' }}># Run from your project directory:</p>
              <p className="text-white break-all">{command}</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={copyCommand}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  background: copied ? 'rgba(52, 211, 153, 0.2)' : 'var(--bg-elevated)',
                  color: copied ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy command'}
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-inset)' }}>.</code> = current directory (run from inside your project).
              Or specify a path: <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-inset)' }}>j41-connect ~/code/myapp --uid ...</code>
            </p>
          </div>
        )}

        {session.status === 'pending' && !command && (
          <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Waiting for CLI connection...
            </p>
          </div>
        )}

        {/* Supervised mode note */}
        {session.mode === 'supervised' && session.status === 'active' && (
          <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Supervised mode — approve/reject operations in your CLI terminal
            </p>
          </div>
        )}

        {/* Operation Counts */}
        {session.counts && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Read', value: session.counts.reads, color: 'var(--accent-primary)' },
              { label: 'Written', value: session.counts.writes, color: '#60a5fa' },
              { label: 'Listed', value: session.counts.list_dirs, color: 'var(--text-secondary)' },
              { label: 'Blocked', value: session.counts.blocked, color: session.counts.blocked > 0 ? '#f87171' : 'var(--text-tertiary)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-inset)' }}>
                <div className="text-lg font-bold" style={{ color }}>{value}</div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Disconnected — show reconnect info */}
        {session.status === 'disconnected' && (
          <div className="p-3 rounded-lg" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
            <p className="text-yellow-400 text-sm font-medium">CLI disconnected — 5 min grace period</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Reconnect with: <code>j41-connect . --resume &lt;token&gt;</code>
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Completed/Aborted View ─────────────────────────────────────
  if (session && (session.status === 'completed' || session.status === 'aborted')) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Terminal size={18} style={{ color: 'var(--text-tertiary)' }} />
          <h3 className="text-white font-semibold">Workspace</h3>
          <span className={`badge badge-${session.status}`}>
            {session.status}
          </span>
        </div>
        {session.counts && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {session.counts.reads} files read, {session.counts.writes} written, {session.counts.blocked} blocked
            {session.mode && <span> — {session.mode} mode</span>}
          </p>
        )}
        {session.attestation && (
          <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--bg-inset)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--accent-primary)' }}>
              Workspace attestation signed by platform
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Token Generation View (no active session) ──────────────────
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Terminal size={18} style={{ color: 'var(--accent-primary)' }} />
        <h3 className="text-white font-semibold">Workspace</h3>
      </div>

      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Give the agent sandboxed access to your local files. SovGuard scans everything locally — file contents never leave your machine.
      </p>

      {/* Mode Selection */}
      <div className="mb-4">
        <label className="text-sm font-medium text-white block mb-2">Mode</label>
        <div className="flex gap-3">
          {[
            { value: 'supervised', label: 'Supervised', desc: 'Approve each action in CLI' },
            { value: 'standard', label: 'Standard', desc: 'Watch live feed' },
          ].map((opt) => (
            <label key={opt.value}
              className="flex items-start gap-2 cursor-pointer p-3 rounded-lg flex-1"
              style={{
                background: mode === opt.value ? 'rgba(52, 211, 153, 0.1)' : 'var(--bg-inset)',
                border: `1px solid ${mode === opt.value ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
              }}
            >
              <input
                type="radio"
                name="workspace-mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={(e) => setMode(e.target.value)}
                className="mt-0.5"
              />
              <div>
                <span className="text-white text-sm font-medium">{opt.label}</span>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Permissions */}
      <div className="mb-4">
        <label className="text-sm font-medium text-white block mb-2">Permissions</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked disabled />
            Read files (always on)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={writeEnabled}
              onChange={(e) => setWriteEnabled(e.target.checked)}
            />
            Write files
          </label>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg mb-4" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Generated Command */}
      {command ? (
        <div className="mb-4">
          <div className="rounded-lg p-4 font-mono text-xs" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ color: 'var(--text-tertiary)' }}># Install (once):</p>
            <p className="text-white mb-2">yarn global add @j41/connect</p>
            <p style={{ color: 'var(--text-tertiary)' }}># Run from your project directory:</p>
            <p className="text-white break-all">{command}</p>
          </div>
          <button
            onClick={copyCommand}
            className="mt-2 flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: copied ? 'rgba(52, 211, 153, 0.2)' : 'var(--bg-elevated)',
              color: copied ? 'var(--accent-primary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy command'}
          </button>
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
            <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-inset)' }}>.</code> = current directory (run from inside your project).
            Or specify a path: <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-inset)' }}>j41-connect ~/code/myapp --uid ...</code>
          </p>
        </div>
      ) : (
        <button
          onClick={generateToken}
          disabled={generating}
          className="w-full py-3 rounded-lg font-medium text-sm transition-colors"
          style={{
            background: generating ? 'var(--bg-elevated)' : 'var(--accent-primary)',
            color: generating ? 'var(--text-tertiary)' : 'white',
          }}
        >
          {generating ? 'Generating...' : 'Generate Workspace Token'}
        </button>
      )}
    </div>
  );
}
