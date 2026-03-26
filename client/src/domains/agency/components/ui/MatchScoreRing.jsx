import { motion } from 'framer-motion';

const SIZES = { sm: 24, md: 36, lg: 56 };
const STROKE = { sm: 2.5, md: 3, lg: 4 };

function scoreColor(score) {
  if (score >= 80) return 'var(--ag-score-high)';
  if (score >= 60) return 'var(--ag-score-mid)';
  return 'var(--ag-score-low)';
}

export default function MatchScoreRing({ score, size = 'sm' }) {
  const dim = SIZES[size];
  const stroke = STROKE[size];
  const r = (dim - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = scoreColor(score);

  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} style={{ flexShrink: 0 }}>
      <circle
        cx={dim / 2} cy={dim / 2} r={r}
        fill="none" stroke="var(--ag-surface-4)" strokeWidth={stroke}
      />
      <motion.circle
        cx={dim / 2} cy={dim / 2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
      />
      {size !== 'sm' && (
        <text
          x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
          fill="var(--ag-text-0)"
          fontSize={dim * 0.32} fontWeight={600} fontFamily="var(--ag-font-body)"
        >
          {score}
        </text>
      )}
    </svg>
  );
}
