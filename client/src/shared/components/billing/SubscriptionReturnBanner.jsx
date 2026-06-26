import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import './SubscriptionReturnBanner.css';

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    title: 'Welcome to Studio+',
    copy: 'Your trial has started. Premium tools unlock as billing syncs — usually within a moment.',
  },
  canceled: {
    icon: XCircle,
    title: 'Checkout paused',
    copy: 'No charge was made. You can start Studio+ whenever you\'re ready.',
  },
  error: {
    icon: AlertCircle,
    title: 'We couldn\'t confirm billing',
    copy: 'Stripe returned without activating your plan. Try again or contact support if this persists.',
  },
  invalid: {
    icon: AlertCircle,
    title: 'Invalid checkout session',
    copy: 'That checkout link has expired. Start Studio+ again from this page.',
  },
  'missing-subscription': {
    icon: AlertCircle,
    title: 'Subscription not found',
    copy: 'Checkout completed but we couldn\'t link a subscription. Contact support with your receipt.',
  },
};

export default function SubscriptionReturnBanner({ state, onDismiss }) {
  if (!state || !VARIANTS[state]) return null;

  const { icon: Icon, title, copy } = VARIANTS[state];

  return (
    <div className={`ph-billing-return ph-billing-return--${state}`} role="status">
      <div className="ph-billing-return__icon" aria-hidden="true">
        <Icon size={20} strokeWidth={1.6} />
      </div>
      <div className="ph-billing-return__body">
        <p className="ph-billing-return__title">{title}</p>
        <p className="ph-billing-return__copy">{copy}</p>
        {state === 'success' && (
          <Link to="/dashboard/talent/overview" className="ph-billing-return__link">
            Go to your overview
          </Link>
        )}
      </div>
      {onDismiss && (
        <button type="button" className="ph-billing-return__dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
