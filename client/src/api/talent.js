/**
 * Talent API Functions
 */
import { apiClient } from '../shared/lib/api-client';

export const talentApi = {
  // Profile
  getProfile: (options) => apiClient.get('/profile', options),
  updateProfile: (data) => apiClient.put('/profile', data),

  // Media
  uploadMedia: (formData) => apiClient.post('/media', formData),
  reorderMedia: (imageIds) => apiClient.put('/media/reorder', { imageIds }),
  updateMedia: (id, data) => apiClient.put(`/media/${id}`, data),
  setHeroImage: (id) => apiClient.put(`/media/${id}/hero`),
  deleteMedia: (id) => apiClient.delete(`/media/${id}`),

  // Overview
  getOverview: () => apiClient.get('/overview'),

  // Analytics
  getAnalytics: (days) => apiClient.get(`/analytics${days ? `?days=${days}` : ''}`),
  getActivity: () => apiClient.get('/activity'),
  getSummary: () => apiClient.get('/summary'),
  getTimeseries: (days = 30) => apiClient.get(`/timeseries?days=${days}`),
  getSessions: (days = 30) => apiClient.get(`/analytics/sessions?days=${days}`),
  getCohorts: () => apiClient.get('/analytics/cohorts'),
  getInsights: () => apiClient.get('/analytics/insights'),

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
};
