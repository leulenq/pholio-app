import React, { useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Image as ImageIcon,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  addAgencyTeamMember,
  completeAgencyOnboarding,
  getAgencyProfile,
  getAgencyTeam,
  removeAgencyTeamMember,
  updateAgencyBranding,
  updateAgencyProfile,
  updateAgencyTeamMember,
} from '../../agency/api/agency';
import { resolveAgencyLogoUrl, validateAgencyLogoFile } from '../../agency/lib/agency-branding';
import LoadingSpinner from '../../../shared/components/shared/LoadingSpinner';
import PholioBillingWordmark from '../../../shared/components/billing/PholioBillingWordmark';
import OnboardingSteps from './OnboardingSteps';
import { AGENCY_ONBOARDING_STEPS as STEPS } from './agencyOnboardingSteps';
import '../styles/AgencyOnboardingPage.css';

const DEFAULT_BRAND_COLOR = '#C9A55A';

export default function AgencyOnboardingPage() {
  const { data: profile, isLoading, isError, error } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
  });

  const { data: members = [], isError: isTeamError } = useQuery({
    queryKey: ['agency-team'],
    queryFn: getAgencyTeam,
    enabled: Boolean(profile),
  });

  if (isLoading) {
    return (
      <div className="agency-onboarding agency-onboarding--loading" role="status" aria-label="Loading agency setup">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <main className="agency-onboarding agency-onboarding--error">
        <div className="agency-onboarding__load-error" role="alert">
          <h1>We couldn’t open your agency workspace.</h1>
          <p>{error?.message || 'The agency profile could not be loaded.'}</p>
          <button type="button" className="agency-onboarding__button agency-onboarding__button--primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (profile.onboarding?.completed) {
    return <Navigate to="/dashboard/agency" replace />;
  }

  return (
    <AgencyOnboardingExperience
      key={profile.id || profile.agency_id || 'agency-onboarding'}
      profile={profile}
      members={members}
      isTeamError={isTeamError}
    />
  );
}

