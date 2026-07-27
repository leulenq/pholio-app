/**
 * Agency API Client
 * Handles all API calls for agency dashboard
 */

import { sameOriginMutationHeaders } from '../../../shared/lib/same-origin-request';

const BASE_URL = '/api/agency';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Generic fetch wrapper
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  const defaultHeaders = {
    'Accept': 'application/json',
  };

  // Only add Content-Type if we're not sending FormData
  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    credentials: 'include',
    headers: {
      ...defaultHeaders,
      ...options.headers,
      ...sameOriginMutationHeaders(options.method),
    },
  };

  try {
    const response = await fetch(url, config);

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (response.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      }

      throw new ApiError(
        (data && data.error?.message) || (data && data.error) || (data && data.message) || 'Authentication required',
        response.status,
        data
      );
    }

    if (response.status === 403 && data?.redirect && typeof window !== 'undefined') {
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (currentPath !== data.redirect) {
        window.location.assign(data.redirect);
      }
    }

    if (!response.ok) {
      throw new ApiError(
        (data && data.error?.message) || (data && data.error) || (data && data.message) || response.statusText || 'API Error',
        response.status,
        data
      );
    }

    // Unwrap standardized response
    if (data && data.success === true && data.data !== undefined) {
      return data.data;
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.message || 'Network error', 0, null);
  }
}

