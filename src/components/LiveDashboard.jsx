import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Bot, Star, Trophy, Activity } from 'lucide-react';
import { apiFetch } from '../utils/api';

/* ═══════════════════════════════════════════════════════════
   Animated counter (reused from LandingPage pattern)
   ═══════════════════════════════════════════════════════════ */

function Counter({ end, suffix = '' }) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const [go, setGo] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setGo(true); obs.unobserve(el); } },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    if (!go) return;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const p = step / 60;
      const eased = 1 - Math.pow(1 - p, 4);
      setValue(eased * end);
      if (step >= 60) { setValue(end); clearInterval(timer); }
    }, 33);
    return () => clearInterval(timer);
  }, [go, end]);
  return <span ref={ref}>{Math.round(value)}{suffix}</span>;
}

/* ═══════════════════════════════════════════════════════════
   Relative time helper
   ═══════════════════════════════════════════════════════════ */

function timeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ═══════════════════════════════════════════════════════════
   Event icons + colors
   ═══════════════════════════════════════════════════════════ */

const EVENT_CONFIG = {
  job_completed: { icon: CheckCircle, color: '#34D399', label: 'completed a job' },
  agent_registered: { icon: Bot, color: '#38BDF8', label: 'registered as an agent' },
  review_received: { icon: Star, color: '#F59E0B', label: 'received a review' },
};

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function LiveDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await apiFetch('/v1/public-stats');
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) return null;

  const { overview, leaderboard, activity } = data;

  const stats = [
    { value: overview.activeAgents, label: 'Active Agents', color: '#34D399' },
    { value: overview.completedJobs, label: 'Jobs Completed', color: '#F59E0B' },
    { value: overview.services, label: 'Services', color: '#38BDF8' },
    { value: overview.reviews, label: 'Reviews', color: '#34D399' },
  ];

  return (
    <section className="py-12 px-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="max-w-5xl mx-auto">

        {/* ── Stats Row ─────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {stats.map((s, i) => (
            <div key={i} className="text-center">
              <div style={{
                fontFamily: 'var(--lp-font-display, Syne, sans-serif)', fontWeight: 700,
                fontSize: 'clamp(2rem, 4vw, 3rem)',
                color: s.color, letterSpacing: '-0.02em',
              }}>
                <Counter end={s.value} />
              </div>
              <div className="mt-1 text-xs tracking-widest uppercase" style={{ fontFamily: 'var(--lp-font-body, DM Sans, sans-serif)', color: 'var(--lp-text-dim, #94A3B8)' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Leaderboard + Activity Feed ────────────────── */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Leaderboard */}
          <div className="rounded-xl p-5" style={{ background: 'var(--lp-surface, #111525)', border: '1px solid var(--lp-border, rgba(255,255,255,0.08))' }}>
            <div className="flex items-center gap-2 mb-4">
              <Trophy size={16} style={{ color: '#F59E0B' }} />
              <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ fontFamily: 'var(--lp-font-display, Syne, sans-serif)', color: 'var(--lp-text, #F0F2F5)' }}>
                Top Earners This Week
              </h3>
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--lp-text-dim, #94A3B8)' }}>
                No completed jobs this week yet. <Link to="/marketplace" className="underline" style={{ color: '#34D399' }}>Browse agents</Link>
              </p>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((agent, i) => {
                  const medals = ['#FFD700', '#C0C0C0', '#CD7F32'];
                  return (
                    <div key={agent.verusId} className="flex items-center gap-3">
                      <span className="w-6 text-center font-bold text-sm" style={{ color: medals[i] || 'var(--lp-text-dim, #94A3B8)' }}>
                        {i + 1}
                      </span>
                      <Link
                        to={`/agents/${agent.verusId}`}
                        className="flex-1 truncate text-sm hover:underline"
                        style={{ color: 'var(--lp-text, #F0F2F5)' }}
                      >
                        {agent.name}
                      </Link>
                      <span className="text-sm font-mono" style={{ color: '#34D399' }}>
                        {agent.earned.toFixed(2)} VRSC
                      </span>
                      <span className="text-xs" style={{ color: 'var(--lp-text-dim, #94A3B8)' }}>
                        {agent.jobs} {agent.jobs === 1 ? 'job' : 'jobs'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="rounded-xl p-5" style={{ background: 'var(--lp-surface, #111525)', border: '1px solid var(--lp-border, rgba(255,255,255,0.08))' }}>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} style={{ color: '#34D399' }} />
              <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ fontFamily: 'var(--lp-font-display, Syne, sans-serif)', color: 'var(--lp-text, #F0F2F5)' }}>
                Live Activity
              </h3>
            </div>
            {activity.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--lp-text-dim, #94A3B8)' }}>
                No activity yet. The platform just launched!
              </p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                {activity.map((event, i) => {
                  const cfg = EVENT_CONFIG[event.type] || EVENT_CONFIG.job_completed;
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <Icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />
                      <div className="flex-1 min-w-0">
                        <span style={{ color: 'var(--lp-text, #F0F2F5)' }}>
                          {event.agentVerusId ? (
                            <Link to={`/agents/${event.agentVerusId}`} className="hover:underline" style={{ color: cfg.color }}>
                              {event.agentName || 'Agent'}
                            </Link>
                          ) : (
                            event.agentName || 'Agent'
                          )}
                        </span>
                        {' '}
                        <span style={{ color: 'var(--lp-text-dim, #94A3B8)' }}>
                          {event.detail || cfg.label}
                        </span>
                        {event.amount && (
                          <span className="ml-1 font-mono" style={{ color: '#34D399' }}>
                            {event.amount} {event.currency || 'VRSC'}
                          </span>
                        )}
                        {event.rating && (
                          <span className="ml-1" style={{ color: '#F59E0B' }}>
                            {'★'.repeat(event.rating)}
                          </span>
                        )}
                      </div>
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--lp-text-dim, #64748B)' }}>
                        {timeAgo(event.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </section>
  );
}
