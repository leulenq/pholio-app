import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CircleDashed, Loader2, PenLine } from 'lucide-react';
import PholioButton from '../../../../../shared/components/ui/PholioButton';
import { channelSentence } from './offPholioIntake';
import './prepare.css';

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };
const ROMAN = ['I', 'II', 'III', 'IV'];

function frameSrc(image) {
  const value = image?.public_url || image?.path || '';
  if (typeof value !== 'string' || !value.trim()) return '';
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return `/uploads/${trimmed.replace(/^\/+/, '')}`;
}

/** "New York · by email" — where this is going and how it travels. */
function destinationLine(route) {
  const how = {
    official_email: 'by email',
    official_walk_in: 'in person',
    agency_branded_third_party_form: 'on their application form',
  }[route?.channelType] || 'on their site';
  return [route?.marketLabel, how].filter(Boolean).join(' · ');
}

/**
 * The manifest — the archive as a printed document.
 *
 * The on-Pholio review step shows the package exactly as the agency receives
 * it. The off-Pholio equivalent is the archive exactly as it will land on disk,
 * so it uses the same dossier vocabulary: paper card, mono lockup, italic serif
 * kicker, roman-numeral sections. The numbers are earned here — this really is
 * the order of the thing being assembled, not scaffolding.
 */
function Manifest({ route, slots, stats, frameCount, preparing, onModify }) {
  const reduce = useReducedMotion();
  const filled = slots.filter((slot) => slot.image);
  const isEmail = route?.channelType === 'official_email';

  const vitals = [
    stats?.height ? `${stats.height.cm} cm / ${stats.height.sub}` : null,
    ...(stats?.vitals || []).map((part) => `${part.label} ${part.cm}`),
    ...(stats?.secondary || []).slice(0, 2).map((part) => `${part.label} ${part.value}`),
  ].filter(Boolean);

  const sections = [
    {
      key: 'frames',
      title: 'Frames',
      note: frameCount > 0 ? `${frameCount} ${frameCount === 1 ? 'image' : 'images'}` : 'None yet',
      step: 'digitals',
      body:
        filled.length > 0 ? (
          <>
            <ul className="apply-manifest__frames">
              {filled.map((slot) => (
                <li key={slot.key} className="apply-manifest__frame">
                  <img src={frameSrc(slot.image)} alt={slot.label} loading="lazy" />
                  <span>{slot.label}</span>
                </li>
              ))}
            </ul>
            <p className="apply-manifest__note">
              Numbered in the order they publish, converted and resized to their limits.
            </p>
          </>
        ) : (
          <p className="apply-manifest__note">
            Nothing selected yet. Frames you assign on the digitals step land here.
          </p>
        ),
    },
    {
      key: 'stats',
      title: 'Stats',
      note: 'STATS.txt',
      step: 'stats',
      body: vitals.length ? (
        <p className="apply-manifest__vitals">{vitals.join('  ·  ')}</p>
      ) : (
        <p className="apply-manifest__note">
          No measurements on file — the stats block will be left out.
        </p>
      ),
    },
    isEmail && {
      key: 'message',
      title: 'Message',
      note: 'EMAIL.txt',
      body: (
        <p className="apply-manifest__note">
          A draft addressed to {route.agencyName}, with the attachments already sized to
          what their inbox accepts. Yours to edit before you send it.
        </p>
      ),
    },
    {
      key: 'readme',
      title: 'Their terms',
      note: 'README.txt',
      body: (
        <p className="apply-manifest__note">
          {channelSentence(route)}
        </p>
      ),
    },
  ].filter(Boolean);

  return (
    <article className="apply-manifest" data-preparing={preparing ? 'true' : undefined}>
      {/* The sweep is the only motion during assembly: the document is being
          made, and a spinner in the middle of a page is the product-register
          answer to a question nobody asked. */}
      {preparing ? <span className="apply-manifest__sweep" aria-hidden /> : null}

      <header className="apply-manifest__masthead">
        <span className="apply-manifest__lockup">
          <span className="apply-manifest__pholio">PHOLIO</span>
          <span className="apply-manifest__lockup-div" aria-hidden />
          <span className="apply-manifest__lockup-agency">Archive manifest</span>
        </span>
        <p className="apply-manifest__kicker">Prepared for</p>
        <h1 className="apply-manifest__name">{route?.agencyName || 'This agency'}</h1>
        <span className="apply-manifest__rule" aria-hidden />
        <p className="apply-manifest__dest">{destinationLine(route)}</p>
      </header>

      {sections.map((section, index) => (
        <motion.section
          key={section.key}
          className="apply-manifest__sec"
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { ...SPRING, delay: 0.06 * index }}
        >
          <div className="apply-manifest__sec-head">
            <span className="apply-manifest__sec-title">
              {ROMAN[index]} · {section.title}
            </span>
            <span className="apply-manifest__sec-note">{section.note}</span>
            {section.step && onModify ? (
              <PholioButton
                type="button"
                variant="meta"
                className="apply-manifest__modify"
                onClick={() => onModify(section.step)}
              >
                <PenLine size={12} aria-hidden /> Modify
              </PholioButton>
            ) : null}
          </div>
          {section.body}
        </motion.section>
      ))}
    </article>
  );
}

