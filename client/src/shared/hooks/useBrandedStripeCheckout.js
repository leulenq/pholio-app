import { useState, useCallback } from 'react';

/**
 * Branded pre-redirect flow: show CheckoutHandoff, then navigate to Stripe Checkout URL.
 */
export function useBrandedStripeCheckout(createSession) {
  const [handoffOpen, setHandoffOpen] = useState(false);

  const redirectToCheckout = useCallback(
    async (payload = {}) => {
      setHandoffOpen(true);
      try {
        const session = await createSession(payload);
        if (session?.url) {
          window.location.href = session.url;
          return session;
        }
        setHandoffOpen(false);
        throw new Error('Stripe checkout did not return a payment link.');
      } catch (error) {
        setHandoffOpen(false);
        throw error;
      }
    },
    [createSession],
  );

  return { handoffOpen, redirectToCheckout };
}
