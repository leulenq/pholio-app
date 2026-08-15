/**
 * Comp card import.
 *
 * Upload a card the talent already has, read it, and offer the fields back for
 * confirmation. The whole point of this screen is that it is a *review*: nothing
 * is written until the talent says so, field by field.
 *
 * Three things the UI is responsible for making true:
 *
 *   - Found, ambiguous and not-found are visibly different. An ambiguous value is
 *     an unanswered question, not a pre-filled field, so it starts unselected and
 *     the talent must pick a reading.
 *   - Every proposed value shows the line of the card it came from. A number with
 *     no provenance is indistinguishable from one the product invented.
 *   - A card that could not be read still lands here, with every field present and
 *     editable. Import failing is not the flow failing.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FileUp, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { talentApi } from '../../api/talent';
import styles from './CompCardImport.module.css';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

/**
 * The server refuses to send a card *image* to its vision provider without
 * image-processing consent. That refusal is not a failed read — the talent has
 * an action to take — so it gets its own screen rather than the generic
 * "couldn't read it" review.
 */
const AI_IMAGE_CONSENT_REQUIRED = 'ai_image_consent_required';

function isConsentRequiredError(error) {
  return error?.status === 403 && error?.data?.details?.code === AI_IMAGE_CONSENT_REQUIRED;
}

/** The house spring. Stillness is the resting state, not the whole experience. */
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

function summarySentence({ found, ambiguous, notFound }) {
  const parts = [];
  parts.push(found === 1 ? 'Read 1 field from your card' : `Read ${found} fields from your card`);
  if (ambiguous > 0) {
    parts.push(ambiguous === 1 ? '1 needs a choice' : `${ambiguous} need a choice`);
  }
  if (notFound > 0) parts.push(`${notFound} weren’t on the card`);
  return `${parts.join(' · ')}.`;
}

