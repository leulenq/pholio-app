import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { talentApi } from '../../api/talent';
import { Section } from '../../components/profile-index';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { PholioInput } from '../../../../shared/components/ui/forms';
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

export function VerifiedAdultSection({ dateOfBirth }) {
  const queryClient = useQueryClient();
  const age = computeAge(dateOfBirth);
  const canVerify = age != null && age >= 18;
  const [contentBoundaries, setContentBoundaries] = useState(null);
  const [onlyfansUrl, setOnlyfansUrl] = useState(null);

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
        <div className={styles.adultVerificationPanel}>
          <p>
            Stripe Identity will check a government ID and matching selfie to confirm that you are 18 or older and that the birth date matches your profile. Stripe processes the document; Pholio keeps only the result and asks Stripe to redact the verification data after the check.
          </p>
          {status === 'processing' && <p>Your verification is being reviewed. This page will update when it is complete.</p>}
          {status === 'failed' && <p>The check did not verify your age or the birth date did not match your profile.</p>}
          <PholioButton
            type="button"
            variant="secondary"
            loading={startVerification.isPending}
            disabled={status === 'processing' || verificationQuery.isLoading}
            onClick={() => startVerification.mutate()}
          >
            {retry ? 'Try age verification again' : 'Verify age with Stripe'}
          </PholioButton>
          <a
            className={styles.adultVerificationPrivacyLink}
            href="https://stripe.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Stripe privacy policy
          </a>
        </div>
      )}
    </Section>
  );
}
