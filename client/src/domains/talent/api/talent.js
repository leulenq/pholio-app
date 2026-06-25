/**
 * Talent API Functions
 */
import { apiClient } from '../../../shared/lib/api-client';

export const talentApi = {
  // Profile
  getProfile: (options) => apiClient.get('/profile', options),
  updateProfile: (data) => apiClient.put('/profile', data),
  saveFitScores: (data) => apiClient.post('/profile/fit-scores', data),
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
  requestDataExport: () => apiClient.post('/settings/data-export', {}),
  requestDataErasure: () => apiClient.post('/settings/erasure-request', {}),
  deactivateAccount: () => apiClient.post('/settings/deactivate', {}),
  deleteAccount: () => apiClient.delete('/settings/account'),
  revokeSession: (id) => apiClient.delete(`/settings/sessions/${encodeURIComponent(id)}`),

  // PDF
  getPdfCustomization: () => apiClient.get('/pdf-customization'),
  updatePdfCustomization: (data) => apiClient.put('/pdf-customization', data),

  // Image role tagging (comp card)
  updateImageRole: (id, role) => apiClient.patch(`/media/${id}/role`, { role }),

  // Message Polish (Studio+)
  polishApplicationMessage: (body) =>
    apiClient.post('/message-polish/polish', body),

  // Stripe (root `/stripe` route on API host, not under /api/talent)
  createCheckoutSession: () =>
    apiClient.post('/create-checkout-session', {}, { baseURL: '/stripe' }),
};
