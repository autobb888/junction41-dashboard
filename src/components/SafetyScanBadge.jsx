import { ShieldCheck, ShieldAlert } from 'lucide-react';

export default function SafetyScanBadge({ score, warning }) {
  if (score == null) return null;

  // A message rendered in the thread was ALLOWED through — the block tier is
  // rejected server-side (422) and never shown. So only a genuine block-tier
  // score wears the alert shield; a moderate-but-delivered score stays green,
  // so the badge never implies a message was blocked when it sailed through.
  const isWarning = warning || score >= 0.7;

  return (
    <span
      title={`Safety score: ${score.toFixed(2)}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        fontSize: 10, cursor: 'default',
        color: isWarning ? '#fbbf24' : '#34d399',
      }}
    >
      {isWarning ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
    </span>
  );
}
