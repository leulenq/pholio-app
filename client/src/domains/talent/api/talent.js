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

  // Overview
  getOverview: () => apiClient.get('/overview'),

  // Analytics
  getAnalytics: (days) => apiClient.get(`/analytics${days ? `?days=${days}` : ''}`),
  getActivity: () => apiClient.get('/activity'),
  getSummary: () => apiClient.get('/summary'),
  getTimeseries: (days = 30) => apiClient.get(`/timeseries?days=${days}`),
  getSessions: (days = 30) => apiClient.get(`/sessions?days=${days}`),
  getCohorts: () => apiClient.get('/cohorts'),
  getInsights: () => apiClient.get('/insights'),

  // Applications
  getApplications: () => apiClient.get('/applications'),
  getApplicationPromptContext: () => apiClient.get('/applications/prompt-context'),
  getAgencies: () => apiClient.get('/agencies'),
  createApplication: (data) => apiClient.post('/applications', data),
  withdrawApplication: (id) => apiClient.post(`/applications/${id}/withdraw`),
  
  setDiscoverability: (isDiscoverable) => apiClient.post('/discoverability', { isDiscoverable }), // Logic moved to proper endpoint

  // Settings
  getSettings: () => apiClient.get('/settings'),
  updateSettings: (data) => apiClient.put('/settings', data),

  // PDF
  getPdfCustomization: () => apiClient.get('/pdf-customization'),
  updatePdfCustomization: (data) => apiClient.put('/pdf-customization', data),

  // Image role tagging (comp card)
  updateImageRole: (id, role) => apiClient.patch(`/media/${id}/role`, { role }),

  // Stripe (root `/stripe` route on API host, not under /api/talent)
  createCheckoutSession: () =>
    apiClient.post('/create-checkout-session', {}, { baseURL: '/stripe' }),
};
