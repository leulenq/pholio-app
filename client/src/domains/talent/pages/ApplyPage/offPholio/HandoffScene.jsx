import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Package } from 'lucide-react';
import PholioButton from '../../../../../shared/components/ui/PholioButton';
import { outboundLabel } from './offPholioIntake';
import './handoff.css';

function externalLinkProps(href) {
  return /^https?:\/\//i.test(String(href || ''))
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};
}

function dateLabel(value = new Date()) {
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * How to actually send it, in the order it happens.
 *
 * A real sequence, so it is numbered; the steps differ by channel because an
 * emailed application and an upload form are not the same errand.
 */
function sendingSteps(route) {
  const name = route?.agencyName || 'the agency';
  if (route?.channelType === 'official_email') {
    return [
      `Open EMAIL.txt — it is addressed to ${name} and written for you to edit.`,
      'Attach the numbered images from the archive.',
      'Send it from your own address, so their reply reaches you.',
    ];
  }
  if (route?.channelType === 'official_walk_in') {
    return [
      `${name} sees people in person — check their open-call window before you go.`,
      'Bring the images printed, or loaded on a phone you can hand over.',
      'Take your stats block with you; they will ask.',
    ];
  }
  return [
    `Open ${name}’s application page.`,
    'Upload the images in the order they are numbered — that order is theirs, not ours.',
    'Paste the stats block from STATS.txt into their form fields.',
  ];
}

/**
 * The handover.
 *
 * The counterpart to `ApplySuccess`, and deliberately built from the same
 * parts: portaled takeover, cream ground with a gold wash, staggered spring,
 * mono receipts, a "what you keep" block. Every one of those is doing the same
 * job here as it does there.
 *
 * What it must not borrow is the claim. Nothing has been submitted — the seal
 * is an archive, not a check; the title never says sent; and the receipt line,
 * which reads "Under review" on a Pholio submission, reads the truth here. That
 * mirroring is the point: the same moment, told honestly.
 */
export default function HandoffScene({
  route,
  firstName,
  exportState,
  frameCount = 0,
  logSubmission,
  onOutboundClick,
  onExit,
  onBack,
  portfolioSlug = null,
}) {
  const reduce = useReducedMotion();
  const [dismissedLog, setDismissedLog] = useState(false);
  const agencyName = route?.agencyName || 'this agency';
  const destination = route?.sourceUrl || null;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const container = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduce ? 0 : 0.08,
        delayChildren: reduce ? 0 : 0.12,
      },
    },
  };
  const item = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.3 } } }
    : {
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 58, damping: 16 } },
      };

  const steps = sendingSteps(route);
  const imageCount = exportState?.imageCount ?? frameCount;

  return createPortal(
    <div className="apply-handoff" role="status" aria-live="polite">
      <motion.div
        className="apply-handoff__inner"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.span className="apply-handoff__brand" variants={item}>
          <span className="apply-handoff__pholio">PHOLIO</span>
          <span className="apply-handoff__brand-div" aria-hidden />
          <span className="apply-handoff__brand-sub">Archive prepared</span>
        </motion.span>

        {/* Not a checkmark. Something was produced, not delivered. */}
        <motion.span className="apply-handoff__seal" variants={item} aria-hidden>
          <Package size={22} strokeWidth={1.5} />
        </motion.span>

        <motion.h1 className="apply-handoff__title" variants={item}>
          It’s yours{firstName ? `, ${firstName}` : ''}.
        </motion.h1>
        <motion.p className="apply-handoff__lede" variants={item}>
          {imageCount > 0 ? `${imageCount} ${imageCount === 1 ? 'image' : 'images'}, prepared to ` : 'Prepared to '}
          <em>{agencyName}</em>’s published requirements.
        </motion.p>
        <motion.p className="apply-handoff__receipt" variants={item}>
          <span>{dateLabel()}</span>
          <span aria-hidden>·</span>
          {/* Where a Pholio submission reads "Under review". It is the one
              thing on this screen a talent could get wrong, so it carries
              weight and colour rather than sitting at metadata grey. */}
          <strong className="apply-handoff__status">Not sent yet</strong>
        </motion.p>
        {exportState?.filename ? (
          <motion.p
            className="apply-handoff__receipt apply-handoff__receipt--file"
            variants={item}
          >
            {exportState.filename}
            {exportState.fileCount ? ` · ${exportState.fileCount} files` : ''}
          </motion.p>
        ) : null}

        <motion.div className="apply-handoff__guidance" variants={item}>
          <span className="apply-handoff__label">How to send it</span>
          <ol className="apply-handoff__steps">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {destination ? (
            <a
              className="apply-handoff__outbound"
              href={destination}
              {...externalLinkProps(destination)}
              onClick={onOutboundClick}
            >
              {outboundLabel(route)} <ArrowUpRight size={14} aria-hidden />
            </a>
          ) : (
            <p className="apply-handoff__problem">
              Pholio holds no published submission link for this route — find their
              submissions page before sending.
            </p>
          )}
        </motion.div>

        {/* The payoff. A cold submission is a lottery; the set is not — it exists
            whether or not this agency ever answers, and it can be sent again
            tomorrow to the next one. */}
        <motion.div className="apply-handoff__keep" variants={item}>
          <span className="apply-handoff__label">What you keep</span>
          <ul className="apply-handoff__keep-list">
            <li>This archive, on your own machine, for as long as you want it.</li>
            <li>
              Your digitals set{imageCount > 0 ? ` — ${imageCount} frames` : ''}, ready to
              prepare again for the next house in a click.
            </li>
            <li>A comp card, downloadable as a PDF from your media page.</li>
          </ul>
          <div className="apply-handoff__keep-links">
            <a href="/dashboard/talent/media">Download comp card</a>
            {portfolioSlug ? (
              <a href={`/portfolio/${portfolioSlug}`} target="_blank" rel="noreferrer">
                View portfolio link
              </a>
            ) : null}
          </div>
        </motion.div>

        {/* The one thing Pholio cannot see. Asked here because this is the
            moment it becomes a real question — and answerable with "not yet"
            without deciding anything. */}
        {!dismissedLog ? (
          <motion.div className="apply-handoff__log" variants={item}>
            {logSubmission?.isSuccess ? (
              <p className="apply-handoff__log-line">
                Logged — it is in your submission history now.
              </p>
            ) : (
              <>
                <p className="apply-handoff__log-line">Once you’ve sent it, put it on record.</p>
                <button
                  type="button"
                  className="apply-handoff__log-action"
                  disabled={logSubmission?.isPending}
                  onClick={() => logSubmission?.mutate()}
                >
                  {logSubmission?.isPending ? 'Logging…' : 'I’ve sent it'}
                </button>
                <button
                  type="button"
                  className="apply-handoff__log-dismiss"
                  onClick={() => setDismissedLog(true)}
                >
                  Not yet
                </button>
              </>
            )}
            {logSubmission?.isError ? (
              <p className="apply-handoff__log-problem" role="alert">
                That couldn’t be logged. Your archive is unaffected.
              </p>
            ) : null}
          </motion.div>
        ) : null}

        <motion.div className="apply-handoff__actions" variants={item}>
          <PholioButton
            type="button"
            variant="primary"
            className="apply-handoff__action"
            onClick={onExit}
          >
            Back to the market <ArrowUpRight size={15} aria-hidden />
          </PholioButton>
          <button type="button" className="apply-handoff__back" onClick={onBack}>
            Change the set
          </button>
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  );
}
