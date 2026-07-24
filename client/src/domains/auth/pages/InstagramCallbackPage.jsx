import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { Loader2, AlertCircle } from 'lucide-react';
import { auth } from '../../../shared/lib/firebase';
import { notifyAuthChange } from '../../../shared/lib/pholio-auth/broadcast';
import { markAuthEntryTransition } from '../../../shared/lib/pholio-auth/entry-transition';

// Same browsewrap payload as LoginPage / CastingEntry — required when Instagram
// provisions a first-time Pholio talent account via login or onboarding entry.
const LEGAL_ACCEPTANCE = { terms_accepted: true, privacy_accepted: true };

async function completeCastingEntry(idToken) {
  const response = await fetch('/onboarding/entry', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ firebase_token: idToken, ...LEGAL_ACCEPTANCE }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Onboarding entry failed');
  }
  return data;
}

async function completeLogin(idToken, nextPath) {
  const response = await fetch('/api/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ firebase_token: idToken, ...LEGAL_ACCEPTANCE }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Login failed');
  }

  notifyAuthChange({ authenticated: true });
  markAuthEntryTransition();
  window.location.href = data.redirect || nextPath || '/dashboard/talent';
}

export default function InstagramCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const params = new URLSearchParams(location.search);
      const urlError = params.get('error');
      if (urlError) {
        if (!cancelled) setError(urlError);
        return;
      }

      try {
        const completeResponse = await fetch('/api/auth/instagram/complete', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const completeData = await completeResponse.json().catch(() => ({}));

        if (!completeResponse.ok || !completeData.custom_token) {
          throw new Error(
            completeData.error || 'Instagram sign-in session expired. Please try again.'
          );
        }

        const userCredential = await signInWithCustomToken(
          auth,
          completeData.custom_token
        );
        const idToken = await userCredential.user.getIdToken(true);
        const flow = completeData.flow || params.get('flow') || 'login';
        const nextPath = completeData.next || params.get('next');

        if (flow === 'signup') {
          await completeCastingEntry(idToken);
          if (!cancelled) {
            navigate('/onboarding', { replace: true });
          }
          return;
        }

        await completeLogin(idToken, nextPath);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Instagram sign-in failed.');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [location.search, navigate]);

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#100F0E',
          color: '#FAF8F5',
        }}
      >
        <div style={{ maxWidth: '420px', textAlign: 'center' }}>
          <AlertCircle size={28} style={{ margin: '0 auto 16px', color: '#E57373' }} />
          <p style={{ marginBottom: '20px', lineHeight: 1.5 }}>{error}</p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            style={{
              background: '#C9A55A',
              color: '#100F0E',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#100F0E',
        color: '#FAF8F5',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Loader2 className="animate-spin" size={22} />
        <span>Finishing Instagram sign-in…</span>
      </div>
    </div>
  );
}
