import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { SkeletonList, EmptyState } from '../components/Skeleton';

const API_BASE = import.meta.env.VITE_API_URL || '';

const CATEGORIES = [
  'Development',
  'Design',
  'Writing',
  'Research',
  'Analysis',
  'Trading',
  'Support',
  'Other',
];

export default function MyServicesPage() {
  const { user } = useAuth();
  const addToast = useToast();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingService, setEditingService] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const emptyForm = {
    name: '',
    description: '',
    price: '',
    currency: 'VRSCTEST',
    category: 'Development',
    turnaround: '',
    status: 'active',
    serviceType: 'agent',
    endpointUrl: '',
    modelPricing: [{ model: '', inputTokenRate: '', outputTokenRate: '' }],
    rateLimits: { requestsPerMinute: '', tokensPerMinute: '' },
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchServices();
  }, []);

  async function fetchServices() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/v1/me/services`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch services');
      }

      setServices(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingService(null);
    setShowForm(true);
  }

  function openEdit(service) {
    const mp = Array.isArray(service.modelPricing) && service.modelPricing.length > 0
      ? service.modelPricing.map((m) => ({
          model: m.model || '',
          inputTokenRate: m.inputTokenRate != null ? String(m.inputTokenRate) : '',
          outputTokenRate: m.outputTokenRate != null ? String(m.outputTokenRate) : '',
        }))
      : [{ model: '', inputTokenRate: '', outputTokenRate: '' }];
    const rl = service.rateLimits || {};
    setForm({
      name: service.name,
      description: service.description || '',
      price: String(service.price),
      currency: service.currency,
      category: service.category || 'Other',
      turnaround: service.turnaround || '',
      status: service.status,
      serviceType: service.serviceType || 'agent',
      endpointUrl: service.endpointUrl || '',
      modelPricing: mp,
      rateLimits: {
        requestsPerMinute: rl.requestsPerMinute != null ? String(rl.requestsPerMinute) : '',
        tokensPerMinute: rl.tokensPerMinute != null ? String(rl.tokensPerMinute) : '',
      },
    });
    setEditingService(service);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingService(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) {
      setError('Please enter a valid price.');
      setSaving(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price,
      currency: form.currency,
      category: form.category,
      turnaround: form.turnaround.trim() || null,
      status: form.status,
      serviceType: form.serviceType,
    };

    if (form.serviceType === 'api-endpoint') {
      const url = form.endpointUrl.trim();
      if (!url) {
        setError('Endpoint URL is required for API providers.');
        setSaving(false);
        return;
      }
      try { new URL(url); } catch {
        setError('Endpoint URL must be a valid http(s) URL.');
        setSaving(false);
        return;
      }
      payload.endpointUrl = url;

      const cleanedPricing = (form.modelPricing || [])
        .map((m) => ({
          model: (m.model || '').trim(),
          inputTokenRate: m.inputTokenRate === '' ? NaN : Number(m.inputTokenRate),
          outputTokenRate: m.outputTokenRate === '' ? NaN : Number(m.outputTokenRate),
        }))
        .filter((m) => m.model.length > 0);
      if (cleanedPricing.length === 0) {
        setError('Add at least one model with input/output token rates.');
        setSaving(false);
        return;
      }
      const bad = cleanedPricing.find((m) =>
        !Number.isFinite(m.inputTokenRate) || m.inputTokenRate < 0 ||
        !Number.isFinite(m.outputTokenRate) || m.outputTokenRate < 0,
      );
      if (bad) {
        setError(`Token rates for "${bad.model}" must be non-negative numbers.`);
        setSaving(false);
        return;
      }
      payload.modelPricing = cleanedPricing;

      const rl = {};
      const rpm = form.rateLimits.requestsPerMinute;
      const tpm = form.rateLimits.tokensPerMinute;
      if (rpm !== '' && Number.isFinite(Number(rpm)) && Number(rpm) >= 0) rl.requestsPerMinute = Math.floor(Number(rpm));
      if (tpm !== '' && Number.isFinite(Number(tpm)) && Number(tpm) >= 0) rl.tokensPerMinute = Math.floor(Number(tpm));
      payload.rateLimits = Object.keys(rl).length > 0 ? rl : null;
    } else {
      payload.endpointUrl = null;
      payload.modelPricing = null;
      payload.rateLimits = null;
    }

    try {
      const url = editingService
        ? `${API_BASE}/v1/me/services/${editingService.id}`
        : `${API_BASE}/v1/me/services`;
      const method = editingService ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to save service');
      }

      closeForm();
      addToast?.(editingService ? 'Service updated' : 'Service created');
      fetchServices();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(service) {
    setConfirmDelete(service);
  }

  async function executeDelete() {
    const service = confirmDelete;
    setConfirmDelete(null);
    if (!service) return;

    try {
      const res = await fetch(`${API_BASE}/v1/me/services/${service.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to delete');
      }

      addToast?.('Service deleted');
      fetchServices();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading">
        <SkeletonList count={3} lines={2} />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Services</h1>
          <p className="text-gray-400 mt-1">
            Manage the services you offer as {user?.verusId}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary"
        >
          + Add Service
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Services List */}
      {services.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No services yet"
          message="Add your first service to start offering your skills on the marketplace."
          action={<button onClick={openCreate} className="btn-primary">+ Add Service</button>}
        />
      ) : (
        <div className="grid gap-4">
          {services.map((service) => (
            <div
              key={service.id}
              className="card"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-semibold text-white">{service.name}</h3>
                    <span className={`badge badge-${service.status}`}>
                      {service.status}
                    </span>
                    {service.serviceType === 'api-endpoint' && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                        style={{ background: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)' }}>
                        API Provider
                      </span>
                    )}
                  </div>
                  {service.description && (
                    <p className="text-gray-400 mt-2">{service.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 mt-3 text-sm">
                    <span className="text-verus-blue font-medium">
                      {service.price} {service.currency}
                    </span>
                    {service.category && (
                      <span className="text-gray-500">📁 {service.category}</span>
                    )}
                    {service.turnaround && (
                      <span className="text-gray-500">⏱️ {service.turnaround}</span>
                    )}
                  </div>
                  {service.serviceType === 'api-endpoint' && (
                    <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.12)' }}>
                      {service.endpointUrl && (
                        <div className="text-xs mb-2">
                          <span className="text-gray-500">Endpoint: </span>
                          <span className="font-mono text-gray-300 break-all">{service.endpointUrl}</span>
                        </div>
                      )}
                      {Array.isArray(service.modelPricing) && service.modelPricing.length > 0 && (
                        <div className="text-xs">
                          <div className="text-gray-500 mb-1">Models:</div>
                          <div className="grid gap-1">
                            {service.modelPricing.map((m, i) => (
                              <div key={i} className="flex justify-between gap-3">
                                <span className="font-mono text-gray-300">{m.model}</span>
                                <span className="text-gray-400 whitespace-nowrap">
                                  {m.inputTokenRate} in / {m.outputTokenRate} out
                                  <span className="text-gray-600"> per 1M tok</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {service.rateLimits && (service.rateLimits.requestsPerMinute || service.rateLimits.tokensPerMinute) && (
                        <div className="text-xs mt-2 text-gray-400">
                          {service.rateLimits.requestsPerMinute ? `${service.rateLimits.requestsPerMinute} req/min` : null}
                          {service.rateLimits.requestsPerMinute && service.rateLimits.tokensPerMinute ? ' · ' : null}
                          {service.rateLimits.tokensPerMinute ? `${service.rateLimits.tokensPerMinute} tok/min` : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => openEdit(service)}
                    className="btn-secondary text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(service)}
                    className="btn-danger text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0e14] rounded-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Delete Service</h3>
            <p className="text-gray-300">
              Are you sure you want to delete <span className="font-medium text-white">"{confirmDelete.name}"</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.08] text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0e14] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-xl font-semibold text-white">
                {editingService ? 'Edit Service' : 'Add Service'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4" aria-describedby={error ? 'services-form-error' : undefined}>
              {/* Service type tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, serviceType: 'agent' })}
                  className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  style={form.serviceType === 'agent'
                    ? { background: 'rgba(52,211,153,0.12)', color: 'var(--accent)', border: '1px solid rgba(52,211,153,0.25)' }
                    : { color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid transparent' }}
                >
                  SovAgent Service
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, serviceType: 'api-endpoint' })}
                  className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  style={form.serviceType === 'api-endpoint'
                    ? { background: 'rgba(56,189,248,0.12)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.25)' }
                    : { color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid transparent' }}
                >
                  API Provider
                </button>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {form.serviceType === 'api-endpoint'
                  ? 'API providers expose an OpenAI-compatible endpoint. Buyers route through the J41 proxy with per-token billing and on-chain access grants.'
                  : 'Standard SovAgent service — buyers hire the agent for jobs with fixed pricing.'}
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-verus-blue"
                  placeholder="e.g., Smart Contract Audit"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-verus-blue resize-none"
                  rows={3}
                  placeholder="Describe what you offer..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Price *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-verus-blue"
                    placeholder="100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Currency
                  </label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white focus:outline-none focus:border-verus-blue"
                  >
                    <option value="VRSCTEST">VRSCTEST</option>
                    <option value="VRSC">VRSC</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white focus:outline-none focus:border-verus-blue"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Turnaround
                  </label>
                  <input
                    type="text"
                    value={form.turnaround}
                    onChange={(e) => setForm({ ...form, turnaround: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-verus-blue"
                    placeholder="e.g., 24 hours"
                  />
                </div>
              </div>

              {form.serviceType === 'api-endpoint' && (
                <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Endpoint URL *
                    </label>
                    <input
                      type="url"
                      value={form.endpointUrl}
                      onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })}
                      className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-verus-blue font-mono text-sm"
                      placeholder="https://api.example.com/v1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      OpenAI-compatible endpoint your dispatcher proxies to. Never exposed publicly — only delivered to buyers via the encrypted access envelope.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Model Pricing *
                      </label>
                      <span className="text-xs text-gray-500">rates per 1M tokens</span>
                    </div>
                    <div className="space-y-2">
                      {form.modelPricing.map((entry, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <input
                            type="text"
                            value={entry.model}
                            onChange={(e) => {
                              const updated = [...form.modelPricing];
                              updated[idx] = { ...updated[idx], model: e.target.value };
                              setForm({ ...form, modelPricing: updated });
                            }}
                            placeholder="gpt-4o-mini"
                            className="col-span-5 px-3 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-verus-blue font-mono"
                          />
                          <input
                            type="number"
                            value={entry.inputTokenRate}
                            onChange={(e) => {
                              const updated = [...form.modelPricing];
                              updated[idx] = { ...updated[idx], inputTokenRate: e.target.value };
                              setForm({ ...form, modelPricing: updated });
                            }}
                            placeholder="Input"
                            min="0"
                            step="any"
                            className="col-span-3 px-3 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-verus-blue"
                          />
                          <input
                            type="number"
                            value={entry.outputTokenRate}
                            onChange={(e) => {
                              const updated = [...form.modelPricing];
                              updated[idx] = { ...updated[idx], outputTokenRate: e.target.value };
                              setForm({ ...form, modelPricing: updated });
                            }}
                            placeholder="Output"
                            min="0"
                            step="any"
                            className="col-span-3 px-3 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-verus-blue"
                          />
                          {form.modelPricing.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = form.modelPricing.filter((_, i) => i !== idx);
                                setForm({ ...form, modelPricing: updated });
                              }}
                              className="col-span-1 text-gray-500 hover:text-red-400 text-lg"
                              title="Remove"
                              aria-label="Remove model"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      {form.modelPricing.length < 20 && (
                        <button
                          type="button"
                          onClick={() => setForm({
                            ...form,
                            modelPricing: [...form.modelPricing, { model: '', inputTokenRate: '', outputTokenRate: '' }],
                          })}
                          className="text-xs text-verus-blue hover:text-teal-400 transition-colors"
                        >
                          + Add model
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Rates are denominated in your selected currency (e.g. {form.currency}) per 1M input or output tokens.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Rate Limits <span className="text-xs text-gray-500">(optional)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <input
                          type="number"
                          value={form.rateLimits.requestsPerMinute}
                          onChange={(e) => setForm({
                            ...form,
                            rateLimits: { ...form.rateLimits, requestsPerMinute: e.target.value },
                          })}
                          placeholder="Requests / min"
                          min="0"
                          step="1"
                          className="w-full px-3 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-verus-blue"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          value={form.rateLimits.tokensPerMinute}
                          onChange={(e) => setForm({
                            ...form,
                            rateLimits: { ...form.rateLimits, tokensPerMinute: e.target.value },
                          })}
                          placeholder="Tokens / min"
                          min="0"
                          step="1"
                          className="w-full px-3 py-2 bg-[#0a0b10] border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-verus-blue"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-white focus:outline-none focus:border-verus-blue"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="deprecated">Deprecated</option>
                </select>
              </div>

              {error && (
                <div id="services-form-error" role="alert" className="text-red-400 text-sm">{error}</div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.08] text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-verus-blue hover:bg-verus-blue/80 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingService ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
