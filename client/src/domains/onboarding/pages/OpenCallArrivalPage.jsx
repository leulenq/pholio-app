import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import './OpenCallArrivalPage.css';

/*
 * Agency open call arrival — the velvet-rope handoff from an agency's own
 * website or campaign into Pholio. The visitor was invited by the agency;
 * this screen confirms the invitation, states the allowance honestly, and
 * hands them into the standard submission flow. It collects nothing.
 */

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

function agencyInitial(name) {
  return String(name || 'A').trim().charAt(0).toUpperCase() || 'A';
}

async function fetchOpenCall(code) {
  const res = await fetch(`/api/public/open-call/${encodeURIComponent(code)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('open_call_unavailable');
  const body = await res.json();
  return body?.data || { valid: false };
}

async function recordArrival(code) {
  const res = await fetch(
    `/api/public/open-call/${encodeURIComponent(code)}/arrival`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({}),
    },
  );
  if (!res.ok) return null;
  const body = await res.json();
  return body?.data || null;
}

export default function OpenCallArrivalPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState({ phase: 'loading', data: null });
  const arrivalSent = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchOpenCall(code);
        if (cancelled) return;
        if (!data.valid || !data.agency) {
          setState({ phase: 'invalid', data: null });
          return;
        }
        setState({ phase: 'ready', data });
        // The arrival beacon parks the invitation server-side (session for
        // anonymous visitors, a claim for signed-in talent). Fire once —
        // StrictMode double-mount guarded by the ref.
        if (!arrivalSent.current && !data.alreadyApplied) {
          arrivalSent.current = true;
          recordArrival(code);
        }
      } catch {
        if (!cancelled) setState({ phase: 'invalid', data: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const enter = (delay) =>
    reduceMotion
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration: 0.3, delay: Math.min(delay, 0.2) },
        }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { ...SPRING, delay },
        };

  if (state.phase === 'loading') {
    return (
      <div className="opencall" aria-busy="true">
        <div className="opencall__glow" aria-hidden />
      </div>
    );
  }

  if (state.phase === 'invalid') {
    return (
      <div className="opencall">
        <div className="opencall__glow" aria-hidden />
        <main className="opencall__stage" aria-label="Open call unavailable">
          <motion.h1 className="opencall__headline" {...enter(0.1)}>
            This open call isn&apos;t available right now.
          </motion.h1>
          <motion.p className="opencall__support" {...enter(0.25)}>
            The link may have been paused by the agency. You can still build
            your portfolio and submit to agencies on Pholio.
          </motion.p>
          <motion.div {...enter(0.4)}>
            <button
              type="button"
              className="opencall__cta"
              onClick={() => navigate('/login')}
            >
              Continue to Pholio
            </button>
          </motion.div>
        </main>
      </div>
    );
  }

  const { agency, alreadyApplied, authenticated } = state.data;
  const name = agency.name || 'The agency';

  const handleBegin = () => {
    if (alreadyApplied) {
      navigate('/dashboard/talent/applications');
      return;
    }
    if (authenticated) {
      navigate(
        `/dashboard/talent/applications/apply?agency=${encodeURIComponent(agency.id)}`,
      );
      return;
    }
    navigate('/login');
  };

  return (
    <div className="opencall">
      <motion.div
        className="opencall__glow"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0.3 : 1.1 }}
      />
      <main className="opencall__stage" aria-label={`${name} open call`}>
        <motion.div
          className="opencall__mark"
          {...(reduceMotion
            ? {
                initial: { opacity: 0 },
                animate: { opacity: 1 },
                transition: { duration: 0.3 },
              }
            : {
                initial: { opacity: 0, scale: 0.92 },
                animate: { opacity: 1, scale: 1 },
                transition: { ...SPRING, delay: 0.15 },
              })}
        >
          {agency.logo ? (
            <img src={agency.logo} alt="" className="opencall__logo" />
          ) : (
            <span className="opencall__monogram" aria-hidden>
              {agencyInitial(name)}
            </span>
          )}
          <span className="opencall__agency-name">{name}</span>
          {agency.location && (
            <span className="opencall__agency-loc">{agency.location}</span>
          )}
        </motion.div>

        {alreadyApplied ? (
          <>
            <motion.h1 className="opencall__headline" {...enter(0.4)}>
              Your submission to {name} is already in.
            </motion.h1>
            <motion.p className="opencall__support" {...enter(0.55)}>
              {name} has your package. You can follow its status, message the
              agency, or keep building your book from your dashboard.
            </motion.p>
            <motion.div {...enter(0.7)}>
              <button type="button" className="opencall__cta" onClick={handleBegin}>
                View your submission
              </button>
            </motion.div>
          </>
        ) : (
          <>
            <motion.h1 className="opencall__headline" {...enter(0.4)}>
              {name} invited you to submit.
            </motion.h1>
            <motion.p className="opencall__support" {...enter(0.55)}>
              You&apos;re joining {name}&apos;s open call through Pholio — build
              your submission with digitals, stats, and a comp card, and send it
              straight to their team.
            </motion.p>
            <motion.p className="opencall__allowance" {...enter(0.68)}>
              Invited submissions to {name} don&apos;t use your monthly Pholio
              allowance.
            </motion.p>
            <motion.ol
              className="opencall__steps"
              aria-label="What happens next"
              {...enter(0.8)}
            >
              <li>
                <span className="opencall__step-num">01</span>
                Prepare your digitals — current, unretouched, head to toe.
              </li>
              <li>
                <span className="opencall__step-num">02</span>
                Review your package — stats, book, and comp card.
              </li>
              <li>
                <span className="opencall__step-num">03</span>
                {name} reviews your submission directly.
              </li>
            </motion.ol>
            <motion.div {...enter(0.95)}>
              <button type="button" className="opencall__cta" onClick={handleBegin}>
                Begin your submission
              </button>
              {!authenticated && (
                <p className="opencall__signin-note">
                  You&apos;ll create a free Pholio account first — your
                  invitation carries over.
                </p>
              )}
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}
