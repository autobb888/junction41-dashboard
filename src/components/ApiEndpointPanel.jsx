import { useState } from 'react';
import { Cpu, Copy, Check, Terminal, BookOpen } from 'lucide-react';

/**
 * Panel shown on AgentDetailPage for serviceType === 'api-endpoint'.
 * Renders the model/pricing table, rate limits, and a "How to connect"
 * SDK snippet. The actual access exchange happens in the buyer's own
 * dispatcher / SDK because it requires their R-address private key.
 */
export default function ApiEndpointPanel({ service, sellerVerusId }) {
  const [copied, setCopied] = useState(null);

  const models = Array.isArray(service.modelPricing) ? service.modelPricing : [];
  const rl = service.rateLimits || {};

  function copy(snippet, key) {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    }).catch(() => {});
  }

  // JSON.stringify keeps untrusted seller-supplied values (model name, verusId)
  // from breaking out of the embedded JS string literal when the snippet is
  // copied to the clipboard.
  const sellerLit = JSON.stringify(sellerVerusId);
  const modelLit = JSON.stringify(models[0]?.model || 'gpt-4o-mini');
  const sdkSnippet = `import { Junction41Client } from '@junction41/sovagent-sdk';

const client = new Junction41Client({
  baseUrl: 'https://app.junction41.io',
  // R-address private key OR a signing function (see SDK docs)
  signer: yourSigner,
});

// 1) Request access — generates an ephemeral keypair, sends a signed
//    request, receives an encrypted envelope back from the seller's
//    dispatcher and decrypts it locally.
const grant = await client.requestApiAccess(${sellerLit});

// 2) Send VRSC to grant.payAddress, then report the deposit so your
//    credit meter is funded.
await client.reportDeposit(${sellerLit}, { txid: '<deposit-txid>' });

// 3) Use the OpenAI-compatible proxy.
const completion = await client.proxyChat(${sellerLit}, {
  model: ${modelLit},
  messages: [{ role: 'user', content: 'Hello' }],
});`;

  return (
    <div style={{
      marginTop: 14,
      padding: '14px 16px',
      borderRadius: 10,
      background: 'rgba(56,189,248,0.04)',
      border: '1px solid rgba(56,189,248,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Cpu size={13} style={{ color: '#38BDF8' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#38BDF8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          API Endpoint
        </span>
      </div>

      {models.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Models &amp; Pricing
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
              <span>Model</span>
              <span style={{ textAlign: 'right' }}>Input / 1M</span>
              <span style={{ textAlign: 'right' }}>Output / 1M</span>
            </div>
            {models.map((m, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, fontSize: 12, padding: '4px 0' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{m.model}</span>
                <span style={{ textAlign: 'right', fontWeight: 500 }}>
                  {m.inputTokenRate} <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{service.currency}</span>
                </span>
                <span style={{ textAlign: 'right', fontWeight: 500 }}>
                  {m.outputTokenRate} <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{service.currency}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(rl.requestsPerMinute || rl.tokensPerMinute) && (
        <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Rate limits: </span>
          {rl.requestsPerMinute ? `${rl.requestsPerMinute} req/min` : null}
          {rl.requestsPerMinute && rl.tokensPerMinute ? ' · ' : null}
          {rl.tokensPerMinute ? `${rl.tokensPerMinute} tok/min` : null}
        </div>
      )}

      <div style={{ paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Terminal size={11} /> How to connect
          </div>
          <button
            onClick={() => copy(sdkSnippet, 'sdk')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
              background: copied === 'sdk' ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
              color: copied === 'sdk' ? 'var(--accent)' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
            }}
          >
            {copied === 'sdk' ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
          </button>
        </div>
        <pre style={{
          fontSize: 11, lineHeight: 1.5,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
          background: 'rgba(0,0,0,0.3)',
          padding: 10,
          borderRadius: 6,
          margin: 0,
          overflowX: 'auto',
          whiteSpace: 'pre',
        }}>
          {sdkSnippet}
        </pre>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
          <BookOpen size={11} />
          <span>Full guide:</span>
          <a
            href="https://docs.junction41.io/dispatcher/api-endpoint-proxy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#38BDF8', textDecoration: 'underline' }}
          >
            docs.junction41.io
          </a>
        </div>
      </div>
    </div>
  );
}
