import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  Check,
  FileText,
  Globe,
  Image as ImageIcon,
  MapPin,
  Palette,
  Sparkles,
  Upload,
  User,
  Users,
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
  updateAgencySettings,
  updateAgencyTeamMember,
} from '../../agency/api/agency';
import LoadingSpinner from '../../../shared/components/shared/LoadingSpinner';
import OnboardingSteps, { STEPS } from './OnboardingSteps';
import '../styles/AgencyOnboardingPage.css';

export default function AgencyOnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    agency_name: '',
    agency_location: '',
    agency_website: '',
    agency_description: '',
  });
  const [brandingForm, setBrandingForm] = useState({
    agency_brand_color: '#C9A55A',
  });
  const [preferencesForm, setPreferencesForm] = useState({
    notify_new_applications: true,
    notify_status_changes: true,
    default_view: 'overview',
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [logoPreview, setLogoPreview] = useState(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['agency-team'],
    queryFn: getAgencyTeam,
    enabled: !isLoading,
  });

  useEffect(() => {
    if (!profile) {
      return;
    }

    if (profile.onboarding?.completed) {
      navigate('/dashboard/agency', { replace: true });
      return;
    }

    setProfileForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      agency_name: profile.agency_name || '',
      agency_location: profile.agency_location || '',
      agency_website: profile.agency_website || '',
      agency_description: profile.agency_description || '',
    });
    setBrandingForm({
      agency_brand_color: profile.agency_brand_color || '#C9A55A',
    });
    setPreferencesForm({
      notify_new_applications: profile.notify_new_applications ?? true,
      notify_status_changes: profile.notify_status_changes ?? true,
      default_view: profile.default_view || 'overview',
    });
    setLogoPreview(profile.agency_logo_path ? `/${profile.agency_logo_path}` : null);
  }, [navigate, profile]);

  const profileMutation = useMutation({
    mutationFn: updateAgencyProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agency-profile'] });
    },
  });

  const brandingMutation = useMutation({
    mutationFn: updateAgencyBranding,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['agency-profile'] });
      if (data?.logo_path) {
        setLogoPreview(`/${data.logo_path}`);
      }
    },
  });

  const preferencesMutation = useMutation({
    mutationFn: updateAgencySettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agency-profile'] });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: addAgencyTeamMember,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agency-team'] });
      setInviteEmail('');
      setInviteRole('MEMBER');
      toast.success('Team member added');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add team member');
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ membershipId, membership_role }) =>
      updateAgencyTeamMember(membershipId, { membership_role }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agency-team'] });
      toast.success('Team member updated');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeAgencyTeamMember,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agency-team'] });
      toast.success('Team member removed');
    },
  });

  const finishMutation = useMutation({
    mutationFn: completeAgencyOnboarding,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agency-profile'] });
      toast.success('Agency setup complete');
      navigate('/dashboard/agency', { replace: true });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to complete onboarding');
    },
  });

  const isBusy =
    profileMutation.isPending ||
    brandingMutation.isPending ||
    preferencesMutation.isPending ||
    addMemberMutation.isPending ||
    updateMemberMutation.isPending ||
    removeMemberMutation.isPending ||
    finishMutation.isPending;

  const ownerCount = useMemo(
    () => members.filter((member) => member.membership_role === 'OWNER').length,
    [members],
  );

  const nextStep = async () => {
    const stepId = STEPS[currentStep]?.id;

    try {
      if (stepId === 'profile') {
        await profileMutation.mutateAsync(profileForm);
      }
      if (stepId === 'preferences') {
        await preferencesMutation.mutateAsync(preferencesForm);
      }
      if (currentStep < STEPS.length - 1) {
        setCurrentStep((value) => value + 1);
      }
    } catch (error) {
      toast.error(error.message || 'Failed to save this step');
    }
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep((value) => value - 1);
    }
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append('agency_logo', file);
    brandingMutation.mutate(formData);
  };

  const handleBrandColorSave = () => {
    const formData = new FormData();
    formData.append('agency_brand_color', brandingForm.agency_brand_color);
    brandingMutation.mutate(formData);
  };

  const handleRemoveLogo = () => {
    const formData = new FormData();
    formData.append('remove_logo', 'true');
    brandingMutation.mutate(formData);
    setLogoPreview(null);
  };

  const completionChecklist = [
    {
      label: 'Organization profile',
      complete: Boolean(profileForm.agency_name.trim() && profileForm.first_name.trim()),
    },
    {
      label: 'Branding applied',
      complete: Boolean(brandingForm.agency_brand_color || logoPreview),
    },
    {
      label: 'Team configured',
      complete: members.length > 0,
    },
    {
      label: 'Workspace preferences set',
      complete: Boolean(preferencesForm.default_view),
    },
  ];

  if (isLoading) {
    return (
      <div className="agency-onboarding agency-onboarding--loading">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const activeStep = STEPS[currentStep];

  return (
    <div className="agency-onboarding">
      <OnboardingSteps
        currentStep={currentStep}
        setCurrentStep={setCurrentStep}
        isBusy={isBusy}
        onPrevious={previousStep}
        onNext={nextStep}
        onFinish={() => finishMutation.mutate()}
      >
          {activeStep.id === 'profile' && (
            <section className="agency-onboarding__panel">
              <div className="agency-onboarding__grid">
                <label className="agency-onboarding__field">
                  <span><User size={16} /> First name</span>
                  <input
                    name="first_name"
                    value={profileForm.first_name}
                    onChange={(event) => setProfileForm((current) => ({ ...current, first_name: event.target.value }))}
                    placeholder="Sarah"
                    required
                  />
                </label>

                <label className="agency-onboarding__field">
                  <span><User size={16} /> Last name</span>
                  <input
                    name="last_name"
                    value={profileForm.last_name}
                    onChange={(event) => setProfileForm((current) => ({ ...current, last_name: event.target.value }))}
                    placeholder="Morgan"
                  />
                </label>

                <label className="agency-onboarding__field agency-onboarding__field--full">
                  <span><Building2 size={16} /> Agency name</span>
                  <input
                    name="agency_name"
                    value={profileForm.agency_name}
                    onChange={(event) => setProfileForm((current) => ({ ...current, agency_name: event.target.value }))}
                    placeholder="Northline Models"
                    required
                  />
                </label>

                <label className="agency-onboarding__field">
                  <span><MapPin size={16} /> Location</span>
                  <input
                    name="agency_location"
                    value={profileForm.agency_location}
                    onChange={(event) => setProfileForm((current) => ({ ...current, agency_location: event.target.value }))}
                    placeholder="New York, NY"
                  />
                </label>

                <label className="agency-onboarding__field">
                  <span><Globe size={16} /> Website</span>
                  <input
                    name="agency_website"
                    value={profileForm.agency_website}
                    onChange={(event) => setProfileForm((current) => ({ ...current, agency_website: event.target.value }))}
                    placeholder="https://example.com"
                  />
                </label>

                <label className="agency-onboarding__field agency-onboarding__field--full">
                  <span><FileText size={16} /> Description</span>
                  <textarea
                    name="agency_description"
                    rows={5}
                    value={profileForm.agency_description}
                    onChange={(event) => setProfileForm((current) => ({ ...current, agency_description: event.target.value }))}
                    placeholder="What does this agency specialize in?"
                  />
                </label>
              </div>
            </section>
          )}

          {activeStep.id === 'branding' && (
            <section className="agency-onboarding__panel">
              <div className="agency-onboarding__brand-layout">
                <div className="agency-onboarding__logo-card">
                  <div className="agency-onboarding__logo-preview" style={{ borderColor: brandingForm.agency_brand_color }}>
                    {logoPreview ? <img src={logoPreview} alt="Agency logo" /> : <ImageIcon size={36} />}
                  </div>
                  <div className="agency-onboarding__logo-actions">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={handleLogoUpload}
                    />
                    <button type="button" className="agency-onboarding__button agency-onboarding__button--ghost" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={16} />
                      Upload logo
                    </button>
                    {logoPreview && (
                      <button type="button" className="agency-onboarding__button agency-onboarding__button--ghost" onClick={handleRemoveLogo}>
                        <X size={16} />
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="agency-onboarding__brand-card">
                  <label className="agency-onboarding__field">
                    <span><Palette size={16} /> Primary brand color</span>
                    <div className="agency-onboarding__color-row">
                      <input
                        type="color"
                        value={brandingForm.agency_brand_color}
                        onChange={(event) => setBrandingForm({ agency_brand_color: event.target.value })}
                      />
                      <code>{brandingForm.agency_brand_color.toUpperCase()}</code>
                    </div>
                  </label>

                  <button type="button" className="agency-onboarding__button" onClick={handleBrandColorSave}>
                    Apply brand color
                  </button>

                  <div className="agency-onboarding__brand-preview" style={{ '--agency-brand': brandingForm.agency_brand_color }}>
                    <span>{profileForm.agency_name || 'Your Agency'}</span>
                    <p>How the workspace brand will start to feel across the dashboard.</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeStep.id === 'team' && (
            <section className="agency-onboarding__panel">
              <div className="agency-onboarding__team-intro">
                <p>
                  Add the provisioned agency logins that should join this organization now. You can keep editing this later in settings.
                </p>
                <span>{members.length} active member{members.length === 1 ? '' : 's'} in workspace</span>
              </div>

              <div className="agency-onboarding__team-form">
                <input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="name@agency.com"
                />
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button
                  type="button"
                  className="agency-onboarding__button"
                  disabled={!inviteEmail.trim()}
                  onClick={() => addMemberMutation.mutate({
                    email: inviteEmail.trim(),
                    membership_role: inviteRole,
                  })}
                >
                  <Users size={16} />
                  Add member
                </button>
              </div>

              <div className="agency-onboarding__team-list">
                {members.map((member) => (
                  <div key={member.membershipId} className="agency-onboarding__member">
                    <div>
                      <strong>{member.full_name}</strong>
                      <span>{member.email}</span>
                    </div>
                    <div className="agency-onboarding__member-actions">
                      {member.membership_role === 'OWNER' ? (
                        <span className="agency-onboarding__pill">Owner</span>
                      ) : (
                        <select
                          value={member.membership_role}
                          onChange={(event) => updateMemberMutation.mutate({
                            membershipId: member.membershipId,
                            membership_role: event.target.value,
                          })}
                        >
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      )}
                      {member.membership_role !== 'OWNER' && member.userId !== profile?.id && (
                        <button
                          type="button"
                          className="agency-onboarding__button agency-onboarding__button--ghost"
                          onClick={() => removeMemberMutation.mutate(member.membershipId)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeStep.id === 'preferences' && (
            <section className="agency-onboarding__panel">
              <div className="agency-onboarding__preferences">
                <label className="agency-onboarding__toggle">
                  <div>
                    <strong><Bell size={16} /> New application alerts</strong>
                    <span>Notify this org when new submissions arrive.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferencesForm.notify_new_applications}
                    onChange={() => setPreferencesForm((current) => ({
                      ...current,
                      notify_new_applications: !current.notify_new_applications,
                    }))}
                  />
                </label>

                <label className="agency-onboarding__toggle">
                  <div>
                    <strong><Bell size={16} /> Status change alerts</strong>
                    <span>Keep everyone in sync when applications move.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferencesForm.notify_status_changes}
                    onChange={() => setPreferencesForm((current) => ({
                      ...current,
                      notify_status_changes: !current.notify_status_changes,
                    }))}
                  />
                </label>

                <label className="agency-onboarding__field">
                  <span><Sparkles size={16} /> Default landing view</span>
                  <select
                    value={preferencesForm.default_view}
                    onChange={(event) => setPreferencesForm((current) => ({ ...current, default_view: event.target.value }))}
                  >
                    <option value="overview">Overview</option>
                    <option value="discover">Discover</option>
                    <option value="roster">Roster</option>
                    <option value="analytics">Analytics</option>
                  </select>
                </label>
              </div>
            </section>
          )}

          {activeStep.id === 'review' && (
            <section className="agency-onboarding__panel">
              <div className="agency-onboarding__review-grid">
                <div className="agency-onboarding__review-card">
                  <h3>Setup status</h3>
                  <div className="agency-onboarding__checklist">
                    {completionChecklist.map((item) => (
                      <div key={item.label} className={`agency-onboarding__check ${item.complete ? 'is-complete' : ''}`}>
                        <span>{item.complete ? <Check size={14} /> : '•'}</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="agency-onboarding__review-card">
                  <h3>Workspace snapshot</h3>
                  <dl>
                    <div><dt>Agency</dt><dd>{profileForm.agency_name || 'Not set'}</dd></div>
                    <div><dt>Location</dt><dd>{profileForm.agency_location || 'Not set'}</dd></div>
                    <div><dt>Members</dt><dd>{members.length} active / {ownerCount} owner</dd></div>
                    <div><dt>Default view</dt><dd>{preferencesForm.default_view}</dd></div>
                  </dl>
                </div>

                <div className="agency-onboarding__review-card agency-onboarding__review-card--wide">
                  <h3>Suggested next moves</h3>
                  <div className="agency-onboarding__ideas">
                    <article>
                      <strong>Upload a polished agency mark</strong>
                      <p>A logo instantly makes nav, messaging, and exports feel production-ready.</p>
                    </article>
                    <article>
                      <strong>Add one admin before launch</strong>
                      <p>It prevents the workspace from bottlenecking around a single owner login.</p>
                    </article>
                    <article>
                      <strong>Keep Overview as the default initially</strong>
                      <p>It is the safest first landing point until your team establishes a daily operating rhythm.</p>
                    </article>
                  </div>
                </div>
              </div>
            </section>
          )}
      </OnboardingSteps>
    </div>
  );
}
