import { apiClient } from './client';

export const publicApi = {
  getHome: () => apiClient.get('/home', { baseURL: '/api/public' }),
  getPro: () => apiClient.get('/pro', { baseURL: '/api/public' }),
};
