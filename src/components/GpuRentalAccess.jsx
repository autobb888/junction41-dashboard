import { useState, useEffect } from 'react';
import { Server } from 'lucide-react';
import { apiFetch } from '../utils/api';
import CopyButton from './CopyButton';

function downloadPrivateKey(privateKey, jobId) {
  const blob = new Blob([privateKey], { type: 'application/x-pem-file' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gpu-rental-${jobId}.key`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Field({ label, value }) {
  if (value == null || value === '') return null;
  const text = String(value);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-white font-mono text-sm break-all">{text}</p>
      </div>
      <CopyButton text={text} label="Copy" className="flex-shrink-0 mt-1" />
    </div>
  );
}

export default function GpuRentalAccess({ jobId }) {
  const [status, setStatus] = useState('loading');
  const [ssh, setSsh] = useState(null);
  const [errorMessage, setErrorMessage] = useState('Unable to load GPU access.');

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function load() {
      try {
        const res = await apiFetch(`/v1/jobs/${jobId}/rental-access`);
        if (cancelled) return;
        if (res.status === 401) {
          setErrorMessage('Sign in again to load GPU access.');
          setStatus('error');
          return;
        }
        if (res.status === 404) {
          setStatus('not-ready');
          timer = setTimeout(load, 5000);
          return;
        }
        if (!res.ok) {
          setErrorMessage('Unable to load GPU access.');
          setStatus('error');
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        const payload = body.data || body;
        if (!payload?.ssh) {
          setStatus('not-ready');
          timer = setTimeout(load, 5000);
          return;
        }
        setSsh(payload.ssh);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Server size={16} style={{ color: 'var(--accent)' }} />
        <p className="text-gray-400 text-sm">GPU access</p>
      </div>

      {status === 'loading' && (
        <p className="text-gray-500 text-sm">Checking credentials…</p>
      )}

      {status === 'not-ready' && (
        <p className="text-gray-300 text-sm">Credentials not ready yet</p>
      )}

      {status === 'error' && (
        <p className="text-red-300 text-sm">{errorMessage}</p>
      )}

      {status === 'ready' && ssh && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            SSH into the isolated jail for this job window. Do not share these credentials in chat.
          </p>
          <Field label="Host" value={ssh.host} />
          <Field label="Port" value={ssh.port} />
          <Field label="User" value={ssh.user} />
          {ssh.password ? (
            <Field label="Password" value={ssh.password} />
          ) : null}
          {ssh.privateKey ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-gray-400 text-sm">Private key</p>
                <p className="text-gray-300 text-sm">Download to connect</p>
              </div>
              <button
                type="button"
                onClick={() => downloadPrivateKey(ssh.privateKey, jobId)}
                className="text-xs text-gray-500 hover:text-gray-300 px-1.5 py-0.5 bg-gray-800 rounded transition-colors"
              >
                Download
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
