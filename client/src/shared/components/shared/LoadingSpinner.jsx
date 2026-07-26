import './LoadingSpinner.css';

const SIZES = new Set(['sm', 'md', 'lg']);

export default function LoadingSpinner({ size = 'md', className = '' }) {
  const resolvedSize = SIZES.has(size) ? size : 'md';
  const rootClass = ['ph-spinner', `ph-spinner--${resolvedSize}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass} role="status" aria-live="polite" aria-label="Loading">
      <div className="ph-spinner__ring" aria-hidden="true" />
    </div>
  );
}
