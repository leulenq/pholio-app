/**
 * Talent API Functions
 */
import { apiClient } from '../../../shared/lib/api-client';

export const talentApi = {
  // Profile
  getProfile: (options) => apiClient.get('/profile', options),
  updateProfile: (data) => apiClient.put('/profile', data),
  saveFitScores: (data) => apiClient.post('/profile/fit-scores', data),
  requestGuardianConsent: (guardianEmail, { dateOfBirth } = {}) =>
    apiClient.post('/guardian-consent/request', {
      guardian_email: guardianEmail,
      ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
    }),
  refineBio: (body) => apiClient.post('/bio/refine', body),
  generateBio: (body = {}) => apiClient.post('/bio/generate', body),
  formatTrainingSummary: (body) => apiClient.post('/training-summary/format', body),
  summarizeTrainingSummary: (body) => apiClient.post('/training-summary/summarize', body),
  expandTrainingSummary: (body = {}) => apiClient.post('/training-summary/expand', body),
  draftSubmissionNote: (body = {}) => apiClient.post('/submission-note/draft', body),
  sharpenSubmissionNote: (body) => apiClient.post('/submission-note/sharpen', body),
  shortenSubmissionNote: (body) => apiClient.post('/submission-note/shorten', body),

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

  // Overview
  getOverview: () => apiClient.get('/overview'),

  // Analytics
  getAnalytics: (days) => apiClient.get(`/analytics${days ? `?days=${days}` : ''}`),
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
  getTimeseries: (days = 30) => apiClient.get(`/timeseries?days=${days}`),
  getSessions: (days = 30) => apiClient.get(`/sessions?days=${days}`),
  getCohorts: () => apiClient.get('/cohorts'),
  getInsights: () => apiClient.get('/insights'),

  // Applications
  getApplications: () => apiClient.get('/applications'),
  getApplicationActivity: (id) => apiClient.get(`/applications/${id}/activity`),
  getApplicationPromptContext: () => apiClient.get('/applications/prompt-context'),
  getAgencies: () => apiClient.get('/agencies'),
  createApplication: (data) => apiClient.post('/applications', data),
  withdrawApplication: (id) => apiClient.post(`/applications/${id}/withdraw`),
  getSubmissionProgramStatus: (options) =>
    apiClient.get('/applications/submission-program-status', options),
  acknowledgeSubmissionProgram: () =>
    apiClient.post('/applications/submission-program-acknowledgment', { acknowledged: true }),

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

  // Interviews
  getInterviews: () => apiClient.get('/interviews'),
  respondToInterview: (id, body) => apiClient.post(`/interviews/${id}/respond`, body),

  // Messages (per application)
  getApplicationMessages: (id) => apiClient.get(`/applications/${id}/messages`),
  sendApplicationMessage: (id, message) =>
    apiClient.post(`/applications/${id}/messages`, { message }),
  
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

  // Message Polish (Studio+)
  polishApplicationMessage: (body) =>
    apiClient.post('/message-polish/polish', body),

  // Stripe (root `/stripe` route on API host, not under /api/talent)
  createCheckoutSession: (body = {}) =>
    apiClient.post(
      '/create-checkout-session',
      { interval: 'monthly', ...body },
      { baseURL: '/stripe' },
    ),
};
