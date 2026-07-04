import { motion, useReducedMotion } from 'framer-motion';
import PholioBillingWordmark from './PholioBillingWordmark';
import './CheckoutHandoff.css';

const EASE = [0.22, 1, 0.36, 1];

/**
 * Full-screen branded interstitial shown while redirecting to Stripe Checkout.
 * Makes the handoff feel intentional rather than an abrupt leave.
 */
export default function CheckoutHandoff({ open, planLabel = 'Studio+' }) {
  const reduceMotion = useReducedMotion();

  if (!open) return null;

  return (
    <div className="ph-checkout-handoff" role="status" aria-live="polite" aria-busy="true">
      <div className="ph-checkout-handoff__glow" aria-hidden="true" />
      <motion.div
        className="ph-checkout-handoff__inner"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <PholioBillingWordmark variant="on-ink" size="lg" />
        <p className="ph-checkout-handoff__plan">{planLabel}</p>
        <h2 className="ph-checkout-handoff__title">Taking you to secure checkout</h2>
        <p className="ph-checkout-handoff__copy">
          Your trial and billing details are completed on our encrypted payment partner.
          You&apos;ll return here when you&apos;re done.
        </p>
        <div className="ph-checkout-handoff__progress" aria-hidden="true">
          <motion.span
            className="ph-checkout-handoff__progress-bar"
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.1, ease: EASE }}
          />
        </div>
      </motion.div>
    </div>
  );
}