const apiClient = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  patch: (endpoint, body) => request(endpoint, {
    method: 'PATCH',
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  put: (endpoint, body) => request(endpoint, {
    method: 'PUT',
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

// ============================================================================
// Agency API Methods
// ============================================================================

/**
 * Get agency overview dashboard payload
 */
export async function getAgencyOverview() {
  return apiClient.get('/overview');
}

export async function getAgencyLegalStatus() {
  return apiClient.get('/legal-status');
}

export async function acceptAgencyLegalPolicies(acceptance) {
  return apiClient.post('/legal-acceptance', acceptance);
}

/**
 * Get recent applicants
 */
export async function getRecentApplicants(limit = 5) {
  const data = await apiClient.get(`/overview/recent-applicants?limit=${limit}`);
  return data?.applicants || [];
}

/**
 * Get all applicants with filters
 */
export async function getApplicants(params = {}) {
  // Convert tags array to comma-separated string for backend
  const processedParams = { ...params };
  if (Array.isArray(processedParams.tags)) {
    processedParams.tags = processedParams.tags.join(',');
  }

  const queryString = new URLSearchParams(processedParams).toString();
  return apiClient.get(`/applications${queryString ? '?' + queryString : ''}`);
}

/**
 * Get single application details
 */
export async function getApplication(applicationId) {
  return apiClient.get(`/applications/${applicationId}`);
}

/**
 * Accept application
 */
export async function acceptApplication(applicationId) {
  return apiClient.post(`/applications/${applicationId}/accept`);
}

/**
 * Decline application
 */
export async function declineApplication(applicationId) {
  return apiClient.post(`/applications/${applicationId}/decline`);
}

/**
 * Shortlist an application (move to shortlisted status).
 */
export async function shortlistApplication(applicationId) {
  return apiClient.patch(`/applications/${applicationId}/status`, { status: 'shortlisted' });
}

/**
 * Keep an application on file (soft outcome — future consideration, not a hard decline).
 */
export async function keepOnFileApplication(applicationId) {
  return apiClient.patch(`/applications/${applicationId}/status`, { status: 'kept_on_file' });
}

/**
 * Request more from a submission (more digitals / specific shots / in-person) — an
 * advancing state, not a decision.
 */
export async function requestMoreApplication(applicationId) {
  return apiClient.patch(`/applications/${applicationId}/status`, { status: 'requested_more' });
}

/**
 * Invite the talent to a meeting / go-see — the advancing step before a signing decision.
 */
export async function requestMeetingApplication(applicationId) {
  return apiClient.patch(`/applications/${applicationId}/status`, { status: 'meeting_requested' });
}

/**
 * Offer a New Face development relationship before full representation.
 */
export async function offerDevelopmentApplication(applicationId) {
  return apiClient.patch(`/applications/${applicationId}/status`, { status: 'development' });
}

/**
 * Archive application
 */
export async function archiveApplication(applicationId) {
  return apiClient.post(`/applications/${applicationId}/archive`);
}

/**
 * Get discoverable talent.
 * @param {object} params - { q, limit, include_outside_spec } (launch mode) or
 *   legacy filter params. Empty values are dropped so the URL stays clean.
 */
export async function getDiscoverableTalent(params = {}) {
  const clean = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    clean[k] = v;
  }
  const queryString = new URLSearchParams(clean).toString();
  return apiClient.get(`/discover${queryString ? '?' + queryString : ''}`);
}

/**
 * Get profile preview (quick view)
 */
export async function getProfilePreview(profileId) {
  return apiClient.get(`/discover/${profileId}/preview`);
}

/**
 * Get full profile details for a discoverable talent (Discover + Roster via separate endpoint)
 */
export async function fetchProfileDetails(profileId) {
  return apiClient.get(`/profiles/${profileId}/details`);
}

/**
 * Get full application details (Applicants + Overview contexts)
 * NOTE: Do NOT use getApplication() — it hits /applications/:id (no details), this hits /applications/:id/details
 */
export async function getApplicationDetails(applicationId) {
  return apiClient.get(`/applications/${applicationId}/details`);
}

/**
 * The talent dossier — the aggregate read behind the expanded talent view.
 * One request carries identity, canonical stats, representation, availability,
 * standing with this agency, the book, the submitted package, roster position,
 * and the working record. Unwrapped by apiClient to the `data` payload.
 */
export async function getTalentDossier(applicationId) {
  return apiClient.get(`/applications/${applicationId}/dossier`);
}

/**
 * Get full agency roster
 */
export async function fetchRoster(params = {}) {
  const queryString = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ).toString();
  return apiClient.get(`/roster${queryString ? `?${queryString}` : ''}`);
}

/**
 * Get roster profile — bypasses is_discoverable filter, includes booking stats
 */
export async function fetchRosterProfile(profileId) {
  return apiClient.get(`/roster/${profileId}`);
}

export async function createTalentRecord(data) {
  return apiClient.post('/talent-records', data);
}

export async function updateTalentRecord(recordId, data) {
  return apiClient.patch(`/talent-records/${recordId}`, data);
}

export async function updateRosterMembership(membershipId, data) {
  return apiClient.patch(`/roster-memberships/${membershipId}`, data);
}

export async function getCommitments({ start, end }) {
  return apiClient.get(`/commitments?${new URLSearchParams({ start, end })}`);
}

export async function createCommitment(data) {
  return apiClient.post('/commitments', data);
}

export async function updateCommitment(id, data) {
  return apiClient.patch(`/commitments/${id}`, data);
}

export async function confirmCommitment(id, releaseConflictIds = []) {
  return apiClient.post(`/commitments/${id}/confirm`, { releaseConflictIds });
}

export async function releaseCommitment(id) {
  return apiClient.delete(`/commitments/${id}`);
}

/**
 * Invite talent to apply. Pass the originating search's queryLogId so the
 * backend can attribute the invite back to the query (WS6.5 telemetry); it is
 * best-effort server-side and never blocks the invite.
 */
export async function inviteTalent(profileId, queryLogId = null) {
  return apiClient.post(
    `/discover/${profileId}/invite`,
    queryLogId ? { query_log_id: queryLogId } : {},
  );
}

/**
 * Get all boards
 */
/**
 * Season Report aggregates. The endpoint returns { success, analytics } (not
 * the standardized { success, data } envelope), so unwrap here.
 */
export async function getAgencyAnalytics(range = 90) {
  const res = await apiClient.get(`/analytics?range=${range}`);
  return res?.analytics || res;
}

export async function getBoards() {
  return apiClient.get('/boards');
}

/**
 * Get casting pipeline candidates for a board
 */
export async function getCastingBoardPipeline(boardId) {
  return apiClient.get(`/boards/${boardId}/candidates`);
}

/**
 * Rank a board's applicants with the Fit Briefs decision-support engine.
 * This is decision support, not a decision — the response includes an explanatory
 * case for / against each candidate, an eligibility split, and a required disclosure
 * notice. `opts` may set { withCases, withReasoning } to include past-case context
 * and the optional AI read.
 */
export async function rankBoard(boardId, opts = {}) {
  const body = {};
  if (opts.withCases) body.withCases = true;
  if (opts.withReasoning) body.withReasoning = true;
  return apiClient.post(`/boards/${boardId}/rank`, body);
}

/**
 * Create board
 */
export async function createBoard(boardData) {
  return apiClient.post('/boards', boardData);
}

/**
 * Update a casting application stage/status
 */
export async function updateCastingApplicationStage(applicationId, payload) {
  return apiClient.patch(`/applications/${applicationId}/status`, payload);
}

/**
 * Bulk update casting application stages/statuses
 */
export async function bulkUpdateCastingApplicationStage(applicationIds, payload) {
  return apiClient.patch('/applications/bulk-status', {
    applicationIds,
    ...payload,
  });
}

/**
 * Update board
 */
export async function updateBoard(boardId, boardData) {
  return apiClient.patch(`/boards/${boardId}`, boardData);
}

/**
 * Delete board
 */
export async function deleteBoard(boardId) {
  return apiClient.delete(`/boards/${boardId}`);
}

/**
 * Upload a board identity image (client logo or cover visual).
 * kind: 'logo' (PNG/SVG) | 'cover' (JPEG/PNG/WebP). Returns { path }.
 */
export async function uploadBoardIdentityImage(boardId, file, kind) {
  const formData = new FormData();
  formData.append('image', file);
  // kind travels in the query string so the server can pick the right upload
  // pipeline before parsing the multipart body.
  return apiClient.post(`/boards/${boardId}/identity-image?kind=${encodeURIComponent(kind)}`, formData);
}

/**
 * Add applicant to board
 */
export async function addToBoard(boardId, applicationId) {
  return apiClient.post(`/boards/${boardId}/applications/${applicationId}`);
}

/**
 * Assign an application to a board (real endpoint; moves it onto the board).
 */
export async function assignToBoard(applicationId, boardId) {
  return apiClient.post(`/applications/${applicationId}/assign-board`, { board_id: boardId });
}

/**
 * Remove applicant from board
 */
export async function removeFromBoard(boardId, applicationId) {
  return apiClient.delete(`/boards/${boardId}/applications/${applicationId}`);
}

/**
 * Get current agency user
 */
export async function getAgencyProfile() {
  return apiClient.get('/me');
}

/**
 * Complete first-login onboarding for the current agency
 */
export async function completeAgencyOnboarding() {
  return apiClient.post('/onboarding/complete', {});
}

/**
 * Update agency profile
 */
export async function updateAgencyProfile(data) {
  return apiClient.put('/profile', data);
}

/**
 * Update agency branding (logo and color)
 */
export async function updateAgencyBranding(formData) {
  return request('/branding', {
    method: 'POST',
    body: formData, // FormData for file upload
  });
}

/**
 * Update agency settings (notifications)
 */
export async function updateAgencySettings(settings) {
  return apiClient.put('/settings', settings);
}

/**
 * Get agency team members
 */
export async function getAgencyTeam() {
  return apiClient.get('/team');
}

/**
 * Add an existing agency login to the team
 */
export async function addAgencyTeamMember(payload) {
  return apiClient.post('/team', payload);
}

/**
 * Update a team member role
 */
export async function updateAgencyTeamMember(membershipId, payload) {
  return apiClient.patch(`/team/${membershipId}`, payload);
}

/**
 * Deactivate a team member
 */
export async function removeAgencyTeamMember(membershipId) {
  return apiClient.delete(`/team/${membershipId}`);
}

/**
 * Get effective + custom permissions for a team member
 */
export async function getTeamMemberPermissions(membershipId) {
  return apiClient.get(`/team/${membershipId}/permissions`);
}

/**
 * Apply custom ALLOW/DENY permission grants
 */
export async function updateTeamMemberPermissions(membershipId, grants) {
  return apiClient.put(`/team/${membershipId}/permissions`, { grants });
}

/**
 * Revoke a custom permission grant
 */
export async function revokeTeamMemberPermission(membershipId, permissionKey, effect = 'ALLOW') {
  const query = effect ? `?effect=${encodeURIComponent(effect)}` : '';
  return apiClient.delete(`/team/${membershipId}/permissions/${permissionKey}${query}`);
}

// ============================================================================
// Notes API
// ============================================================================

/**
 * Get notes for an application
 */
export async function getNotes(applicationId) {
  return apiClient.get(`/applications/${applicationId}/notes`);
}

/**
 * Create a new note
 */
export async function createNote(applicationId, note) {
  return apiClient.post(`/applications/${applicationId}/notes`, { note });
}

/**
 * Update a note
 */
export async function updateNote(applicationId, noteId, note) {
  return apiClient.put(`/applications/${applicationId}/notes/${noteId}`, { note });
}

/**
 * Delete a note
 */
export async function deleteNote(applicationId, noteId) {
  return apiClient.delete(`/applications/${applicationId}/notes/${noteId}`);
}

// ============================================================================
// Tags API
// ============================================================================

/**
 * Get all unique tags for this agency
 */
export async function getAllTags() {
  return apiClient.get('/tags');
}

/**
 * Get tags for an application
 */
export async function getTags(applicationId) {
  return apiClient.get(`/applications/${applicationId}/tags`);
}

/**
 * Add a tag to an application
 */
export async function addTag(applicationId, tag, color = null) {
  return apiClient.post(`/applications/${applicationId}/tags`, { tag, color });
}

/**
 * Remove a tag from an application
 */
export async function removeTag(applicationId, tagId) {
  return apiClient.delete(`/applications/${applicationId}/tags/${tagId}`);
}

// ============================================================================
// Timeline API
// ============================================================================

/**
 * Get activity timeline for an application
 */
export async function getTimeline(applicationId) {
  return apiClient.get(`/applications/${applicationId}/timeline`);
}

// ============================================================================
// Bulk Operations API
// ============================================================================

/**
 * Bulk accept applications
 */
export async function bulkAcceptApplications(applicationIds) {
  return apiClient.post('/applications/bulk-accept', { applicationIds });
}

/**
 * Bulk decline applications
 */
export async function bulkDeclineApplications(applicationIds) {
  return apiClient.post('/applications/bulk-decline', { applicationIds });
}

/**
 * Bulk archive applications
 */
export async function bulkArchiveApplications(applicationIds) {
  return apiClient.post('/applications/bulk-archive', { applicationIds });
}

/**
 * Bulk add tag to applications
 */
export async function bulkAddTag(applicationIds, tag, color = null) {
  return apiClient.post('/applications/bulk-tag', { applicationIds, tag, color });
}

/**
 * Bulk remove tag from applications
 */
export async function bulkRemoveTag(applicationIds, tag) {
  return apiClient.post('/applications/bulk-remove-tag', { applicationIds, tag });
}

// ============================================================================
// Messaging API
// ============================================================================

/**
 * Get messages for an application
 */
export async function getMessages(applicationId) {
  return apiClient.get(`/applications/${applicationId}/messages`);
}

/**
 * Send message to talent
 */
export async function sendMessage(applicationId, message, attachmentUrl = null) {
  return apiClient.post(`/applications/${applicationId}/messages`, {
    message,
    attachment_url: attachmentUrl
  });
}

/**
 * Mark message as read
 */
export async function markMessageAsRead(messageId) {
  return apiClient.post(`/messages/${messageId}/read`);
}

/**
 * Mark every visible talent message as read
 */
export async function markAllMessagesAsRead() {
  return apiClient.post('/messages/read-all');
}

/**
 * Get message threads (inbox)
 */
export async function getMessageThreads() {
  return apiClient.get('/messages/threads');
}

/**
 * Get unread message count
 */
export async function getUnreadMessageCount() {
  return apiClient.get('/messages/unread-count');
}

/**
 * Get global agency activity feed
 */
export async function getAgencyActivity(limit) {
  return apiClient.get(`/activity${limit ? `?limit=${limit}` : ''}`);
}

// ============================================================================
// Filter Presets API
// ============================================================================

/**
 * Get all filter presets
 */
export async function getFilterPresets() {
  return apiClient.get('/filter-presets');
}

/**
 * Create filter preset
 */
export async function createFilterPreset(name, filters) {
  return apiClient.post('/filter-presets', { name, filters });
}

/**
 * Update filter preset
 */
export async function updateFilterPreset(id, data) {
  return apiClient.put(`/filter-presets/${id}`, data);
}

/**
 * Delete filter preset
 */
export async function deleteFilterPreset(id) {
  return apiClient.delete(`/filter-presets/${id}`);
}

/**
 * Set preset as default
 */
export async function setDefaultPreset(id) {
  return apiClient.put(`/filter-presets/${id}/set-default`);
}

// ============================================================================
// Interview Scheduling API
// ============================================================================

/**
 * Schedule interview with talent
 */
export async function scheduleInterview(applicationId, interviewData) {
  return apiClient.post(`/applications/${applicationId}/interviews`, interviewData);
}

/**
 * Get all interviews for agency
 */
export async function getInterviews(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  return apiClient.get(`/interviews${queryString ? '?' + queryString : ''}`);
}

/**
 * Get interviews for specific application
 */
export async function getApplicationInterviews(applicationId) {
  return apiClient.get(`/applications/${applicationId}/interviews`);
}

/**
 * Update/reschedule interview
 */
export async function updateInterview(interviewId, updates) {
  return apiClient.patch(`/interviews/${interviewId}`, updates);
}

/**
 * Cancel interview
 */
export async function cancelInterview(interviewId) {
  return apiClient.delete(`/interviews/${interviewId}`);
}

// ============================================================================
// Reminders API
// ============================================================================

/**
 * Create reminder
 */
export async function createReminder(applicationId, reminderData) {
  return apiClient.post(`/applications/${applicationId}/reminders`, reminderData);
}

/**
 * Get all reminders for agency
 */
export async function getReminders(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  return apiClient.get(`/reminders${queryString ? '?' + queryString : ''}`);
}

/**
 * Get due reminders count
 */
export async function getDueRemindersCount() {
  return apiClient.get('/reminders/due');
}

/**
 * Get reminders for specific application
 */
export async function getApplicationReminders(applicationId) {
  return apiClient.get(`/applications/${applicationId}/reminders`);
}

/**
 * Update reminder
 */
export async function updateReminder(reminderId, updates) {
  return apiClient.patch(`/reminders/${reminderId}`, updates);
}

/**
 * Mark reminder as completed
 */
export async function completeReminder(reminderId) {
  return apiClient.post(`/reminders/${reminderId}/complete`);
}

/**
 * Snooze reminder
 */
export async function snoozeReminder(reminderId, snoozeUntil) {
  return apiClient.post(`/reminders/${reminderId}/snooze`, { snooze_until: snoozeUntil });
}

/**
 * Delete reminder
 */
export async function deleteReminder(reminderId) {
  return apiClient.delete(`/reminders/${reminderId}`);
}

export async function getAgencyNotifications(options = {}) {
  const limit = options.limit ? `?limit=${options.limit}` : '';
  return apiClient.get(`/notifications${limit}`);
}

export async function markAgencyNotificationRead(id) {
  return apiClient.patch(`/notifications/${id}/read`, {});
}

export async function markAllAgencyNotificationsRead() {
  return apiClient.post('/notifications/read-all', {});
}

/**
 * Open call links — agency-controlled entry links whose invited submissions
 * are exempt from the talent's monthly discovery limit.
 */
export async function getOpenCallLinks() {
  return apiClient.get('/open-call/links');
}

export async function createOpenCallLink(label) {
  return apiClient.post('/open-call/links', { label });
}

export async function updateOpenCallLink(linkId, payload) {
  return apiClient.patch(`/open-call/links/${linkId}`, payload);
}

export default {
  getAgencyOverview,
  getAgencyLegalStatus,
  acceptAgencyLegalPolicies,
  getRecentApplicants,
  getApplicants,
  getApplication,
  acceptApplication,
  declineApplication,
  shortlistApplication,
  keepOnFileApplication,
  requestMoreApplication,
  requestMeetingApplication,
  archiveApplication,
  getDiscoverableTalent,
  getProfilePreview,
  fetchProfileDetails,
  getApplicationDetails,
  getTalentDossier,
  fetchRoster,
  fetchRosterProfile,
  inviteTalent,
  getBoards,
  getCastingBoardPipeline,
  rankBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  uploadBoardIdentityImage,
  addToBoard,
  removeFromBoard,
  getAgencyProfile,
  updateAgencyProfile,
  updateAgencyBranding,
  updateAgencySettings,
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  getAllTags,
  getTags,
  addTag,
  removeTag,
  getTimeline,
  bulkAcceptApplications,
  bulkDeclineApplications,
  bulkArchiveApplications,
  bulkAddTag,
  bulkRemoveTag,
  getOpenCallLinks,
  createOpenCallLink,
  updateOpenCallLink,
};
