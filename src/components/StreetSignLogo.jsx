/**
 * Tron-style digital road sign logo — glowing emerald edges, circuit borders,
 * pulsing corner nodes, scan line. Multiple border variant modes.
 *
 * Sizes: 'xs' (inline text), 'sm' (header), 'md', 'lg', 'xl', 'hero'.
 * Pass `showPost` to render a data-line post underneath.
 * Pass `variant` object to control border effects:
 *   { circuitTrace, perimeterPulse, breathingGlow }
 */
export default function StreetSignLogo({ size = 'sm', className = '', showPost = false, style = {}, variant }) {
  const config = {
    xs:   { font: '7px',  px: '6px',  py: '2px',  radius: '2px',  tracking: '0.14em', node: 3,  glowSpread: 8,   postW: 2,  postH: 16 },
    sm:   { font: '10px', px: '10px', py: '3px',  radius: '3px',  tracking: '0.15em', node: 4,  glowSpread: 12,  postW: 2,  postH: 24 },
    md:   { font: '14px', px: '16px', py: '5px',  radius: '4px',  tracking: '0.15em', node: 5,  glowSpread: 20,  postW: 3,  postH: 36 },
    lg:   { font: '22px', px: '28px', py: '8px',  radius: '5px',  tracking: '0.16em', node: 6,  glowSpread: 28,  postW: 4,  postH: 160 },
    xl:   { font: '32px', px: '42px', py: '12px', radius: '6px',  tracking: '0.16em', node: 7,  glowSpread: 35,  postW: 4,  postH: 220 },
    hero: { font: '72px', px: '80px', py: '28px', radius: '10px', tracking: '0.16em', node: 8,  glowSpread: 40,  postW: 4,  postH: 400 },
  };
  const s = config[size] || config.sm;

  // Default: all effects on when no variant specified
  const fx = variant || { circuitTrace: true, perimeterPulse: false, breathingGlow: false };

  const cornerPositions = [
    { top: -s.node / 2, left: -s.node / 2 },
    { top: -s.node / 2, right: -s.node / 2 },
    { bottom: -s.node / 2, left: -s.node / 2 },
    { bottom: -s.node / 2, right: -s.node / 2 },
  ];

  // Static glow (used when breathing is off)
  const staticGlow = `inset 0 0 1px rgba(52,211,153,0.6), 0 0 1px #34D399, 0 0 ${s.glowSpread}px rgba(52,211,153,0.3), 0 0 ${s.glowSpread * 2.5}px rgba(52,211,153,0.1)`;

  return (
    <div className={`inline-flex flex-col items-center ${className}`} style={style}>
      {/* Sign panel */}
      <div
        style={{
          background: 'rgba(0, 6, 20, 0.85)',
          borderRadius: s.radius,
          boxShadow: fx.breathingGlow ? undefined : staticGlow,
          animation: fx.breathingGlow ? 'breathingGlow 3s ease-in-out infinite' : undefined,
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Circuit trace overlay */}
        {fx.circuitTrace && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: s.radius,
              border: '1px solid transparent',
              background: 'linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.4) 25%, transparent 50%, rgba(52,211,153,0.4) 75%, transparent 100%)',
              backgroundSize: '200% 100%',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
              padding: '1px',
              animation: 'circuitTrace 4s linear infinite',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Perimeter pulse — bright dot orbiting the border */}
        {fx.perimeterPulse && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: s.radius,
              pointerEvents: 'none',
              overflow: 'visible',
              zIndex: 4,
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: `${Math.max(s.node * 2, 8)}px`,
                height: `${Math.max(s.node * 2, 8)}px`,
                borderRadius: '50%',
                background: 'radial-gradient(circle, #34D399 0%, rgba(52,211,153,0.6) 40%, transparent 70%)',
                boxShadow: '0 0 12px #34D399, 0 0 24px rgba(52,211,153,0.4)',
                /* CSS offset-path to orbit the sign rectangle */
                offsetPath: `inset(0 round ${s.radius})`,
                animation: 'perimeterPulse 3s linear infinite',
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        )}

        {/* Inner frame */}
        <div
          style={{
            border: '1px solid rgba(52,211,153,0.2)',
            borderRadius: `max(1px, calc(${s.radius} - 2px))`,
            padding: `${s.py} ${s.px}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Corner nodes */}
          {cornerPositions.map((pos, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: s.node,
                height: s.node,
                borderRadius: '50%',
                background: '#34D399',
                boxShadow: '0 0 6px #34D399',
                animation: 'cornerPulse 2s ease-in-out infinite',
                animationDelay: `${i * 0.5}s`,
                zIndex: 2,
                ...pos,
              }}
            />
          ))}

          {/* Text */}
          <span
            style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 700,
              color: 'white',
              fontSize: s.font,
              letterSpacing: s.tracking,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              textShadow: '0 0 10px rgba(52,211,153,0.6), 0 0 30px rgba(52,211,153,0.2)',
              position: 'relative',
              zIndex: 1,
            }}
          >
            JUNCTION 41
          </span>
        </div>
      </div>

      {/* Data line post (legacy — kept for backward compat) */}
      {showPost && (
        <div
          style={{
            width: `${s.postW}px`,
            height: `${s.postH}px`,
            background: 'linear-gradient(180deg, #34D399 0%, rgba(52,211,153,0.15) 100%)',
            boxShadow: '0 0 8px rgba(52,211,153,0.3)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              width: `${Math.max(s.postW * 2, 8)}px`,
              height: '12px',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(52,211,153,0.9) 0%, transparent 70%)',
              animation: 'dataPulse 2s linear infinite',
              '--post-h': `${s.postH}px`,
            }}
          />
        </div>
      )}
    </div>
  );
}
