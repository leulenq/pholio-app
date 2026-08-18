import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import PholioButton from '../../../shared/components/ui/PholioButton';
import { isEventCastingCallKind } from '../../../shared/constants/eventCasting';
import './OpenCallArrivalPage.css';

/*
 * Agency open call arrival — the velvet-rope handoff from an agency's own
 * website or campaign into Pholio. The visitor was invited by the agency;
 * this screen confirms the invitation, states the allowance honestly, and
 * hands them into the standard submission flow. It collects nothing.
 *
 * An event cast arrives here too, and it has to say more before anyone spends
 * an evening on a submission: what the event is, when it runs, what it pays,
 * and — loudly, per ruling R8 — that it is 18 and over. The monthly-allowance
 * reassurance is representation-only and is not shown for an event; there is
 * no allowance in play and saying otherwise would answer a question nobody
 * asked while dodging the one they did.
 */

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

function formatDeadline(iso) {
  if (!iso) return 'a date the agency has not published';
  // Parsed as UTC so a published date never slips a day in a western timezone.
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatEventDates(event) {
  if (!event?.startsOn) return null;
  const start = formatDeadline(event.startsOn);
  if (!event.endsOn || event.endsOn === event.startsOn) return start;
  return `${start} – ${formatDeadline(event.endsOn)}`;
}

const COMPENSATION_LABELS = {
  paid: 'PAID',
  unpaid: 'UNPAID',
  stipend: 'A STIPEND',
};

/*
 * The compensation sentence, worded exactly as it is worded in the consent the
 * applicant signs at submit. Two different renderings of the same fact is how
 * "I thought it was paid" happens.
 */
function compensationLine(organizerName, compensation) {
  const label = COMPENSATION_LABELS[String(compensation?.type || '').toLowerCase()];
  if (!label) return null;
  const details = String(compensation.details || '').trim();
  return `${organizerName} states this is ${label}.${details ? ` ${details}` : ''}`;
}

/** What this call asks for beyond a standard Pholio package. */
function intakeLine(intake) {
  const asks = [];
  if (intake?.walkVideo) asks.push('a link to a walk video');
  if (intake?.availability) asks.push('your availability for the event dates');
  if (intake?.measurements) asks.push('confirmed measurements');
  if (!asks.length) return null;
  const listed =
    asks.length === 1
      ? asks[0]
      : `${asks.slice(0, -1).join(', ')} and ${asks[asks.length - 1]}`;
  return `Alongside your digitals and stats, this call asks for ${listed}.`;
}

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
        // A closed call mints nothing, so do not even ask. The server refuses
        // too; this keeps the page from recording an arrival into a call the
        // agency has finished reading.
        if (!arrivalSent.current && !data.alreadyApplied && !data.closed) {
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
            <PholioButton variant="primary" onClick={() => navigate('/login')}>
              Continue to Pholio
            </PholioButton>
          </motion.div>
        </main>
      </div>
    );
  }

  const {
    agency,
    alreadyApplied,
    authenticated,
    brief,
    closed,
    callKind,
    event,
    compensation,
    intake,
  } = state.data;
  const name = agency.name || 'The agency';
  const isEvent = isEventCastingCallKind(callKind);
  const eventName = (event?.name || '').trim();
  const eventDates = formatEventDates(event);
  const eventWhere = [eventDates, event?.location].filter(Boolean).join(' · ');

  // What the agency published about its own call, in its own words. Only shown
  // when it actually wrote one — links predate the brief, and inventing
  // reassuring filler on their behalf would be worse than the generic steps.
  //
  // An event cast interleaves three sections the agency did not type but the
  // organizer did answer: when it runs, what it pays, and what the intake asks
  // for on top of the standard package.
  const briefSections = brief
    ? [
        ['Who this is for', brief.who],
        ...(isEvent
          ? [
              ['Dates', eventWhere],
              ['Compensation', compensationLine(name, compensation)],
            ]
          : []),
        ['What to send', brief.what],
        ...(isEvent ? [['What we need', intakeLine(intake)]] : []),
        ['Eligibility', brief.eligibility],
        ['What happens next', brief.nextSteps],
      ].filter(([, body]) => Boolean(body))
    : [];

  const closingLine = !brief
    ? null
    : brief.ongoing
      ? 'This call runs continuously.'
      : isEvent
        ? `Applications close ${formatDeadline(brief.deadline)}.`
        : `Closes ${formatDeadline(brief.deadline)}.`;

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

  if (closed) {
    return (
      <div className="opencall">
        <div className="opencall__glow" aria-hidden />
        <main className="opencall__stage" aria-label={`${name} open call closed`}>
          <motion.h1 className="opencall__headline" {...enter(0.1)}>
            {isEvent && eventName
              ? `Applications for ${eventName} have closed.`
              : `${name}'s open call has closed.`}
          </motion.h1>
          <motion.p className="opencall__support" {...enter(0.25)}>
            {brief?.deadline
              ? `It closed on ${formatDeadline(brief.deadline)}. `
              : ''}
            You can still build your book on Pholio and submit to agencies that
            are open now.
          </motion.p>
          <motion.div {...enter(0.4)}>
            <PholioButton variant="primary" onClick={() => navigate('/login')}>
              Continue to Pholio
            </PholioButton>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="opencall">
      <motion.div
        className="opencall__glow"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0.3 : 1.1 }}
      />
      <main
        className="opencall__stage"
        aria-label={isEvent && eventName ? `${name} casting for ${eventName}` : `${name} open call`}
      >
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
              {isEvent && eventName
                ? `Your submission for ${eventName} is already in.`
                : `Your submission to ${name} is already in.`}
            </motion.h1>
            <motion.p className="opencall__support" {...enter(0.55)}>
              {name} has your package. You can follow its status, message the
              {isEvent ? ' organizer' : ' agency'}, or keep building your book
              from your dashboard.
            </motion.p>
            <motion.div {...enter(0.7)}>
              <PholioButton variant="primary" onClick={handleBegin}>
                View your submission <ArrowUpRight size={14} aria-hidden />
              </PholioButton>
            </motion.div>
          </>
        ) : (
          <>
            <motion.h1 className="opencall__headline" {...enter(0.4)}>
              {isEvent
                ? eventName
                  ? `${name} is casting for ${eventName}.`
                  : `${name} is casting.`
                : `${name} invited you to submit.`}
            </motion.h1>
            <motion.p className="opencall__support" {...enter(0.55)}>
              {isEvent ? (
                <>
                  You&apos;re applying through Pholio — build your submission with
                  digitals, stats, and a comp card, and send it straight to the
                  casting team. If you&apos;re shortlisted, the designers working
                  the event see your digitals, stats, availability and walk video
                  through a read-only link. They never see your contact details.
                </>
              ) : (
                <>
                  You&apos;re joining {name}&apos;s open call through Pholio — build
                  your submission with digitals, stats, and a comp card, and send it
                  straight to their team.
                </>
              )}
            </motion.p>
            {isEvent ? (
              // Ruling R8. Not a badge, not a footnote — the one hard eligibility
              // rule on the page, said in plain words before anyone starts.
              <motion.p className="opencall__agegate" {...enter(0.68)}>
                You must be 18 or older to apply.
              </motion.p>
            ) : (
              <motion.p className="opencall__allowance" {...enter(0.68)}>
                Invited submissions to {name} don&apos;t use your monthly Pholio
                allowance.
              </motion.p>
            )}
            {briefSections.length > 0 ? (
              <motion.dl
                className="opencall__brief"
                aria-label={`What ${name} is asking for`}
                {...enter(0.8)}
              >
                {briefSections.map(([label, body]) => (
                  <div className="opencall__brief-row" key={label}>
                    <dt className="opencall__brief-label">{label}</dt>
                    <dd className="opencall__brief-body">{body}</dd>
                  </div>
                ))}
              </motion.dl>
            ) : (
              <motion.ol
                className="opencall__steps"
                aria-label="What happens next"
                {...enter(0.8)}
              >
                <li>
                  <span className="opencall__step-num">01</span>
                  <span className="opencall__step-text">
                    Prepare your digitals — current, unretouched, head to toe.
                  </span>
                </li>
                <li>
                  <span className="opencall__step-num">02</span>
                  <span className="opencall__step-text">
                    Review your package — stats, book, and comp card.
                  </span>
                </li>
                <li>
                  <span className="opencall__step-num">03</span>
                  <span className="opencall__step-text">
                    {name} reviews your submission directly.
                  </span>
                </li>
              </motion.ol>
            )}
            {closingLine && (
              <motion.p className="opencall__closing" {...enter(0.88)}>
                {closingLine}
              </motion.p>
            )}
            <motion.div {...enter(0.95)}>
              <PholioButton variant="primary" onClick={handleBegin}>
                {isEvent ? 'Apply for this event' : 'Begin your submission'}{' '}
                <ArrowUpRight size={14} aria-hidden />
              </PholioButton>
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
