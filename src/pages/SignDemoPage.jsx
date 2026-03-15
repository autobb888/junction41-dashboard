import StreetSignLogo from '../components/StreetSignLogo';

const variants = [
  {
    id: 'A',
    name: 'Circuit Trace',
    desc: 'Animated light segments travel the border. Clean and techy.',
    features: { circuitTrace: true, perimeterPulse: false, breathingGlow: false },
  },
  {
    id: 'B',
    name: 'Perimeter Pulse',
    desc: 'A bright spot orbits the sign edge. The post\'s data pulse, moved to the border.',
    features: { circuitTrace: false, perimeterPulse: true, breathingGlow: false },
  },
  {
    id: 'C',
    name: 'Breathing Glow',
    desc: 'The whole border glow pulses gently. Minimal, atmospheric.',
    features: { circuitTrace: false, perimeterPulse: false, breathingGlow: true },
  },
  {
    id: 'D',
    name: 'Circuit + Perimeter',
    desc: 'Circuit trace segments plus the orbiting bright spot. Maximum Tron.',
    features: { circuitTrace: true, perimeterPulse: true, breathingGlow: false },
  },
  {
    id: 'E',
    name: 'Circuit + Breathing',
    desc: 'Circuit trace with a slow breathing glow underneath. Layered depth.',
    features: { circuitTrace: true, perimeterPulse: false, breathingGlow: true },
  },
  {
    id: 'F',
    name: 'All Three',
    desc: 'Everything combined. Circuit trace, orbiting pulse, breathing glow.',
    features: { circuitTrace: true, perimeterPulse: true, breathingGlow: true },
  },
];

export default function SignDemoPage() {
  return (
    <div style={{ background: '#060816', minHeight: '100vh', padding: '48px 24px' }}>
      <h1
        style={{
          fontFamily: "'Syne', sans-serif",
          color: '#F0F2F5',
          fontSize: '28px',
          textAlign: 'center',
          marginBottom: '8px',
        }}
      >
        Sign Border Variants
      </h1>
      <p style={{ color: '#64748B', textAlign: 'center', marginBottom: '48px', fontSize: '14px' }}>
        No post. No rotation. Pick your border treatment.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '40px',
          maxWidth: '1100px',
          margin: '0 auto',
        }}
      >
        {variants.map((v) => (
          <div
            key={v.id}
            style={{
              background: '#0C0F1A',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            {/* Label */}
            <div style={{ textAlign: 'center' }}>
              <span
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 700,
                  fontSize: '20px',
                  color: '#34D399',
                }}
              >
                {v.id}
              </span>
              <span
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 600,
                  fontSize: '16px',
                  color: '#F0F2F5',
                  marginLeft: '10px',
                }}
              >
                {v.name}
              </span>
            </div>

            {/* Hero size */}
            <div style={{ padding: '24px 0' }}>
              <StreetSignLogo size="lg" variant={v.features} />
            </div>

            {/* Small sizes row */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <StreetSignLogo size="sm" variant={v.features} />
              <StreetSignLogo size="md" variant={v.features} />
            </div>

            {/* Description */}
            <p style={{ color: '#94A3B8', fontSize: '13px', textAlign: 'center', margin: 0 }}>
              {v.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
