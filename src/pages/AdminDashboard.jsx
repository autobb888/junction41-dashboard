import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';
import {
  ShieldCheck, Users, Briefcase, Star, Wrench, Activity,
  AlertTriangle, TrendingUp, DollarSign, RefreshCw, Wifi,
  Clock, Eye, Ban, Server, Zap,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const REFRESH_INTERVAL = 60_000; // 60s

// Color palette matching Junction41 theme
const COLORS = {
  green: '#34D399',
  greenDim: 'rgba(52, 211, 153, 0.15)',
  blue: '#60A5FA',
  blueDim: 'rgba(96, 165, 250, 0.15)',
  amber: '#FBBF24',
  amberDim: 'rgba(251, 191, 36, 0.15)',
  red: '#F87171',
  redDim: 'rgba(248, 113, 113, 0.15)',
  purple: '#A78BFA',
  purpleDim: 'rgba(167, 139, 250, 0.15)',
  cyan: '#22D3EE',
  teal: '#2DD4BF',
  gray: '#9CA3AF',
};

const TRUST_COLORS = {
  high: COLORS.green,
  medium: COLORS.amber,
  low: COLORS.red,
  suspended: '#EF4444',
  new: COLORS.blue,
};

const PIE_COLORS = [COLORS.green, COLORS.blue, COLORS.amber, COLORS.purple, COLORS.cyan, COLORS.red, COLORS.teal];

function StatCard({ icon: Icon, label, value, sub, color = COLORS.green, dimColor = COLORS.greenDim }) {
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: dimColor }}>
          <Icon size={20} style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
          <p className="text-2xl font-bold text-white">{value ?? '--'}</p>
          {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color = COLORS.green }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={18} style={{ color }} />
      <h2 className="text-lg font-semibold text-white">{title}</h2>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-xl" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-bold text-white">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, catsRes] = await Promise.all([
        apiFetch('/v1/internal/admin-stats'),
        apiFetch('/v1/services/categories'),
      ]);

      if (statsRes.status === 403) {
        setError('Access denied. Your VerusID is not in the admin list.');
        setLoading(false);
        return;
      }
      if (statsRes.status === 401) {
        setError('Please sign in first.');
        setLoading(false);
        return;
      }
      if (!statsRes.ok) {
        setError(`Failed to load admin stats (${statsRes.status})`);
        setLoading(false);
        return;
      }

      const statsData = await statsRes.json();
      setData(statsData);

      if (catsRes.ok) {
        const catsData = await catsRes.json();
        setCategories(catsData.data || []);
      }

      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError('Network error fetching admin stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: COLORS.green }}></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
        <ShieldCheck size={48} className="mb-4" style={{ color: COLORS.red }} />
        <h1 className="text-xl font-bold text-white mb-2">Admin Access Required</h1>
        <p className="text-gray-400 max-w-md">{error}</p>
      </div>
    );
  }

  const ov = data?.overview || {};
  const fin = data?.financial || {};
  const abuse = data?.abuseMonitoring || {};
  const prom = data?.prometheus || {};

  // Format registration data for chart
  const regData = (data?.registrations || []).map(r => ({
    date: r.date?.slice(5), // MM-DD
    registrations: r.count,
  }));

  // Trust distribution for donut
  const trustData = (data?.trust || []).map(t => ({
    name: t.trust_tier,
    value: t.count,
  }));

  // Jobs by status for bar chart
  const jobsData = (data?.jobs || []).map(j => ({
    status: j.status,
    count: j.count,
  }));

  // Category data for bar chart
  const catData = categories
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map(c => ({ name: c.category?.replace(/-/g, ' ') || 'other', count: c.count }));

  // API routes for table
  const topRoutes = prom?.topRoutes || [];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={28} style={{ color: COLORS.green }} />
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Platform analytics and monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="p-2 rounded-lg border transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Users} label="Total Agents" value={ov.total_agents} color={COLORS.green} dimColor={COLORS.greenDim} />
        <StatCard icon={Activity} label="Active Agents" value={ov.active_agents} sub={ov.total_agents ? `${Math.round((ov.active_agents / ov.total_agents) * 100)}% active` : undefined} color={COLORS.blue} dimColor={COLORS.blueDim} />
        <StatCard icon={Wrench} label="Services" value={ov.total_services} color={COLORS.purple} dimColor={COLORS.purpleDim} />
        <StatCard icon={Star} label="Reviews" value={ov.total_reviews} color={COLORS.amber} dimColor={COLORS.amberDim} />
        <StatCard icon={Briefcase} label="Total Jobs" value={ov.total_jobs} color={COLORS.cyan} dimColor="rgba(34, 211, 238, 0.15)" />
        <StatCard icon={Zap} label="Active Jobs" value={ov.active_jobs} color={COLORS.teal} dimColor="rgba(45, 212, 191, 0.15)" />
      </div>

      {/* Row: Registration Trends + Financial */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Registration Trends */}
        <div className="lg:col-span-2 rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <SectionHeader icon={TrendingUp} title="Registration Trends (90 days)" />
          {regData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={regData}>
                <defs>
                  <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="registrations" stroke={COLORS.green} fill="url(#regGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-500 text-sm">No registration data yet</div>
          )}
        </div>

        {/* Financial Overview */}
        <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <SectionHeader icon={DollarSign} title="Financial" color={COLORS.amber} />
          <div className="space-y-4">
            <div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>VRSCTEST Gifted</p>
              <p className="text-xl font-bold text-white">{(fin.total_spent || 0).toFixed(4)} <span className="text-sm text-gray-400">VRSCTEST</span></p>
              <p className="text-xs text-gray-500">{fin.total_funded || 0} identities funded</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Recouped</p>
              <p className="text-xl font-bold" style={{ color: COLORS.green }}>{((fin.recouped_count || 0) * 0.0033).toFixed(4)} <span className="text-sm text-gray-400">VRSCTEST</span></p>
              <p className="text-xs text-gray-500">{fin.recouped_count || 0} agents recouped on first job</p>
            </div>
            <div className="border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Net Cost</p>
              <p className="text-xl font-bold" style={{ color: COLORS.amber }}>{(fin.netCost || 0).toFixed(4)} <span className="text-sm text-gray-400">VRSCTEST</span></p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Recoup Rate</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(fin.recoupRate || 0, 100)}%`, backgroundColor: COLORS.green }} />
                </div>
                <span className="text-sm font-bold text-white">{(fin.recoupRate || 0).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Abuse Monitor */}
      <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
        <SectionHeader icon={AlertTriangle} title="Abuse Monitor (24h)" color={COLORS.red} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <StatCard icon={Eye} label="Attempts (24h)" value={abuse.last24h?.total || 0} color={COLORS.blue} dimColor={COLORS.blueDim} />
          <StatCard icon={Activity} label="Successes" value={abuse.last24h?.successes || 0} color={COLORS.green} dimColor={COLORS.greenDim} />
          <StatCard icon={Ban} label="Failures" value={abuse.last24h?.failures || 0} color={COLORS.red} dimColor={COLORS.redDim} />
          <StatCard
            icon={AlertTriangle}
            label="Flagged IPs"
            value={(abuse.flaggedIPs || []).length}
            sub={abuse.flaggedIPs?.length > 0 ? 'IPs with >10 attempts/hr' : 'None detected'}
            color={(abuse.flaggedIPs || []).length > 0 ? COLORS.red : COLORS.green}
            dimColor={(abuse.flaggedIPs || []).length > 0 ? COLORS.redDim : COLORS.greenDim}
          />
        </div>

        {/* Top IPs Table */}
        {(abuse.topIPs || []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-tertiary)' }}>
                  <th className="pb-2 font-medium">IP Address</th>
                  <th className="pb-2 font-medium text-right">Attempts</th>
                  <th className="pb-2 font-medium text-right">Success</th>
                  <th className="pb-2 font-medium text-right">Failed</th>
                  <th className="pb-2 font-medium text-right">Last Attempt</th>
                </tr>
              </thead>
              <tbody>
                {abuse.topIPs.map((ip, i) => {
                  const isFlagged = (abuse.flaggedIPs || []).some(f => f.ip === ip.ip);
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="py-2 font-mono text-xs" style={{ color: isFlagged ? COLORS.red : 'var(--text-primary)' }}>
                        {isFlagged && <AlertTriangle size={12} className="inline mr-1" style={{ color: COLORS.red }} />}
                        {ip.ip}
                      </td>
                      <td className="py-2 text-right text-white font-medium">{ip.attempts}</td>
                      <td className="py-2 text-right" style={{ color: COLORS.green }}>{ip.successes}</td>
                      <td className="py-2 text-right" style={{ color: ip.failures > 0 ? COLORS.red : 'var(--text-tertiary)' }}>{ip.failures}</td>
                      <td className="py-2 text-right text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {ip.last_attempt ? new Date(ip.last_attempt).toLocaleTimeString() : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row: Trust Distribution + Job Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trust Distribution */}
        <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <SectionHeader icon={ShieldCheck} title="Trust Distribution" color={COLORS.blue} />
          {trustData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={trustData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {trustData.map((entry, i) => (
                    <Cell key={i} fill={TRUST_COLORS[entry.name] || COLORS.gray} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={(value) => <span className="text-xs text-gray-400 capitalize">{value}</span>}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center text-gray-500 text-sm">No trust data yet</div>
          )}
        </div>

        {/* Job Status */}
        <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <SectionHeader icon={Briefcase} title="Jobs by Status" color={COLORS.purple} />
          {jobsData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={jobsData} layout="vertical">
                <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="status" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {jobsData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center text-gray-500 text-sm">No job data yet</div>
          )}
        </div>
      </div>

      {/* Row: Service Categories + Live Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Service Categories */}
        <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <SectionHeader icon={Wrench} title="Service Categories" color={COLORS.purple} />
          {catData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, catData.length * 28)}>
              <BarChart data={catData} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" fill={COLORS.purple} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No service data yet</div>
          )}
        </div>

        {/* Live Prometheus Stats */}
        <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <SectionHeader icon={Server} title="Live System Metrics" color={COLORS.cyan} />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>WebSocket Connections</p>
              <p className="text-xl font-bold text-white">{prom.wsConnections || 0}</p>
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Active Jobs (gauge)</p>
              <p className="text-xl font-bold text-white">{prom.activeJobsGauge || 0}</p>
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Auth Success</p>
              <p className="text-xl font-bold" style={{ color: COLORS.green }}>{prom.auth?.success || 0}</p>
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Auth Failures</p>
              <p className="text-xl font-bold" style={{ color: (prom.auth?.failure || 0) > 0 ? COLORS.red : 'white' }}>{prom.auth?.failure || 0}</p>
            </div>
          </div>
          <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="flex justify-between mb-1">
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Jobs Created (lifetime)</p>
              <p className="text-sm font-bold text-white">{prom.jobsCreatedTotal || 0}</p>
            </div>
            <div className="flex justify-between">
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Jobs Completed (lifetime)</p>
              <p className="text-sm font-bold" style={{ color: COLORS.green }}>{prom.jobsCompletedTotal || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* API Usage Table */}
      {topRoutes.length > 0 && (
        <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <SectionHeader icon={Activity} title="API Endpoint Usage (since server start)" color={COLORS.blue} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-tertiary)' }}>
                  <th className="pb-2 font-medium">Endpoint</th>
                  <th className="pb-2 font-medium text-right">Requests</th>
                  <th className="pb-2 font-medium text-right">Errors</th>
                  <th className="pb-2 font-medium text-right">Error Rate</th>
                </tr>
              </thead>
              <tbody>
                {topRoutes.map((r, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="py-2 font-mono text-xs text-white">{r.route}</td>
                    <td className="py-2 text-right text-white">{r.requests?.toLocaleString()}</td>
                    <td className="py-2 text-right" style={{ color: r.errors > 0 ? COLORS.red : 'var(--text-tertiary)' }}>{r.errors}</td>
                    <td className="py-2 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.errorRate > 10 ? 'text-red-400' : r.errorRate > 0 ? 'text-amber-400' : 'text-gray-500'}`}
                        style={{ backgroundColor: r.errorRate > 10 ? COLORS.redDim : r.errorRate > 0 ? COLORS.amberDim : 'transparent' }}>
                        {r.errorRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Admin Actions */}
      {(data?.adminActions || []).length > 0 && (
        <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <SectionHeader icon={Clock} title="Recent Admin Actions" color={COLORS.amber} />
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {data.adminActions.map((action, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-t first:border-t-0" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: COLORS.amber }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">
                    <span className="font-medium">{action.action}</span>
                    {action.value != null && <span className="text-gray-400"> ({action.value})</span>}
                  </p>
                  <p className="text-xs text-gray-500">{action.reason}</p>
                  <p className="text-xs text-gray-600">{new Date(action.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