function AgencyOnboardingExperience({ profile, members, isTeamError }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [profileErrors, setProfileErrors] = useState({});
  const [currentStep, setCurrentStep] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [profileForm, setProfileForm] = useState({
    first_name: profile.first_name || '',
    last_name: profile.last_name || '',
    agency_name: profile.agency_name || '',
    agency_location: profile.agency_location || '',
    agency_website: profile.agency_website || '',
    agency_description: profile.agency_description || '',
  });
  const [brandingForm, setBrandingForm] = useState({
    agency_brand_color: profile.agency_brand_color || DEFAULT_BRAND_COLOR,
  });
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('SCOUT');
  const [logoPreview, setLogoPreview] = useState(() => resolveAgencyLogoUrl(profile));

  const profileMutation = useMutation({
    mutationFn: updateAgencyProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agency-profile'] }),
  });

  const brandingMutation = useMutation({
    mutationFn: updateAgencyBranding,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['agency-profile'] });
      if (data?.logo_path) {
        setLogoPreview(data.logo_path.startsWith('http')
          ? data.logo_path
          : `/${String(data.logo_path).replace(/^\//, '')}`);
      }
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: addAgencyTeamMember,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agency-team'] });
      setMemberEmail('');
      setMemberRole('SCOUT');
      toast.success('Team member added to the workspace');
    },
    onError: (error) => toast.error(error.message || 'Unable to add this team member'),
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ membershipId, membership_role }) =>
      updateAgencyTeamMember(membershipId, { membership_role }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agency-team'] });
      toast.success('Workspace access updated');
    },
    onError: (error) => toast.error(error.message || 'Unable to update workspace access'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeAgencyTeamMember,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agency-team'] });
      toast.success('Team member removed');
    },
    onError: (error) => toast.error(error.message || 'Unable to remove this team member'),
  });

  const finishMutation = useMutation({
    mutationFn: completeAgencyOnboarding,
    onSuccess: () => {
      setIsReady(true);
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    onError: (error) => toast.error(error.message || 'Unable to commission the workspace'),
  });

  const isBusy =
    profileMutation.isPending ||
    brandingMutation.isPending ||
    addMemberMutation.isPending ||
    updateMemberMutation.isPending ||
    removeMemberMutation.isPending ||
    finishMutation.isPending;

  const activeMembers = useMemo(
    () => members.filter((member) => member.status !== 'INACTIVE'),
    [members],
  );

  const ownerCount = useMemo(
    () => activeMembers.filter((member) => member.membership_role === 'OWNER').length,
    [activeMembers],
  );

  const agencyInitials = useMemo(() => {
    const source = profileForm.agency_name.trim() || 'Agency';
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }, [profileForm.agency_name]);

  const canContinue = useMemo(() => {
    if (STEPS[currentStep]?.id === 'profile') {
      return Boolean(profileForm.first_name.trim() && profileForm.agency_name.trim());
    }
    if (STEPS[currentStep]?.id === 'review') return !isTeamError;
    return true;
  }, [currentStep, isTeamError, profileForm.agency_name, profileForm.first_name]);

  const isMemberEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail.trim());

  const validateProfile = () => {
    const nextErrors = {};
    if (!profileForm.agency_name.trim()) nextErrors.agency_name = 'Enter the approved agency name.';
    if (!profileForm.first_name.trim()) nextErrors.first_name = 'Enter the agency owner’s first name.';

    if (profileForm.agency_website.trim()) {
      try {
        const website = new URL(profileForm.agency_website);
        if (!['http:', 'https:'].includes(website.protocol)) throw new Error('Unsupported protocol');
      } catch {
        nextErrors.agency_website = 'Enter a complete website address, including https://.';
      }
    }

    setProfileErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveBrandColor = async () => {
    const formData = new FormData();
    formData.append('agency_brand_color', brandingForm.agency_brand_color);
    await brandingMutation.mutateAsync(formData);
  };

  const nextStep = async () => {
    const stepId = STEPS[currentStep]?.id;

    try {
      if (stepId === 'profile') {
        if (!validateProfile()) return;
        await profileMutation.mutateAsync(profileForm);
      }
      if (stepId === 'branding') await saveBrandColor();
      if (currentStep < STEPS.length - 1) {
        setCurrentStep((value) => value + 1);
      }
    } catch (error) {
      toast.error(error.message || 'Unable to save this chapter');
    }
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const error = validateAgencyLogoFile(file);
    if (error) {
      toast.error(error);
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('agency_logo', file);
    try {
      await brandingMutation.mutateAsync(formData);
    } catch (uploadError) {
      toast.error(uploadError.message || 'Unable to upload this agency mark');
    }
    event.target.value = '';
  };

  const openLogoPicker = () => {
    const input = fileInputRef.current;
    if (!input) return;

    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch {
      toast.error('Your browser blocked the file picker. Check its upload permissions and try again.');
    }
  };

  const handleRemoveLogo = async () => {
    const formData = new FormData();
    formData.append('remove_logo', 'true');
    try {
      await brandingMutation.mutateAsync(formData);
      setLogoPreview(null);
    } catch (error) {
      toast.error(error.message || 'Unable to remove this agency mark');
    }
  };

  if (isReady) {
    return (
      <main className="agency-onboarding-ready">
        <div className="agency-onboarding-ready__wordmark" role="img" aria-label="Pholio">
          <PholioBillingWordmark variant="on-ink" size="md" />
        </div>
        <section className="agency-onboarding-ready__stage" role="status" aria-live="polite" tabIndex={-1} autoFocus>
          <div
            className="agency-onboarding-ready__mark"
            style={{ '--agency-mark': brandingForm.agency_brand_color }}
          >
            {logoPreview ? <img src={logoPreview} alt="" /> : <span>{agencyInitials}</span>}
          </div>
          <h1>Your workspace is ready.</h1>
          <p>
            {profileForm.agency_name || 'Your agency'} is now commissioned inside Pholio.
          </p>
          <button
            type="button"
            className="agency-onboarding__button agency-onboarding__button--primary agency-onboarding-ready__enter"
            onClick={() => window.location.assign('/dashboard/agency')}
          >
            Enter the workspace
            <ArrowRight size={16} />
          </button>
        </section>
      </main>
    );
  }

  const activeStep = STEPS[currentStep];

  return (
    <div className="agency-onboarding">
      <OnboardingSteps
        currentStep={currentStep}
        agencyName={profileForm.agency_name}
        isBusy={isBusy}
        canContinue={canContinue}
        onPrevious={() => setCurrentStep((value) => Math.max(0, value - 1))}
        onNext={nextStep}
        onFinish={() => finishMutation.mutate()}
      >
        {activeStep.id === 'profile' && (
          <section className="agency-onboarding__panel agency-onboarding__profile-layout">
            <div className="agency-onboarding__form-fields">
              <label className="agency-onboarding__field agency-onboarding__field--wide">
                <span>Agency name</span>
                <input
                  name="agency_name"
                  value={profileForm.agency_name}
                  onChange={(event) => {
                    setProfileForm((current) => ({ ...current, agency_name: event.target.value }));
                    setProfileErrors((current) => ({ ...current, agency_name: undefined }));
                  }}
                  placeholder="Northline Models"
                  autoComplete="organization"
                  aria-invalid={Boolean(profileErrors.agency_name)}
                  aria-describedby={profileErrors.agency_name ? 'agency-name-error' : undefined}
                  required
                />
                {profileErrors.agency_name && <small id="agency-name-error" className="agency-onboarding__field-error">{profileErrors.agency_name}</small>}
              </label>

              <label className="agency-onboarding__field">
                <span>Primary market</span>
                <input
                  name="agency_location"
                  value={profileForm.agency_location}
                  onChange={(event) => setProfileForm((current) => ({ ...current, agency_location: event.target.value }))}
                  placeholder="New York, NY"
                  autoComplete="address-level2"
                />
              </label>

              <label className="agency-onboarding__field">
                <span>Agency website</span>
                <input
                  type="url"
                  name="agency_website"
                  value={profileForm.agency_website}
                  onChange={(event) => {
                    setProfileForm((current) => ({ ...current, agency_website: event.target.value }));
                    setProfileErrors((current) => ({ ...current, agency_website: undefined }));
                  }}
                  placeholder="https://northline.com"
                  autoComplete="url"
                  aria-invalid={Boolean(profileErrors.agency_website)}
                  aria-describedby={profileErrors.agency_website ? 'agency-website-error' : undefined}
                />
                {profileErrors.agency_website && <small id="agency-website-error" className="agency-onboarding__field-error">{profileErrors.agency_website}</small>}
              </label>

              <label className="agency-onboarding__field agency-onboarding__field--wide">
                <span>Agency profile</span>
                <textarea
                  name="agency_description"
                  rows={4}
                  value={profileForm.agency_description}
                  onChange={(event) => setProfileForm((current) => ({ ...current, agency_description: event.target.value }))}
                  placeholder="Describe the markets, boards, and talent your agency represents."
                />
                <small>This becomes the working context for your team and agency presence.</small>
              </label>
            </div>

            <aside className="agency-onboarding__director">
              <h2>Agency owner</h2>
              <p>The primary account responsible for agency identity and team access.</p>
              <div className="agency-onboarding__name-fields">
                <label className="agency-onboarding__field">
                  <span>First name</span>
                  <input
                    name="first_name"
                    value={profileForm.first_name}
                    onChange={(event) => {
                      setProfileForm((current) => ({ ...current, first_name: event.target.value }));
                      setProfileErrors((current) => ({ ...current, first_name: undefined }));
                    }}
                    placeholder="Sarah"
                    autoComplete="given-name"
                    aria-invalid={Boolean(profileErrors.first_name)}
                    aria-describedby={profileErrors.first_name ? 'agency-owner-first-name-error' : undefined}
                    required
                  />
                  {profileErrors.first_name && <small id="agency-owner-first-name-error" className="agency-onboarding__field-error">{profileErrors.first_name}</small>}
                </label>
                <label className="agency-onboarding__field">
                  <span>Last name</span>
                  <input
                    name="last_name"
                    value={profileForm.last_name}
                    onChange={(event) => setProfileForm((current) => ({ ...current, last_name: event.target.value }))}
                    placeholder="Morgan"
                    autoComplete="family-name"
                  />
                </label>
              </div>
            </aside>
          </section>
        )}

        {activeStep.id === 'branding' && (
          <section className="agency-onboarding__panel agency-onboarding__brand-layout">
            <div className="agency-onboarding__identity-controls">
              <div>
                <h3>Agency mark</h3>
                <p>Use a transparent PNG or SVG. A restrained mark reads best in the command rail.</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.svg,image/png,image/svg+xml"
                className="agency-onboarding__visually-hidden"
                onChange={handleLogoUpload}
                tabIndex={-1}
                aria-hidden="true"
              />
              <button
                type="button"
                className="agency-onboarding__logo-drop"
                onClick={openLogoPicker}
                disabled={brandingMutation.isPending}
              >
                <span className="agency-onboarding__logo-preview">
                  {logoPreview ? <img src={logoPreview} alt="Agency mark preview" /> : <ImageIcon size={32} strokeWidth={1.3} />}
                </span>
                <span><Upload size={15} /> {logoPreview ? 'Replace agency mark' : 'Choose agency mark'}</span>
              </button>
              {logoPreview && (
                <button
                  type="button"
                  className="agency-onboarding__text-button"
                  onClick={handleRemoveLogo}
                >
                  <X size={14} /> Remove mark
                </button>
              )}

              <label className="agency-onboarding__field agency-onboarding__color-field">
                <span>Workspace accent</span>
                <div className="agency-onboarding__color-row">
                  <input
                    type="color"
                    value={brandingForm.agency_brand_color}
                    onChange={(event) => setBrandingForm({ agency_brand_color: event.target.value })}
                    aria-label="Workspace accent color"
                  />
                  <code>{brandingForm.agency_brand_color.toUpperCase()}</code>
                </div>
                <small>Pholio gold remains fixed; this color identifies your agency inside its workspace.</small>
              </label>
            </div>

            <div
              className="agency-onboarding__workspace-proof"
              style={{ '--agency-mark': brandingForm.agency_brand_color }}
            >
              <div className="agency-onboarding__proof-platform" role="img" aria-label="Pholio">
                <PholioBillingWordmark variant="on-ink" size="sm" />
              </div>
              <span className="agency-onboarding__proof-rule" aria-hidden="true" />
              <div className="agency-onboarding__proof-agency">
                <div className="agency-onboarding__proof-mark" aria-hidden="true">
                  {logoPreview ? <img src={logoPreview} alt="" /> : <span>{agencyInitials}</span>}
                </div>
                <div>
                  <strong>{profileForm.agency_name || 'Your Agency'}</strong>
                  <span>{profileForm.agency_location || 'Private agency workspace'}</span>
                </div>
              </div>
              <span className="agency-onboarding__proof-accent" aria-hidden="true" />
            </div>
          </section>
        )}

        {activeStep.id === 'team' && (
          <section className="agency-onboarding__panel agency-onboarding__team-layout">
            <div className="agency-onboarding__team-entry">
              <h2>Add an approved login</h2>
              <p>
                Team access is limited to agency users already provisioned by Pholio.
              </p>
              <label className="agency-onboarding__field">
                <span>Email address</span>
                <input
                  type="email"
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                  placeholder="booker@agency.com"
                  autoComplete="email"
                />
              </label>
              <label className="agency-onboarding__field">
                <span>Workspace role</span>
                <select value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>
                  <option value="AGENT">Booker</option>
                  <option value="SCOUT">Scout</option>
                  <option value="ADMIN">Administrator</option>
                  <option value="VIEWER">View only</option>
                </select>
              </label>
              <button
                type="button"
                className="agency-onboarding__button agency-onboarding__button--secondary"
                disabled={!isMemberEmailValid || addMemberMutation.isPending}
                onClick={() => addMemberMutation.mutate({
                  email: memberEmail.trim(),
                  membership_role: memberRole,
                })}
              >
                Add to workspace
              </button>
            </div>

            <div className="agency-onboarding__team-ledger">
              <div className="agency-onboarding__ledger-heading">
                <h3>Team access</h3>
                <span>{activeMembers.length} member{activeMembers.length === 1 ? '' : 's'}</span>
              </div>
              {isTeamError && (
                <p className="agency-onboarding__inline-error" role="alert">
                  Team access could not be loaded. Refresh before commissioning the workspace.
                </p>
              )}
              <div className="agency-onboarding__team-list">
                {activeMembers.map((member) => (
                  <div key={member.membershipId} className="agency-onboarding__member">
                    <div className="agency-onboarding__member-identity">
                      <div>
                        <strong>{member.full_name || 'Agency member'}</strong>
                        <small>{member.email}</small>
                      </div>
                    </div>
                    <div className="agency-onboarding__member-actions">
                      {member.membership_role === 'OWNER' ? (
                        <span className="agency-onboarding__plain-role">Owner</span>
                      ) : (
                        <select
                          aria-label={`Role for ${member.full_name || member.email}`}
                          value={member.membership_role}
                          onChange={(event) => updateMemberMutation.mutate({
                            membershipId: member.membershipId,
                            membership_role: event.target.value,
                          })}
                        >
                          <option value="AGENT">Booker</option>
                          <option value="SCOUT">Scout</option>
                          <option value="ADMIN">Administrator</option>
                          <option value="VIEWER">View only</option>
                        </select>
                      )}
                      {member.membership_role !== 'OWNER' && member.userId !== profile?.id && (
                        <button
                          type="button"
                          className="agency-onboarding__text-button"
                          onClick={() => removeMemberMutation.mutate(member.membershipId)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeStep.id === 'review' && (
          <section className="agency-onboarding__panel agency-onboarding__review-layout">
            <div className="agency-onboarding__review-lockup" style={{ '--agency-mark': brandingForm.agency_brand_color }}>
              <div role="img" aria-label="Pholio">
                <PholioBillingWordmark variant="on-ink" size="md" />
              </div>
              <span className="agency-onboarding__review-divider" aria-hidden="true" />
              <div className="agency-onboarding__review-agency">
                <div className="agency-onboarding__review-mark" aria-hidden="true">
                  {logoPreview ? <img src={logoPreview} alt="" /> : <span>{agencyInitials}</span>}
                </div>
                <div>
                  <h2>{profileForm.agency_name || 'Your Agency'}</h2>
                  <p>{profileForm.agency_location || 'Private agency workspace'}</p>
                </div>
              </div>
            </div>

            <div className="agency-onboarding__review-ledger">
              <dl>
                <div>
                  <dt>Agency</dt>
                  <dd>{profileForm.agency_name || 'Not set'}</dd>
                </div>
                <div>
                  <dt>Team access</dt>
                  <dd>{activeMembers.length} member{activeMembers.length === 1 ? '' : 's'} · {ownerCount} owner{ownerCount === 1 ? '' : 's'}</dd>
                </div>
              </dl>
            </div>
          </section>
        )}
      </OnboardingSteps>
    </div>
  );
}