export default function CompCardImport({ onApplied, onDone }) {
  const reduceMotion = useReducedMotion();
  const inputRef = useRef(null);

  const [stage, setStage] = useState('idle'); // idle | reading | review | consent | done
  const [consentMessage, setConsentMessage] = useState('');
  const [proposal, setProposal] = useState(null);
  const [selection, setSelection] = useState({});
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  const transition = reduceMotion ? { duration: 0.15 } : SPRING;

  // Memoised so the three groupings below do not re-derive on every render off a
  // fresh `[]` literal.
  const fields = useMemo(() => proposal?.fields || [], [proposal]);
  const foundFields = useMemo(() => fields.filter((f) => f.status === 'found'), [fields]);
  const ambiguousFields = useMemo(() => fields.filter((f) => f.status === 'ambiguous'), [fields]);
  const missingFields = useMemo(() => fields.filter((f) => f.status === 'not_found'), [fields]);

  const selectedCount = Object.values(selection).filter(
    (entry) => entry?.checked && entry.value !== null && entry.value !== '',
  ).length;

  const reset = useCallback(() => {
    setStage('idle');
    setProposal(null);
    setSelection({});
    setAppliedCount(0);
    setConsentMessage('');
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setStage('reading');

    const formData = new FormData();
    formData.append('card', file);

    try {
      const result = await talentApi.importCompCard(formData);
      setProposal(result);

      // Found fields start selected — they are the offer. Ambiguous ones never
      // do: an unanswered question must not apply itself by default.
      const initial = {};
      for (const field of result.fields || []) {
        if (field.status === 'found') {
          initial[field.key] = { checked: true, value: field.value };
        }
      }
      setSelection(initial);
      setStage('review');
    } catch (error) {
      // Missing consent is the one refusal with something to do about it, and
      // the card was never sent anywhere. Say so plainly instead of reporting a
      // permission the talent controls as a card that could not be read.
      if (isConsentRequiredError(error)) {
        setConsentMessage(error.message || '');
        setStage('consent');
        if (inputRef.current) inputRef.current.value = '';
        return;
      }

      // Every other failure lands on the review screen, empty, so the talent can
      // keep going by hand. This flow does not have a dead end.
      toast.error(error?.message || 'That card could not be read.');
      setProposal({
        fields: [],
        summary: { found: 0, ambiguous: 0, notFound: 0, total: 0 },
        message: 'That card could not be read. You can fill your details in on your profile.',
        source: {},
        shotTypes: [],
      });
      setStage('review');
    }
  }, []);

  const applySelection = useCallback(async () => {
    if (!proposal?.id || selectedCount === 0) return;
    setApplying(true);

    const accepted = {};
    for (const [key, entry] of Object.entries(selection)) {
      if (entry?.checked && entry.value !== null && entry.value !== '') {
        accepted[key] = entry.value;
      }
    }

    try {
      const result = await talentApi.confirmCompCardImport(proposal.id, accepted);
      setAppliedCount(result.applied?.length || 0);
      setStage('done');
      toast.success(
        `${result.applied?.length || 0} field${result.applied?.length === 1 ? '' : 's'} added to your profile.`,
      );
      onApplied?.(result);
    } catch (error) {
      toast.error(error?.message || 'Those fields could not be applied.');
    } finally {
      setApplying(false);
    }
  }, [proposal, selection, selectedCount, onApplied]);

  const discard = useCallback(async () => {
    if (proposal?.id) {
      try {
        await talentApi.discardCompCardImport(proposal.id);
      } catch {
        // Discarding is a courtesy to the audit record, not a gate on the UI.
      }
    }
    reset();
    // In the overlay this is "I'm finished", not "start again".
    onDone?.();
  }, [proposal, reset, onDone]);

  const setFieldChecked = (key, checked) =>
    setSelection((prev) => ({ ...prev, [key]: { ...prev[key], checked } }));

  const setFieldValue = (key, value) =>
    setSelection((prev) => ({ ...prev, [key]: { ...prev[key], value } }));

  const sourceMeta = () => {
    const method = proposal?.source?.method;
    if (method === 'pdf_text') return 'Read from the card’s text';
    if (method === 'vision') return 'Read from the card image';
    return 'Nothing read';
  };

  return (
    <div className={styles.wrap}>
      {stage === 'idle' && (
        <motion.section
          key="idle"
          className={styles.panel}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
        >
          <header className={styles.head}>
            <h2 className={styles.title}>
              Start from a card you <em>already have</em>
            </h2>
            <span className={styles.headMeta}>PDF · JPEG · PNG · WEBP</span>
          </header>
          <div className={styles.sweep} aria-hidden="true" />
          <p className={styles.standfirst}>
            Upload an existing agency comp card. Pholio reads the text on it and offers you the
            fields — you confirm each one before anything is saved to your profile.
          </p>

          <div className={styles.dropWell}>
            <FileUp className={styles.dropIcon} aria-hidden="true" strokeWidth={1.25} />
            <p className={styles.dropHint}>Drop a card, or choose one</p>
            <PholioButton variant="primary" type="button" onClick={() => inputRef.current?.click()}>
              Choose a card
            </PholioButton>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className={styles.hiddenInput}
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
          </div>

          <p className={styles.finePrint}>
            Your card is read and not stored, and only the text on it is used. Nothing about the
            photographs on the card is analysed.
          </p>
        </motion.section>
      )}

      {stage === 'reading' && (
        <motion.section
          key="reading"
          className={styles.panel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={transition}
        >
          <header className={styles.head}>
            <h2 className={styles.title}>
              Reading your <em>card</em>
            </h2>
            <span className={styles.headMeta}>Working</span>
          </header>
          <div className={styles.readingBar} aria-hidden="true">
            <motion.span
              className={styles.readingBarFill}
              initial={{ x: '-100%' }}
              animate={reduceMotion ? { x: '0%' } : { x: ['-100%', '100%'] }}
              transition={
                reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 1.1, ease: 'easeInOut' }
              }
            />
          </div>
        </motion.section>
      )}

      {stage === 'consent' && (
        <motion.section
          key="consent"
          className={styles.panel}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
        >
          <header className={styles.head}>
            <h2 className={styles.title}>
              Reading an image needs your <em>permission</em>
            </h2>
            <span className={styles.headMeta}>Nothing was sent</span>
          </header>
          <div className={styles.sweep} aria-hidden="true" />

          <p className={styles.notice}>
            {consentMessage ||
              'Reading a comp card image sends it to Pholio’s image-analysis provider, which needs your permission first.'}
          </p>

          <p className={styles.standfirst}>
            Your card was not uploaded or read. You have three ways forward: turn on image
            processing in your privacy settings, upload the same card as a PDF — a PDF is read
            from its own text with no AI involved — or enter the fields on your profile.
          </p>

          <div className={styles.actions}>
            <PholioButton variant="primary" to="/dashboard/talent/settings">
              Open privacy settings
            </PholioButton>
            <PholioButton variant="secondary" type="button" onClick={reset}>
              Try a different file
            </PholioButton>
          </div>
        </motion.section>
      )}

      {stage === 'review' && (
        <motion.section
          key="review"
          className={styles.panel}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
        >
          <header className={styles.head}>
            <h2 className={styles.title}>
              What the card <em>says</em>
            </h2>
            <span className={styles.headMeta}>{sourceMeta()}</span>
          </header>
          <div className={styles.sweep} aria-hidden="true" />

          {proposal?.message ? (
            <p className={styles.notice}>{proposal.message}</p>
          ) : (
            <p className={styles.standfirst}>
              {summarySentence(proposal?.summary || { found: 0, ambiguous: 0, notFound: 0 })} Nothing
              is saved until you apply it.
            </p>
          )}

          <div className={styles.body}>
            {ambiguousFields.length > 0 && (
              <section className={styles.group}>
                <div className={styles.groupHead}>
                  <h3 className={styles.groupTitle}>Needs your answer</h3>
                  <span className={styles.groupCount}>
                    {String(ambiguousFields.length).padStart(2, '0')}
                  </span>
                </div>
                <p className={styles.groupNote}>
                  The card printed these without a unit, and both readings are possible. Pholio
                  won’t choose for you.
                </p>
                <ul className={styles.rows}>
                  {ambiguousFields.map((field, index) => (
                    <li
                      key={field.key}
                      className={styles.row}
                      style={{ '--cci-row-index': index }}
                    >
                      <span className={styles.rowIndex} aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={styles.rowLabel}>{field.label}</span>
                      <div className={styles.rowValue}>
                        <div className={styles.choiceRow} role="group" aria-label={field.label}>
                          {(field.options || []).map((option) => {
                            // Must be a real boolean: `undefined` makes React drop
                            // aria-pressed entirely, and a toggle with no pressed
                            // state is unreadable to a screen reader.
                            const active = Boolean(
                              selection[field.key]?.checked &&
                                String(selection[field.key]?.value) === String(option.value),
                            );
                            return (
                              <button
                                key={option.label}
                                type="button"
                                className={`${styles.choice} ${active ? styles.choiceActive : ''}`}
                                aria-pressed={active}
                                onClick={() =>
                                  setSelection((prev) => ({
                                    ...prev,
                                    [field.key]: { checked: true, value: option.value },
                                  }))
                                }
                              >
                                {option.label}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            className={`${styles.choice} ${styles.choiceSkip} ${
                              selection[field.key]?.checked === false ? styles.choiceActive : ''
                            }`}
                            aria-pressed={selection[field.key]?.checked === false}
                            onClick={() =>
                              setSelection((prev) => ({
                                ...prev,
                                [field.key]: { checked: false, value: null },
                              }))
                            }
                          >
                            Skip
                          </button>
                        </div>
                        <span className={styles.rowEvidence}>On the card — {field.evidence}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {foundFields.length > 0 && (
              <section className={styles.group}>
                <div className={styles.groupHead}>
                  <h3 className={styles.groupTitle}>Found on your card</h3>
                  <span className={styles.groupCount}>
                    {String(foundFields.length).padStart(2, '0')}
                  </span>
                </div>
                <ul className={styles.rows}>
                  {foundFields.map((field, index) => (
                    <li
                      key={field.key}
                      className={styles.row}
                      style={{ '--cci-row-index': index }}
                    >
                      <span className={styles.rowIndex} aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <label className={`${styles.checkLabel} ${styles.rowLabel}`} htmlFor={`import-${field.key}`}>
                        <input
                          id={`import-${field.key}`}
                          type="checkbox"
                          className={styles.checkbox}
                          checked={Boolean(selection[field.key]?.checked)}
                          onChange={(event) => setFieldChecked(field.key, event.target.checked)}
                        />
                        {field.label}
                      </label>
                      <div className={styles.rowValue}>
                        <input
                          type="text"
                          className={styles.valueInput}
                          value={selection[field.key]?.value ?? field.value ?? ''}
                          onChange={(event) => setFieldValue(field.key, event.target.value)}
                          aria-label={`${field.label} value`}
                        />
                        <span className={styles.rowEvidence}>
                          {field.display ? `Read as ${field.display} — ` : ''}
                          on the card — {field.evidence}
                        </span>
                        {field.note ? <span className={styles.rowNote}>{field.note}</span> : null}
                        {field.confidence === 'low' ? (
                          <span className={styles.rowNote}>
                            Worth a check — this one was not a clean read.
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {missingFields.length > 0 && (
              <section className={styles.group}>
                <div className={styles.groupHead}>
                  <h3 className={styles.groupTitle}>Not on the card</h3>
                  <span className={styles.groupCount}>
                    {String(missingFields.length).padStart(2, '0')}
                  </span>
                </div>
                <p className={styles.missingList}>
                  <span className={styles.missingNames}>
                    {missingFields.map((field) => field.label).join(' · ')}
                  </span>
                  <br />
                  Add these on your profile — a card is a starting point, not the profile.
                </p>
              </section>
            )}

            {proposal?.shotTypes?.length > 0 && (
              <section className={styles.group}>
                <div className={styles.groupHead}>
                  <h3 className={styles.groupTitle}>Shots your card shows</h3>
                  <span className={styles.groupCount}>
                    {String(proposal.shotTypes.length).padStart(2, '0')}
                  </span>
                </div>
                <p className={styles.missingList}>
                  <span className={styles.missingNames}>
                    {proposal.shotTypes.map((shot) => shot.replace(/_/g, ' ')).join(' · ')}
                  </span>
                  <br />
                  These aren’t imported — your card’s photographs have no shoot date, so they can’t
                  stand as current digitals.
                </p>
              </section>
            )}
          </div>

          {foundFields.some((f) => f.group === 'measurements') || ambiguousFields.length > 0 ? (
            <p className={styles.provenance}>
              Measurements you apply are recorded as declared on import, not measured today — a card
              can be years old, and an agency sees the difference.
            </p>
          ) : null}

          <div className={styles.actions}>
            <PholioButton
              variant="primary"
              type="button"
              onClick={applySelection}
              disabled={selectedCount === 0}
              loading={applying}
            >
              {selectedCount === 0
                ? 'Nothing selected'
                : `Apply ${selectedCount} field${selectedCount === 1 ? '' : 's'}`}
            </PholioButton>
            <PholioButton variant="secondary" type="button" onClick={discard}>
              Discard
            </PholioButton>
          </div>
        </motion.section>
      )}

      {stage === 'done' && (
        <motion.section
          key="done"
          className={styles.panel}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
        >
          <header className={styles.head}>
            <h2 className={styles.title}>
              Added to your <em>profile</em>
            </h2>
            <span className={styles.headMeta}>
              {String(appliedCount).padStart(2, '0')} applied
            </span>
          </header>
          <div className={styles.sweep} aria-hidden="true" />
          <p className={styles.standfirst}>
            {appliedCount} field{appliedCount === 1 ? '' : 's'} from your card {appliedCount === 1 ? 'is' : 'are'} now
            on your profile. Check them over, then fill in what the card didn’t carry.
          </p>
          <div className={styles.actions}>
            <PholioButton variant="primary" type="button" onClick={() => onDone?.()}>
              Back to my profile
            </PholioButton>
            <PholioButton
              variant="secondary"
              type="button"
              icon={<RotateCcw size={16} strokeWidth={1.5} />}
              onClick={reset}
            >
              Import another card
            </PholioButton>
          </div>
        </motion.section>
      )}
    </div>
  );
}
