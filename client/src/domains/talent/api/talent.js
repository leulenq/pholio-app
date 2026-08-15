/**
 * Talent API Functions
 */
import { apiClient, ApiError } from '../../../shared/lib/api-client';
import { sameOriginMutationHeaders } from '../../../shared/lib/same-origin-request';

export const talentApi = {
  // Profile
  getProfile: (options) => apiClient.get('/profile', options),
  updateProfile: (data) => apiClient.put('/profile', data),
  getRepresentations: () => apiClient.get('/profile/representations'),
  replaceRepresentations: (representations) =>
    apiClient.put('/profile/representations', { representations }),
  createRepresentation: (data) =>
    apiClient.post('/profile/representations', data),
  updateRepresentation: (id, data) =>
    apiClient.patch(`/profile/representations/${encodeURIComponent(id)}`, data),
  endRepresentation: (id, endedOn) =>
    apiClient.delete(`/profile/representations/${encodeURIComponent(id)}`, {
      body: JSON.stringify(endedOn ? { ended_on: endedOn } : {}),
    }),
  // Dev/staging-only mock OAuth disconnect (mirrors the "Connect & Verify"
  // popup flow — /socials/oauth/mock/:platform — which is also dev-gated).
  disconnectSocialOauth: (platform) =>
    apiClient.post(`/socials/oauth/disconnect/${encodeURIComponent(platform)}`),
  requestGuardianConsent: (guardianEmail, { dateOfBirth } = {}) =>
    apiClient.post('/guardian-consent/request', {
      guardian_email: guardianEmail,
      ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
    }),
  getAgencyGuardianConsent: (agencyId, options) =>
    apiClient.get(`/guardian-consent/agency/${encodeURIComponent(agencyId)}`, options),
  requestAgencyGuardianConsent: (agencyId, guardianEmail) =>
    apiClient.post('/guardian-consent/request', {
      agency_id: agencyId,
      ...(guardianEmail ? { guardian_email: guardianEmail } : {}),
    }),
  // Availability + bookouts (Discover WS9 talent-side surfaces)
  getAvailability: () => apiClient.get('/availability'),
  updateAvailability: (status) => apiClient.put('/availability', { status }),
  getBookouts: () => apiClient.get('/bookouts'),
  createBookout: (data) => apiClient.post('/bookouts', data),
  deleteBookout: (id) => apiClient.delete(`/bookouts/${encodeURIComponent(id)}`),
  // Stats-currency one-tap nudge — touches measurements_updated_at only.
  confirmMeasurementsCurrent: () => apiClient.post('/measurements/still-accurate', {}),
  getAgeVerification: (options) => apiClient.get('/age-verification', options),
  createAgeVerificationSession: () => apiClient.post('/age-verification/session', { consent: true }),
  getAdultContext: (options) => apiClient.get('/adult-context', options),
  updateAdultContext: (data) => apiClient.put('/adult-context', data),

  refineBio: (body) => apiClient.post('/bio/refine', body),
  generateBio: (body = {}) => apiClient.post('/bio/generate', body),
  formatTrainingSummary: (body) => apiClient.post('/training-summary/format', body),
  summarizeTrainingSummary: (body) => apiClient.post('/training-summary/summarize', body),
  expandTrainingSummary: (body = {}) => apiClient.post('/training-summary/expand', body),
  draftSubmissionNote: (body = {}) => apiClient.post('/submission-note/draft', body),
  sharpenSubmissionNote: (body) => apiClient.post('/submission-note/sharpen', body),
  shortenSubmissionNote: (body) => apiClient.post('/submission-note/shorten', body),

  // Digitals freshness — the four states, and the one action that resolves
  // `undated`. A shoot date is never inferred; it comes from the talent here.
  getDigitalsFreshness: (options) => apiClient.get('/digitals/freshness', options),
  setDigitalsCaptureDate: (imageIds, capturedOn) =>
    apiClient.put('/digitals/capture-date', { imageIds, capturedOn }),

  // Comp card import — read an existing agency card into a reviewable pre-fill.
  // The card itself is never stored; `importCompCard` returns a proposal and
  // `confirmCompCardImport` applies only the fields the talent accepted.
  importCompCard: (formData) => apiClient.post('/comp-card-import', formData),
  getCompCardImport: (id) => apiClient.get(`/comp-card-import/${encodeURIComponent(id)}`),
  confirmCompCardImport: (id, accepted) =>
    apiClient.post(`/comp-card-import/${encodeURIComponent(id)}/confirm`, { accepted }),
  discardCompCardImport: (id) =>
    apiClient.post(`/comp-card-import/${encodeURIComponent(id)}/discard`),

  // Media
  uploadMedia: (formData) => apiClient.post('/media', formData),
  reorderMedia: (imageIds) => apiClient.put('/media/reorder', { imageIds }),
  /** @param {object} data — May include `metadata` plus structured fields: image_type, shot_type, style_type, status, exclude_from_public, exclude_from_agency, captured_at, retouched_at, set_id */
  updateMedia: (id, data) => apiClient.put(`/media/${id}`, data),
  getMediaSets: () => apiClient.get('/media/sets'),
  createMediaSet: (payload) => apiClient.post('/media/sets', payload),
  setCurrentMediaSet: (setId) => apiClient.patch(`/media/sets/${setId}/current`, {}),
  getImageRights: (id) => apiClient.get(`/media/${id}/rights`),
  updateImageRights: (id, data) => apiClient.put(`/media/${id}/rights`, data),
  // Model release artifact (P1 #6) — { release: {..., on_file} }
  getModelRelease: (id) => apiClient.get(`/media/${id}/model-release`),
  updateModelRelease: (id, data) => apiClient.put(`/media/${id}/model-release`, data),
  // Motion / video asset by URL reference (P2 video) — body { video_url, video_mime?, video_duration_seconds?, captured_at?, label?, set_id?, image_type? }
  addVideoAsset: (data) => apiClient.post('/media/video', data),
  setHeroImage: (id) => apiClient.put(`/media/${id}/hero`),
  deleteMedia: (id) => apiClient.delete(`/media/${id}`),
  replaceImageFile: (id, formData) => apiClient.post(`/media/${id}/replace`, formData),
  restoreImageOriginal: (id) => apiClient.post(`/media/${id}/restore`, {}),
  getMediaClassificationStatus: () => apiClient.get('/media/classification-status'),
  bulkDeleteMedia: (imageIds) => apiClient.post('/media/bulk-delete', { imageIds }),
  bulkUpdateMedia: (imageIds, patch) => apiClient.post('/media/bulk-update', { imageIds, patch }),

  // Overview
  getOverview: () => apiClient.get('/overview'),

  // Analytics
  getAnalytics: (days) => apiClient.get(`/analytics${days ? `?days=${days}` : ''}`),
  getIntel: (days, tz) => {
    const params = new URLSearchParams();
    if (days) params.set('days', days);
    if (tz) params.set('tz', tz);
    return apiClient.get(`/intel${params.size ? `?${params.toString()}` : ''}`);
  },
  getIntelDay: (date) => apiClient.get(`/intel/day/${encodeURIComponent(date)}`),
  getActivity: () => apiClient.get('/activity'),

  // Notifications (high-signal bell center)
  getNotifications: (options = {}) => {
    const limit = options.limit ? `?limit=${options.limit}` : '';
    return apiClient.get(`/notifications${limit}`);
  },
  markNotificationRead: (id) =>
    apiClient.patch(`/notifications/${id}/read`, {}),
  markAllNotificationsRead: () =>
    apiClient.post('/notifications/read-all', {}),
  getSummary: () => apiClient.get('/summary'),
  // Applications
  getApplications: () => apiClient.get('/applications'),
  getApplicationQuota: () => apiClient.get('/applications/quota'),
  getApplicationActivity: (id) => apiClient.get(`/applications/${id}/activity`),
  getApplicationPromptContext: () => apiClient.get('/applications/prompt-context'),
  getAgencies: () => apiClient.get('/agencies'),
  getAgencyPrivacyDirectory: () => apiClient.get('/agencies?includeBlocked=1'),
  createApplication: (data) => apiClient.post('/applications', data),
  withdrawApplication: (id) => apiClient.post(`/applications/${id}/withdraw`),
  // Answering an event slot offer — the only two statuses a talent may write.
  // Never `withdrawApplication`: that redacts the package and hides the row
  // from an organizer who still has to fill the slot.
  // Funnel step 6 — best-effort instrumentation for the ApplySuccess payoff
  // block. Never surfaced to the applicant: a lost count is not their problem.
  recordApplyPayoffView: (id, action) =>
    apiClient
      .post(`/applications/${id}/payoff-viewed`, { action }, { skipRedirect: true })
      .catch(() => null),
  confirmApplicationSlot: (id) => apiClient.post(`/applications/${id}/confirm`),
  declineApplicationSlot: (id) => apiClient.post(`/applications/${id}/decline-slot`),
  getSubmissionProgramStatus: (options) =>
    apiClient.get('/applications/submission-program-status', options),
  acknowledgeSubmissionProgram: () =>
    apiClient.post('/applications/submission-program-acknowledgment', { acknowledged: true }),

  /*
   * Off-platform submission tracker — the talent's own private record of
   * submissions made outside Pholio. No agency ever reads these rows.
   *
   * The router answers `{ submissions: [...] }` / `{ submission: {...} }`
   * inside the standard envelope, which `apiClient` has already unwrapped by
   * the time these run; the array/object fallbacks keep a bare payload working
   * too. Lapse is never stored — every row arrives with server-computed
   * `isLapsed` / `lapseDate` / `reapplyOpensOn` (ruling R1), so the client only
   * ever formats them.
   */
  listTrackedSubmissions: async () => {
    const data = await apiClient.get('/tracker');
    return Array.isArray(data) ? data : data?.submissions || [];
  },
  logTrackedSubmission: async (payload) => {
    const data = await apiClient.post('/tracker', payload);
    return data?.submission || data;
  },
  /**
   * Send only the fields that actually change: a PATCH carrying the status the
   * row already has is rejected as "No editable fields were provided." (422).
   */
  updateTrackedSubmission: async (id, payload) => {
    const data = await apiClient.patch(`/tracker/${encodeURIComponent(id)}`, payload);
    return data?.submission || data;
  },
  // Hard delete (ruling R9) — confirm before calling.
  deleteTrackedSubmission: (id) => apiClient.delete(`/tracker/${encodeURIComponent(id)}`),

  // Curated recurring open-call windows. Ungated, free, no counters.
  listCallWindows: async () => {
    const data = await apiClient.get('/call-windows');
    return Array.isArray(data) ? data : data?.callWindows || [];
  },

  // Published agency requirements and score-free package preflight.
  getSpecRegistryRoutes: ({ agencyId } = {}) =>
    apiClient.get(
      `/spec-registry/routes${agencyId ? `?agencyId=${encodeURIComponent(agencyId)}` : ''}`,
    ),
  getSpecRegistryRoute: (seriesId) =>
    apiClient.get(`/spec-registry/routes/${encodeURIComponent(seriesId)}`),
  preflightSpecRegistry: (payload = {}) =>
    apiClient.post('/spec-registry/preflight', payload),

  /**
   * The spec-correct set, as bytes.
   *
   * `apiClient` unwraps a `{ success, data }` envelope, and this response is an
   * archive, so it talks to `fetch` directly. The filename comes from the
   * server because the server is what named the files inside it.
   */
  exportSpecRegistrySet: async ({ seriesId, imageIds } = {}) => {
    const response = await fetch('/api/talent/spec-registry/export', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/zip, application/json',
        ...sameOriginMutationHeaders('POST'),
      },
      body: JSON.stringify(imageIds === undefined ? { seriesId } : { seriesId, imageIds }),
    });

    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      throw new ApiError(
        problem?.message || problem?.error || 'That set could not be prepared.',
        response.status,
        problem,
      );
    }

    const named = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '');
    return {
      blob: await response.blob(),
      filename: named?.[1] || 'digitals.zip',
      fileCount: Number(response.headers.get('X-Pholio-Export-Files')) || null,
    };
  },

  /**
   * The talent followed the link to the agency's own application page.
   *
   * Fired alongside opening the link rather than through a Pholio redirect —
   * routing an application Pholio has nothing to do with through Pholio is the
   * implied relationship the provenance rules exist to avoid.
   */
  recordSpecRegistryOutboundClick: (seriesId) =>
    apiClient.post('/spec-registry/outbound-click', { seriesId }),

  // Application drafts (one per agency — the in-progress submission dossier)
  listDrafts: (options) =>
    apiClient.get('/applications/drafts', options),
  getLatestDraft: (options) =>
    apiClient.get('/applications/drafts/latest', options),
  getDraft: (agencyId, options) =>
    apiClient.get(`/applications/drafts/${agencyId}`, options),
  saveDraft: (agencyId, draft, options) =>
    apiClient.put(`/applications/drafts/${agencyId}`, draft, options),
  deleteDraft: (
    agencyId,
    { expectedVersion, expectedGeneration } = {},
    options = {},
  ) =>
    apiClient.delete(`/applications/drafts/${encodeURIComponent(agencyId)}`, {
      ...options,
      body: JSON.stringify({ expectedVersion, expectedGeneration }),
    }),
  recoverDraft: (
    agencyId,
    { expectedGeneration } = {},
    options,
  ) =>
    apiClient.post(
      `/applications/drafts/${encodeURIComponent(agencyId)}/recover`,
      { expectedGeneration },
      options,
    ),

  // Messages (per application)
  getApplicationMessages: (id) => apiClient.get(`/applications/${id}/messages`),
  sendApplicationMessage: (id, message) =>
    apiClient.post(`/applications/${id}/messages`, { message }),

  // Messages (unified inbox across every conversation)
  getMessageThreads: (options) => apiClient.get('/messages/threads', options),
  getMessagesUnreadCount: (options) =>
    apiClient.get('/messages/unread-count', options),
  
  setDiscoverability: (isDiscoverable) => apiClient.post('/discoverability', { isDiscoverable }), // Logic moved to proper endpoint

  // Settings
  getSettings: () => apiClient.get('/settings'),
  updateSettings: (data) => apiClient.put('/settings', data),
  getLegalStatus: (options) => apiClient.get('/settings/legal-status', options),
  acceptLegalTerms: (body) => apiClient.post('/settings/legal-acceptance', body),
  requestDataExport: () => apiClient.post('/settings/data-export', {}),
  deactivateAccount: () => apiClient.post('/settings/deactivate', {}),
  deleteAccount: () => apiClient.delete('/settings/account'),
  revokeSession: (id) => apiClient.delete(`/settings/sessions/${encodeURIComponent(id)}`),
  revokeOtherSessions: () => apiClient.delete('/settings/sessions'),

  // PDF
  getPdfCustomization: () => apiClient.get('/pdf-customization'),
  updatePdfCustomization: (data) => apiClient.put('/pdf-customization', data),

  // Image role tagging (comp card)
  updateImageRole: (id, role) => apiClient.patch(`/media/${id}/role`, { role }),

  // Comp-card library (saved named variants — comp_card_presets). These live on
  // the PDF router (`/api/pdf/presets/:slug`), not under `/api/talent`, and
  // return raw `{ ok, presets|preset }` envelopes (not `{ success, data }`).
  // A preset renders via `/pdf/view/:slug` with the preset's saved query
  // (seed + locked hero/grid). "Default" is the most-recently-used preset:
  // setDefault bumps `last_used_at` via the apply endpoint.
  listCompCardPresets: (slug, options) =>
    apiClient.get(`/presets/${encodeURIComponent(slug)}`, { baseURL: '/api/pdf', ...options }),
  saveCompCardPreset: (slug, payload) =>
    apiClient.post(`/presets/${encodeURIComponent(slug)}`, payload, { baseURL: '/api/pdf' }),
  renameCompCardPreset: (slug, presetId, payload) =>
    apiClient.put(`/presets/${encodeURIComponent(slug)}/${encodeURIComponent(presetId)}`, payload, { baseURL: '/api/pdf' }),
  deleteCompCardPreset: (slug, presetId) =>
    apiClient.delete(`/presets/${encodeURIComponent(slug)}/${encodeURIComponent(presetId)}`, { baseURL: '/api/pdf' }),
  setDefaultCompCardPreset: (slug, presetId) =>
    apiClient.post(`/presets/${encodeURIComponent(slug)}/${encodeURIComponent(presetId)}/apply`, {}, { baseURL: '/api/pdf' }),

  // Message Polish — free to every talent, rate-limited server-side
  polishApplicationMessage: (body) =>
    apiClient.post('/message-polish/polish', body),

  // Stripe (root `/stripe` route on API host, not under /api/talent)
  createCheckoutSession: (body = {}) =>
    apiClient.post(
      '/create-checkout-session',
      { interval: 'monthly', ...body },
      { baseURL: '/stripe' },
    ),

  // One-shot marker for the post-unlock celebration (ProfileUnlockExperience)
  markUnlockCelebrated: () => apiClient.post('/unlock-celebrated', {}),
};
