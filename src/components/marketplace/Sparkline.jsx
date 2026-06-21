// Tiny reputation trend line. Renders null unless given >= 2 numbers.
export default function Sparkline({ data, height = 28 }) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const w = 120, h = height, pad = 3;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const step = w / (data.length - 1);
  const d = data
    .map((v, i) => {
      const x = (i * step).toFixed(1);
      const y = (pad + (h - pad * 2) * (1 - (v - min) / span)).toFixed(1);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
