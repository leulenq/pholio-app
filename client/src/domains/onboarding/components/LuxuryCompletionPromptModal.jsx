import { motion } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import '../styles/LuxuryCompletionPromptModal.css';

export default function LuxuryCompletionPromptModal({
  isOpen,
  mode = 'generic',
  targetAgency = null,
  profile = null,
  isSubmitting = false,
  onPrimaryAction,
  onSecondaryAction,
  onClose,
  errorMessage
}) {
  const isTargeted = mode === 'targeted' && targetAgency?.id;
  const agencyName = targetAgency?.name || 'the agency';
  const talentName = profile?.first_name || profile?.full_name?.split(' ')?.[0] || 'Talent';
  const primaryCta = isTargeted ? 'Submit to Agency' : 'Enter Agency Market';
  const secondaryCta = 'Stay Here';

  if (!isOpen) return null;

  const primaryLabel = isSubmitting ? (isTargeted ? 'Submitting' : 'Opening') : primaryCta;

  // Staggered transitions matching the spring physics defined in AGENTS.md
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.16,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 55,
        damping: 16,
      },
    },
  };

  const lineVariants = {
    hidden: { scaleY: 0 },
    visible: {
      scaleY: 1,
      transition: {
        duration: 1.0,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  return (
    <div className="luxury-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="luxury-prompt-title">
      <div className="luxury-prompt-backdrop" aria-hidden="true">
        <div className="luxury-prompt-veil" />
        <div className="luxury-prompt-ghost">PHOLIO</div>
      </div>

      <motion.section
        className="luxury-prompt-stage"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <button
          type="button"
          className="luxury-prompt-close"
          onClick={onClose}
          aria-label="Close milestone"
        >
          <X size={18} />
        </button>

        <motion.header className="luxury-prompt-masthead" variants={itemVariants} aria-label="Profile milestone">
          <div className="luxury-prompt-wordmark">
            <span>PHOLIO</span>
            <i />
          </div>
          <p className="luxury-prompt-type-label">Milestone Reached</p>
        </motion.header>

        <div className="luxury-prompt-center-container">
          <motion.div className="luxury-prompt-hero-block" variants={itemVariants}>
            <p className="luxury-prompt-kicker">
              {talentName} / Profile Verified
            </p>

            <h2 id="luxury-prompt-title" className="luxury-prompt-title">
              {isTargeted ? (
                <>
                  Ready for <em>{agencyName}</em>.
                </>
              ) : (
                <>
                  Profile <em>complete.</em>
                </>
              )}
            </h2>

            <p className="luxury-prompt-subtitle">
              Your representation essentials are verified.
            </p>
          </motion.div>

          <div className="luxury-prompt-divider-flow">
            <motion.div
              className="luxury-prompt-v-rule"
              variants={lineVariants}
              style={{ originY: 0 }}
            />
          </div>

          <motion.div className="luxury-prompt-reveal-block" variants={itemVariants}>
            <ul className="luxury-prompt-reveal-list">
              <motion.li className="luxury-prompt-reveal-item" variants={itemVariants}>
                <span className="luxury-prompt-reveal-num">01</span>
                <span className="luxury-prompt-reveal-text">
                  {isTargeted ? `SUBMISSION PACKAGED FOR ${agencyName.toUpperCase()}` : 'AGENCY MARKET UNLOCKED'}
                </span>
              </motion.li>

              <motion.li className="luxury-prompt-reveal-item" variants={itemVariants}>
                <span className="luxury-prompt-reveal-num">02</span>
                <span className="luxury-prompt-reveal-text">LIVE ANALYTICS ACTIVE</span>
              </motion.li>

              <motion.li className="luxury-prompt-reveal-item" variants={itemVariants}>
                <span className="luxury-prompt-reveal-num">03</span>
                <span className="luxury-prompt-reveal-text">COMP CARD GENERATED</span>
              </motion.li>
            </ul>
          </motion.div>
        </div>

        <motion.footer className="luxury-prompt-footer" variants={itemVariants}>
          <div className="luxury-prompt-command">
            {errorMessage ? <p className="luxury-prompt-error">{errorMessage}</p> : null}

            <div className="luxury-prompt-actions">
              <button
                type="button"
                className="luxury-prompt-primary"
                onClick={onPrimaryAction}
                disabled={isSubmitting}
              >
                {primaryLabel}
                {!isSubmitting ? <ArrowUpRight size={17} /> : null}
              </button>
              <button
                type="button"
                className="luxury-prompt-secondary"
                onClick={onSecondaryAction}
                disabled={isSubmitting}
              >
                {secondaryCta}
              </button>
            </div>
          </div>
        </motion.footer>
      </motion.section>
    </div>
  );
}
