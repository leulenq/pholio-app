import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, X } from 'lucide-react';
import { talentApi } from '../../api/talent';
import { Section } from '../../components/profile-index';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { PholioInput, PholioToggle } from '../../../../shared/components/ui/forms';
import PholioMultiSelect from '../../../../shared/components/ui/forms/PholioMultiSelect';
import { pholioToast } from '../../../../shared/lib/pholio-toast';
import { computeAge } from '../../../../shared/utils/talentAge';
import styles from './ProfilePage.module.css';

const CONTENT_BOUNDARY_OPTIONS = [
  { value: 'Swimwear', label: 'Swimwear' },
  { value: 'Lingerie', label: 'Lingerie' },
  { value: 'Implied Nudity', label: 'Implied Nudity' },
  { value: 'Artistic Nudity', label: 'Artistic Nudity' },
  { value: 'Fitness/Athletic', label: 'Fitness / Athletic' },
  { value: 'Body Paint', label: 'Body Paint' },
];

function StripeConsentModal({
  isOpen,
  onClose,
  consent,
  onConsentChange,
  onStartVerification,
  isPending,
}) {
  if (!isOpen) return null;

  return createPortal(
        <div className={styles.pholioAgeVerifyModalOverlay} onClick={onClose}>
      <div
        className={styles.pholioAgeVerifyModal}
        role="dialog"
        aria-modal="true"
        aria-label="Age Verification Consent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.pholioStripeAccentBar} />
        <div className={styles.pholioAgeVerifyModalHead}>
          <div>
            <div className={styles.pholioStripeBrandLine}>
              <span>Pholio</span>
              <span className={styles.coBrandSep}>×</span>
              <span className={styles.stripeText}>Stripe Identity</span>
            </div>
            <h3>Age Verification Consent</h3>
            <p>Handled securely by Stripe Identity</p>
          </div>
          <button
            type="button"
            className={styles.pholioAgeVerifyModalClose}
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.pholioAgeVerifyDisclosure}>
          <p>
            <strong>ID &amp; Selfie Check:</strong> Stripe Identity verifies a government-issued ID and matching selfie to confirm you are 18 or older and match your profile birth date.
          </p>
          <p>
            <strong>Privacy &amp; Data Storage:</strong> Pholio receives and stores only the pass/fail verification result and audit timestamps—never your identity document or selfie.
          </p>
          <p>
            <strong>Automatic Evidence Redaction:</strong> Pholio requests immediate redaction of verification evidence by Stripe post-check.
          </p>
        </div>

        <div className={styles.pholioAgeVerifyConsentRow}>
          <PholioToggle
            id="age_verification_consent"
            checked={consent}
            onChange={(event) => onConsentChange(event.target.checked)}
            label="I consent to Stripe processing my identity document and selfie for this age check."
          />
        </div>

        <div className={styles.pholioAgeVerifyModalFooter}>
          <a
            className={styles.pholioAgeVerifyPrivacyLink}
            href="https://stripe.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Stripe Privacy Policy
          </a>

          <div className={styles.pholioAgeVerifyModalActions}>
            <PholioButton
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </PholioButton>
            <PholioButton
              type="button"
              variant="primary"
              disabled={!consent || isPending}
              loading={isPending}
              onClick={onStartVerification}
            >
              {isPending ? 'Connecting…' : 'Continue to Stripe'}
            </PholioButton>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
export function VerifiedAdultSection({ dateOfBirth }) {
  const queryClient = useQueryClient();
  const age = computeAge(dateOfBirth);
  const canVerify = age != null && age >= 18;
  const [contentBoundaries, setContentBoundaries] = useState(null);
  const [onlyfansUrl, setOnlyfansUrl] = useState(null);
  const [verificationConsent, setVerificationConsent] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);

  const verificationQuery = useQuery({
    queryKey: ['age-verification'],
    queryFn: () => talentApi.getAgeVerification(),
    enabled: canVerify,
    staleTime: 15_000,
  });
  const contextQuery = useQuery({
    queryKey: ['adult-context'],
    queryFn: () => talentApi.getAdultContext(),
    enabled: canVerify && verificationQuery.data?.verifiedAdult === true,
  });

  const displayedBoundaries = contentBoundaries ?? contextQuery.data?.contentBoundaries ?? [];
  const displayedOnlyfansUrl = onlyfansUrl ?? contextQuery.data?.onlyfansUrl ?? '';

  const startVerification = useMutation({
    mutationFn: () => talentApi.createAgeVerificationSession(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error) => pholioToast.error(error.message || 'Age verification could not start'),
  });
  const saveContext = useMutation({
    mutationFn: () => talentApi.updateAdultContext({
      contentBoundaries: displayedBoundaries,
      onlyfansUrl: displayedOnlyfansUrl,
    }),
    onSuccess: (data) => {
      queryClient.setQueryData(['adult-context'], data);
      setContentBoundaries(data.contentBoundaries || []);
      setOnlyfansUrl(data.onlyfansUrl || '');
      pholioToast.success('Private adult context saved');
    },
    onError: (error) => pholioToast.error(error.message || 'Adult context could not be saved'),
  });

  if (age != null && age < 18) return null;

  const verified = verificationQuery.data?.verifiedAdult === true;
  const status = verificationQuery.data?.status;
  const retry = ['failed', 'canceled', 'requires_input'].includes(status);

  return (
    <Section
      id="verified-adult"
      title="Private Adult Context"
      titleEmphasis="Adult"
      description="Verify your age before storing adult-only creator details or content boundaries. These details stay private unless you explicitly share them for a named submission or confirmed job."
      showDivider={false}
    >
      {!canVerify ? (
        <div className={styles.adultVerificationPanel}>
          <p>Add your date of birth in Identity Details before starting age verification.</p>
        </div>
      ) : verified ? (
        <div className={styles.adultContextFields}>
          <div className={styles.adultVerificationConfirmed}>
            <ShieldCheck aria-hidden="true" size={20} />
            <div>
              <strong>Age verified</strong>
              <p>Pholio stores the verification result, not your identity document or selfie.</p>
            </div>
          </div>
          <PholioMultiSelect
            label="Content Boundaries"
            id="adult_content_boundaries"
            options={CONTENT_BOUNDARY_OPTIONS}
            value={displayedBoundaries}
            onChange={setContentBoundaries}
            placeholder="Select the work you are open to discussing"
          />
          <div className={styles.platformOnlyfans}>
            <PholioInput
              label="OnlyFans"
              id="adult_onlyfans_url"
              type="url"
              placeholder="https://onlyfans.com/username"
              value={displayedOnlyfansUrl}
              onChange={(event) => setOnlyfansUrl(event.target.value)}
            />
          </div>
          <p className={styles.adultContextPrivacy}>
            Saving these details does not share them with agencies or add them to Discover.
          </p>
          <PholioButton
            type="button"
            variant="secondary"
            loading={saveContext.isPending}
            onClick={() => saveContext.mutate()}
          >
            Save private context
          </PholioButton>
        </div>
      ) : (
        <div className={styles.pholioAgeVerifyCard}>
          <div className={styles.pholioStripeAccentBar} />
          <div className={styles.pholioAgeVerifyHeader}>
            <div className={styles.pholioAgeVerifyTitleGroup}>
              <div className={styles.pholioStripeBrandLine}>
                <span>Pholio</span>
                <span className={styles.coBrandSep}>×</span>
                <span className={styles.stripeText}>Stripe Identity</span>
              </div>
              <h4>Age &amp; Identity Verification</h4>
              <p>Verify your 18+ status via Stripe Identity to store private adult creator details.</p>
            </div>
          </div>

          {status === 'processing' && (
            <p className={styles.adultContextPrivacy}>
              Your verification is currently under review by Stripe. This page will update automatically.
            </p>
          )}

          {status === 'failed' && (
            <p className={styles.adultContextPrivacy} style={{ color: 'var(--ag-danger, #d9534f)' }}>
              Verification check failed. Please ensure your photo ID matches your profile birth date.
            </p>
          )}

          <div className={styles.pholioAgeVerifyActions}>
            <PholioButton
              type="button"
              variant="primary"
              disabled={status === 'processing' || verificationQuery.isLoading}
              onClick={() => setShowConsentModal(true)}
            >
              {retry ? 'Try age verification again' : 'Verify age with Stripe'}
            </PholioButton>
          </div>

          <StripeConsentModal
            isOpen={showConsentModal}
            onClose={() => setShowConsentModal(false)}
            consent={verificationConsent}
            onConsentChange={setVerificationConsent}
            onStartVerification={() => startVerification.mutate()}
            isPending={startVerification.isPending}
          />
        </div>
      )}
    </Section>
  );
}
