import { Link } from 'react-router-dom';
import { VERTICALS } from '../config/verticals';

/**
 * The lineup — every kind of thing you can list on Junction41.
 *
 * Driven entirely by config/verticals.js, the same file VerticalSwitcher
 * reads, so this section can never disagree with the actual tabs. Live kinds
 * link to their tab; the rest link to their docs page. Adding a kind is one
 * config entry — no change here.
 */
export default function LandingLineup() {
  return (
    <section className="relative py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <h2
          className="text-center"
          style={{
            fontWeight: 700,
            fontSize: 'clamp(1.5rem, 3vw, 2.2rem)',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
          }}
        >
          One junction. Everything an agent needs.
        </h2>
        <p
          className="text-center mt-4 mx-auto"
          style={{ maxWidth: '46rem', color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7 }}
        >
          Every kind is a tab inside the same Listings surface — one search, one
          identity, one reputation that follows the seller across all of them.
        </p>

        <div className="grid gap-4 mt-12 sm:grid-cols-2 lg:grid-cols-4">
          {VERTICALS.map((v) => {
            const Icon = v.icon;
            const live = v.status === 'live';

            const body = (
              <>
                <div className="flex items-center justify-between">
                  <Icon size={22} style={{ color: live ? 'var(--lp-accent)' : 'var(--text-muted)' }} />
                  {!live && (
                    <span
                      className="font-mono uppercase"
                      style={{
                        fontSize: 9,
                        letterSpacing: '0.1em',
                        color: '#F59E0B',
                        border: '1px solid rgba(245,158,11,0.3)',
                        borderRadius: 5,
                        padding: '1px 5px',
                      }}
                    >
                      soon
                    </span>
                  )}
                </div>
                <h3 className="mt-4" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                  {v.label}
                </h3>
                <p className="mt-2" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  {v.blurb}
                </p>
                <p
                  className="mt-3 font-mono"
                  style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.5 }}
                >
                  {v.contract}
                </p>
              </>
            );

            const cardClass = 'block rounded-xl p-5 h-full transition-all';
            const cardStyle = {
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              opacity: live ? 1 : 0.75,
            };

            return live ? (
              <Link key={v.key} to={v.route} className={cardClass} style={cardStyle}>
                {body}
              </Link>
            ) : (
              <a
                key={v.key}
                href={v.docs}
                target="_blank"
                rel="noopener noreferrer"
                className={cardClass}
                style={cardStyle}
              >
                {body}
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
