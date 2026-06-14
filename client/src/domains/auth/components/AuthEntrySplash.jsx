import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import './AuthEntrySplash.css';

const LUX_EASE = [0.33, 0, 0.2, 1];
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/**
 * Post-login branded transition. Minimalist and restrained: a single
 * loading element — the gold sweep line (the one under the Pholio wordmark
 * in the talent shell) translated into a circular spinner that travels the
 * border of the user's profile icon.
 *
 * talent  → ink canvas, profile icon wrapped by the sweep ring
 * agency  → cream canvas, Pholio × agency lockup above the same treatment
 */

function Headline({ words, reduceMotion }) {
  return (
    <h1 className="auth-entry__headline">
      {words.map((word, index) => (
        <motion.span
          key={`${word.text}-${index}`}
          className={`auth-entry__word${word.em ? ' auth-entry__word--em' : ''}`}
          initial={reduceMotion ? false : { opacity: 0, y: 24, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ ...SPRING, delay: 0.2 + index * 0.12 }}
        >
          {word.text}
        </motion.span>
      ))}
    </h1>
  );
}

function ProfileSpinner({ avatarUrl, initials, variant, reduceMotion, delay = 0 }) {
  return (
    <motion.div
      className={`auth-entry__icon auth-entry__icon--${variant}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...SPRING, delay }}
    >
      <motion.div
        className="auth-entry__icon-float"
        animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 5.2, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.8 }
        }
      >
        <span className="auth-entry__icon-ring" aria-hidden="true" />
        <span className="auth-entry__icon-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            <span className="auth-entry__icon-fallback" aria-hidden="true">
              {initials}
            </span>
          )}
        </span>
      </motion.div>
    </motion.div>
  );
}

export default function AuthEntrySplash({
  variant = 'talent',
  startedAt, // eslint-disable-line no-unused-vars -- kept for API compatibility
  avatarUrl,
  avatarInitials,
  talentName,
  agencyName,
  exiting = false,
}) {
  const reduceMotion = useReducedMotion();
  const initials = avatarInitials || '·';
  const hasName = Boolean(talentName && talentName !== 'there');

  const headlineWords =
    variant === 'agency'
      ? [{ text: 'Welcome' }, { text: 'back.' }]
      : [
          { text: 'Welcome' },
          { text: hasName ? 'back,' : 'back.' },
          ...(hasName ? [{ text: `${talentName}.`, em: true }] : []),
        ];

  const lockupEnter = {
    initial: reduceMotion ? false : { opacity: 0, y: 14, filter: 'blur(8px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { ...SPRING, delay: 0.08 },
  };

  return (
    <motion.div
      className={`auth-entry auth-entry--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy={!exiting}
      initial={false}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: reduceMotion ? 0.3 : 0.75, ease: LUX_EASE }}
    >
      <div className="auth-entry__grain" aria-hidden="true" />
      <div className="auth-entry__glow" aria-hidden="true" />

      <div className="auth-entry__center">
        {variant === 'agency' ? (
          <>
            <motion.div className="auth-entry__lockup" {...lockupEnter}>
              <span className="auth-entry__wordmark">Pholio</span>
              {agencyName ? (
                <>
                  <span className="auth-entry__lockup-div" aria-hidden="true" />
                  <span className="auth-entry__agency-name">{agencyName}</span>
                </>
              ) : null}
            </motion.div>
            <Headline words={headlineWords} reduceMotion={reduceMotion} />
            <ProfileSpinner
              avatarUrl={avatarUrl}
              initials={initials}
              variant="agency"
              reduceMotion={reduceMotion}
              delay={0.55}
            />
          </>
        ) : (
          <>
            <Headline words={headlineWords} reduceMotion={reduceMotion} />
            <ProfileSpinner
              avatarUrl={avatarUrl}
              initials={initials}
              variant="talent"
              reduceMotion={reduceMotion}
              delay={0.5}
            />
          </>
        )}
      </div>

      <p className="auth-entry__sr">
        {variant === 'agency'
          ? 'Signing in. Loading your agency dashboard.'
          : `Signing in${talentName && talentName !== 'there' ? `, ${talentName}` : ''}. Loading your studio.`}
      </p>
    </motion.div>
  );
}
