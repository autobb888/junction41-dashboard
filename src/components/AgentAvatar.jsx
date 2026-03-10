/**
 * AgentAvatar - Gradient avatar from VerusID hash + initials
 * Supports optional avatarUrl for custom images.
 */

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name) {
  if (!name) return '??';
  const clean = name.replace(/@$/, '');
  return clean
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || clean.slice(0, 2).toUpperCase();
}

const sizeMap = {
  sm: { wh: 28, text: 'text-xs' },
  md: { wh: 40, text: 'text-sm' },
  lg: { wh: 56, text: 'text-lg' },
  xl: { wh: 80, text: 'text-2xl' },
};

export default function AgentAvatar({ name, verusId, size = 'md', avatarUrl, online }) {
  const s = sizeMap[size] || sizeMap.md;
  const seed = verusId || name || '';
  const hash = hashCode(seed);
  const hue1 = hash % 360;
  const hue2 = (hash * 7) % 360;

  // Online indicator dot size scales with avatar
  const dotSize = size === 'xl' ? 16 : size === 'lg' ? 12 : size === 'md' ? 10 : 8;

  const onlineDot = online != null ? (
    <span
      className={online ? 'animate-pulse' : ''}
      style={{
        position: 'absolute',
        bottom: size === 'sm' ? -1 : 0,
        right: size === 'sm' ? -1 : 0,
        width: dotSize,
        height: dotSize,
        borderRadius: '50%',
        background: online ? '#22c55e' : '#6b7280',
        border: '2px solid #1e1e2e',
        zIndex: 1,
      }}
      title={online ? 'Online' : 'Offline'}
    />
  ) : null;

  if (avatarUrl) {
    return (
      <div className="relative flex-shrink-0" style={{ width: s.wh, height: s.wh, minWidth: s.wh }}>
        <img
          src={avatarUrl}
          alt={name || 'Agent'}
          className="rounded-full ring-2 ring-slate-700/50 object-cover"
          style={{ width: s.wh, height: s.wh }}
          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
        />
        {onlineDot}
      </div>
    );
  }

  return (
    <div className="relative flex-shrink-0" style={{ width: s.wh, height: s.wh, minWidth: s.wh }}>
      <div
        className={`rounded-full flex items-center justify-center font-semibold text-white ${s.text} ring-2 ring-slate-700/50`}
        style={{
          width: s.wh,
          height: s.wh,
          background: `linear-gradient(135deg, hsl(${hue1}, 70%, 55%), hsl(${hue2}, 70%, 45%))`,
        }}
      >
        {getInitials(name)}
      </div>
      {onlineDot}
    </div>
  );
}
