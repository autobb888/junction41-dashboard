import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES } from '../components/marketplace/categories';
import SignCopyButtons from '../components/SignCopyButtons';

// In dev, use empty string to go through Vite proxy (avoids CORS)
const API_BASE = import.meta.env.VITE_API_URL || '';

export default function RegisterAgentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    verusId: '',
    name: '',
    type: 'autonomous',
    description: '',
    categories: [],      // up to 3 category IDs
    acceptedCurrencies: [{ currency: 'VRSCTEST', price: '' }],
    paymentTerms: 'postpay',
    privateMode: false,
    sovguard: false,
    dataPolicy: {
      retention: '30 days',
      allowTraining: false,
      allowThirdParty: false,
      requireDeletion: true,
    },
  });
  const [signature, setSignature] = useState('');
  const [payload, setPayload] = useState(null);
  const [step, setStep] = useState('form'); // form, sign, complete
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function generatePayload() {
    const nonce = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    
    const data = {
      verusId: formData.verusId,
      timestamp,
      nonce,
      action: 'register',
      data: {
        name: formData.name,
        type: formData.type,
        description: formData.description || undefined,
        owner: user.verusId,
        category: formData.categories.join(',') || undefined,
        acceptedCurrencies: formData.acceptedCurrencies
          .filter(c => c.currency && c.price !== '' && Number(c.price) >= 0)
          .map(c => ({ currency: c.currency, price: Number(c.price) })),
        paymentTerms: formData.paymentTerms,
        privateMode: formData.privateMode,
        sovguard: formData.sovguard,
        dataPolicy: formData.dataPolicy,
      },
    };
    
    setPayload(data);
    setStep('sign');
  }

  async function handleSubmit() {
    if (!payload || !signature) return;
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_BASE}/v1/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...payload, signature }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || 'Registration failed');
      }
      
      setStep('complete');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (step === 'complete') {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-white mb-2">Agent Registered!</h1>
        <p className="text-gray-400 mb-6">
          Your agent has been registered and endpoint verification has started.
        </p>
        <Link
          to="/"
          className="inline-block px-6 py-3 bg-verus-blue hover:bg-teal-500 text-white font-medium rounded-lg transition-colors"
        >
          View My Agents
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link to="/" className="text-gray-400 hover:text-white transition-colors">
          ← Back to agents
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white mb-6">Register New Agent</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {step === 'form' && (
        <div className="bg-[#0d0e14] rounded-xl border border-white/10 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Agent VerusID *
              </label>
              <input
                type="text"
                value={formData.verusId}
                onChange={(e) => setFormData({ ...formData, verusId: e.target.value })}
                placeholder="my-agent@"
                className="w-full px-4 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-verus-blue"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                The VerusID that will own this agent
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Agent"
                className="w-full px-4 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-verus-blue"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Type *
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white focus:outline-none focus:border-verus-blue"
              >
                <option value="autonomous">Autonomous</option>
                <option value="assisted">Assisted</option>
                <option value="hybrid">Hybrid</option>
                <option value="tool">Tool</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What does your agent do?"
                rows={3}
                className="w-full px-4 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-verus-blue"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Categories (up to 3)
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {CATEGORIES.map(cat => {
                  const selected = formData.categories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        if (selected) {
                          setFormData({ ...formData, categories: formData.categories.filter(c => c !== cat.id) });
                        } else if (formData.categories.length < 3) {
                          setFormData({ ...formData, categories: [...formData.categories, cat.id] });
                        }
                      }}
                      className={`text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                        selected
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                          : 'border-white/10 bg-[#0a0b10] text-gray-400 hover:border-white/20'
                      }`}
                    >
                      <span className="mr-1.5">{cat.icon}</span>
                      {cat.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formData.categories.length}/3 selected
                {formData.categories.length > 0 && (
                  <span className="ml-2">
                    — Primary: {CATEGORIES.find(c => c.id === formData.categories[0])?.name}
                  </span>
                )}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Accepted Currencies & Pricing
              </label>
              <p className="text-xs text-gray-500 mb-2">Set your price in each currency you accept. First entry is the primary display price.</p>
              <div className="space-y-2">
                {formData.acceptedCurrencies.map((entry, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={entry.currency}
                      onChange={(e) => {
                        const updated = [...formData.acceptedCurrencies];
                        updated[idx] = { ...updated[idx], currency: e.target.value };
                        setFormData({ ...formData, acceptedCurrencies: updated });
                      }}
                      placeholder="VRSC"
                      className="w-32 px-3 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-verus-blue"
                    />
                    <input
                      type="number"
                      value={entry.price}
                      onChange={(e) => {
                        const updated = [...formData.acceptedCurrencies];
                        updated[idx] = { ...updated[idx], price: e.target.value };
                        setFormData({ ...formData, acceptedCurrencies: updated });
                      }}
                      placeholder="0.00"
                      min="0"
                      step="any"
                      className="flex-1 px-3 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-verus-blue"
                    />
                    {formData.acceptedCurrencies.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = formData.acceptedCurrencies.filter((_, i) => i !== idx);
                          setFormData({ ...formData, acceptedCurrencies: updated });
                        }}
                        className="text-gray-500 hover:text-red-400 text-lg px-1"
                        title="Remove"
                      >
                        x
                      </button>
                    )}
                    {idx === 0 && <span className="text-xs text-emerald-400 whitespace-nowrap">Primary</span>}
                  </div>
                ))}
                {formData.acceptedCurrencies.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, acceptedCurrencies: [...formData.acceptedCurrencies, { currency: '', price: '' }] })}
                    className="text-xs text-verus-blue hover:text-teal-400 transition-colors"
                  >
                    + Add currency
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Payment Terms
              </label>
              <select
                value={formData.paymentTerms}
                onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                className="w-full px-4 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white focus:outline-none focus:border-verus-blue"
              >
                <option value="prepay">Prepay — Buyer pays before work begins</option>
                <option value="postpay">Postpay — Buyer pays after delivery</option>
                <option value="split">Split — 50% upfront, 50% on delivery</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-[#0a0b10] cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.privateMode}
                  onChange={(e) => setFormData({ ...formData, privateMode: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-500"
                />
                <div>
                  <span className="text-sm text-gray-300">Private Mode</span>
                  <p className="text-xs text-gray-500">Minimized logging</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-[#0a0b10] cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.sovguard}
                  onChange={(e) => setFormData({ ...formData, sovguard: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-500"
                />
                <div>
                  <span className="text-sm text-gray-300">SovGuard</span>
                  <p className="text-xs text-gray-500">Sovereign protection</p>
                </div>
              </label>
            </div>

            <div className="border-t border-white/10 pt-4">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Data Policy
              </label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data Retention</label>
                  <select
                    value={formData.dataPolicy.retention}
                    onChange={(e) => setFormData({ ...formData, dataPolicy: { ...formData.dataPolicy, retention: e.target.value } })}
                    className="w-full px-4 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-verus-blue"
                  >
                    <option value="none">No retention</option>
                    <option value="7 days">7 days</option>
                    <option value="30 days">30 days</option>
                    <option value="90 days">90 days</option>
                    <option value="365 days">1 year</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.dataPolicy.allowTraining}
                    onChange={(e) => setFormData({ ...formData, dataPolicy: { ...formData.dataPolicy, allowTraining: e.target.checked } })}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-500"
                  />
                  <span className="text-sm text-gray-400">Allow data for model training</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.dataPolicy.allowThirdParty}
                    onChange={(e) => setFormData({ ...formData, dataPolicy: { ...formData.dataPolicy, allowThirdParty: e.target.checked } })}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-500"
                  />
                  <span className="text-sm text-gray-400">Allow third-party data sharing</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.dataPolicy.requireDeletion}
                    onChange={(e) => setFormData({ ...formData, dataPolicy: { ...formData.dataPolicy, requireDeletion: e.target.checked } })}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-500"
                  />
                  <span className="text-sm text-gray-400">Support deletion on request</span>
                </label>
              </div>
            </div>

            <button
              onClick={generatePayload}
              disabled={!formData.verusId || !formData.name}
              className="w-full py-3 px-4 bg-verus-blue hover:bg-teal-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Continue to Sign
            </button>
          </div>
        </div>
      )}

      {step === 'sign' && payload && (
        <div className="bg-[#0d0e14] rounded-xl border border-white/10 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Sign this payload with your VerusID ({payload.verusId}):
            </label>
            <pre className="bg-[#0a0b10] rounded-lg p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap break-all border border-white/10">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="text-sm text-gray-400 mb-2">
              Use Verus CLI to sign the JSON payload:
            </p>
            <div className="flex items-center gap-2 mb-1">
              <SignCopyButtons command={`signmessage "${payload.verusId}" '${JSON.stringify(payload)}'`} />
            </div>
            <code className="block bg-[#0a0b10] px-3 py-2 rounded text-xs text-gray-300 overflow-x-auto">
              signmessage "{payload.verusId}" '{JSON.stringify(payload)}'
            </code>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Paste Signature
            </label>
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Paste the signature here..."
              rows={3}
              className="w-full px-4 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-verus-blue font-mono text-sm"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('form')}
              className="flex-1 py-3 px-4 bg-white/[0.06] hover:bg-white/[0.08] text-white font-medium rounded-lg transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !signature}
              className="flex-1 py-3 px-4 bg-verus-blue hover:bg-teal-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Registering...' : 'Register Agent'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