/**
 * The terminal step for an agency Pholio does not deliver to.
 *
 * Structured as the on-Pholio Review & send is — document on the left, rail on
 * the right, the action in the rail's foot — because it is the same beat in the
 * same flow. What it must never borrow is the confirmation: nothing here is
 * submitted, and the rail says so before the button does.
 */
export default function PrepareScene({
  route,
  slots = [],
  stats = null,
  frameCount = 0,
  gaps = [],
  exportState,
  onPrepare,
  onModify,
  onOpenMedia,
  onReviewBrief,
  displayName,
}) {
  const reduce = useReducedMotion();
  const preparing = exportState?.status === 'pending';
  const prepared = exportState?.status === 'done';
  const agencyName = displayName || route?.agencyName || 'this agency';

  return (
    <div className="apply-prepare">
      <Manifest
        route={route}
        slots={slots}
        stats={stats}
        frameCount={frameCount}
        preparing={preparing}
        onModify={onModify}
      />

      <div className="apply-prepare__rail">
        <motion.aside
          className="apply-dispatch"
          aria-label="How this one is sent"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { ...SPRING, delay: 0.1 }}
        >
          {/* The one fact the whole surface exists to make plain, and the
              middle step is the one that differs from a Pholio submission. */}
          <p className="apply-dispatch__flow">
            <span>Pholio</span>
            <span>You</span>
            <span>Them</span>
          </p>

          <p className="apply-dispatch__handling">
            Pholio prepares this one and <strong>hands it to you</strong>. {agencyName} takes
            applications on their own channel, so you send it yourself — and their page stays
            the source of truth for what they want today.
          </p>

          {onReviewBrief ? (
            <PholioButton
              type="button"
              variant="meta"
              className="apply-dispatch__brief-link"
              onClick={onReviewBrief}
            >
              Re-read what {agencyName} asks for
            </PholioButton>
          ) : null}

          {gaps.length > 0 ? (
            <ul className="apply-dispatch__gaps">
              {gaps.map((gap) => (
                <li key={gap.key}>
                  <CircleDashed size={12} aria-hidden />
                  <span>
                    <strong>{gap.label}</strong> {gap.hint}
                  </span>
                  {gap.key === 'digitals' && onOpenMedia ? (
                    <button type="button" onClick={onOpenMedia}>
                      Open the book
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {exportState?.status === 'error' ? (
            <p className="apply-dispatch__problem" role="alert">
              {exportState.message}
            </p>
          ) : null}
        </motion.aside>

        <PholioButton
          type="button"
          variant="primary"
          className="apply-dispatch__cta"
          onClick={onPrepare}
          disabled={preparing}
          data-state={preparing ? 'working' : 'ready'}
        >
          {preparing ? (
            <>
              <Loader2 size={15} className="app-spin" aria-hidden /> Preparing…
            </>
          ) : prepared ? (
            'Prepare it again'
          ) : (
            'Prepare my set'
          )}
        </PholioButton>
      </div>
    </div>
  );
}
