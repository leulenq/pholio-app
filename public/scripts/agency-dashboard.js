/**
 * Agency Dashboard - Premium AI Studio
 * Comprehensive JavaScript for all interactive features
 */

(function() {
  'use strict';

  // Global state
  const state = {
    currentView: 'pipeline',
    selectedProfiles: new Set(),
    isBatchMode: false,
    dragState: null
  };

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('agency-dashboard')) return;
    
    initViewSwitcher();
    initKanbanDragDrop();
    initPreviewModal();
    initBatchOperations();
    initSearch();
    initFilters();
    initQuickActions();
    initScoutInvite();
    initNotesAndTags();
    initAgencyProfileAccordion();
    initExportData();
    
    // Load data from window if available
    if (window.AGENCY_DASHBOARD_DATA) {
      state.profiles = window.AGENCY_DASHBOARD_DATA.profiles || [];
      state.stats = window.AGENCY_DASHBOARD_DATA.stats || {};
    }
  });

  /**
   * View Mode Switcher
   */
  function initViewSwitcher() {
    const viewButtons = document.querySelectorAll('.agency-dashboard__view-btn');
    const views = document.querySelectorAll('.agency-dashboard__view');

    viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        
        // Update active button
        viewButtons.forEach(b => b.classList.remove('agency-dashboard__view-btn--active'));
        btn.classList.add('agency-dashboard__view-btn--active');
        
        // Show/hide views
        views.forEach(v => {
          if (v.id === `view-${view}`) {
            v.style.display = '';
          } else {
            v.style.display = 'none';
          }
        });
        
        state.currentView = view;
        saveViewPreference(view);
      });
    });

    // Load saved view preference
    const savedView = localStorage.getItem('agency-dashboard-view');
    if (savedView) {
      const btn = document.querySelector(`[data-view="${savedView}"]`);
      if (btn) btn.click();
    }
  }

  function saveViewPreference(view) {
    localStorage.setItem('agency-dashboard-view', view);
  }

  /**
   * Kanban Drag and Drop
   */
  function initKanbanDragDrop() {
    const cards = document.querySelectorAll('.agency-dashboard__card');
    const columns = document.querySelectorAll('.agency-dashboard__kanban-column');

    cards.forEach(card => {
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragend', handleDragEnd);
    });

    columns.forEach(column => {
      column.addEventListener('dragover', handleDragOver);
      column.addEventListener('drop', handleDrop);
      column.addEventListener('dragenter', handleDragEnter);
      column.addEventListener('dragleave', handleDragLeave);
    });
  }

  function handleDragStart(e) {
    state.dragState = {
      card: e.target,
      sourceColumn: e.target.closest('.agency-dashboard__kanban-column'),
      offsetX: e.offsetX,
      offsetY: e.offsetY
    };
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd(e) {
    e.target.style.opacity = '1';
    document.querySelectorAll('.agency-dashboard__kanban-column').forEach(col => {
      col.classList.remove('agency-dashboard__kanban-column--drag-over');
    });
    state.dragState = null;
  }

  function handleDragOver(e) {
    if (state.dragState) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function handleDragEnter(e) {
    if (state.dragState) {
      e.currentTarget.classList.add('agency-dashboard__kanban-column--drag-over');
    }
  }

  function handleDragLeave(e) {
    if (state.dragState) {
      e.currentTarget.classList.remove('agency-dashboard__kanban-column--drag-over');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    if (!state.dragState) return;

    const targetColumn = e.currentTarget;
    const targetStatus = targetColumn.dataset.status;
    const card = state.dragState.card;
    const profileId = card.dataset.profileId;

    // Move card to new column
    const cardsContainer = targetColumn.querySelector('.agency-dashboard__kanban-cards');
    cardsContainer.appendChild(card);

    // Update status via API
    updateApplicationStatus(profileId, targetStatus).then(() => {
      // Update card data attribute
      card.dataset.status = targetStatus;
      
      // Update badge
      const badge = card.querySelector('.agency-dashboard__badge--status');
      if (badge) {
        badge.className = `agency-dashboard__badge agency-dashboard__badge--status agency-dashboard__badge--${targetStatus}`;
        badge.textContent = targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1);
      }

      // Update column counts
      updateColumnCounts();
    }).catch(err => {
      console.error('Failed to update status:', err);
      // Revert card position
      state.dragState.sourceColumn.querySelector('.agency-dashboard__kanban-cards').appendChild(card);
    });

    targetColumn.classList.remove('agency-dashboard__kanban-column--drag-over');
    state.dragState = null;
  }

  function updateColumnCounts() {
    document.querySelectorAll('.agency-dashboard__kanban-column').forEach(column => {
      const count = column.querySelectorAll('.agency-dashboard__card').length;
      const countEl = column.querySelector('.agency-dashboard__kanban-count');
      if (countEl) countEl.textContent = count;
    });
  }

  /**
   * Application Detail Modal
   */
  function initPreviewModal() {
    const modal = document.getElementById('application-detail-modal');
    const overlay = modal?.querySelector('.agency-detail-modal__overlay');
    const closeBtn = document.getElementById('detail-modal-close');
    const previewButtons = document.querySelectorAll('.agency-dashboard__card-preview, .agency-dashboard__gallery-preview, .agency-dashboard__list-preview, .agency-dashboard__table-preview');
    const body = document.getElementById('detail-modal-body');
    const nameEl = document.getElementById('detail-modal-name');
    const subtitleEl = document.getElementById('detail-modal-subtitle');
    const portfolioLink = document.getElementById('detail-modal-portfolio-link');

    let currentApplicationId = null;
    let currentProfileSlug = null;

    // Open modal
    previewButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const applicationId = btn.dataset.applicationId;
        const profileId = btn.dataset.profileId;
        
        if (!applicationId) {
          // Fallback: open portfolio if no application ID
          const profile = state.profiles?.find(p => p.id === profileId);
          if (profile && profile.slug) {
            window.open(`/portfolio/${profile.slug}`, '_blank');
          }
          return;
        }

        currentApplicationId = applicationId;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Show loading state
        body.innerHTML = `
          <div class="agency-detail-modal__loading">
            <div class="agency-detail-modal__spinner"></div>
            <p>Loading application details...</p>
          </div>
        `;

        // Load application details
        try {
          const response = await fetch(`/api/agency/applications/${applicationId}/details`);
          if (response.ok) {
            const data = await response.json();
            renderApplicationDetails(data);
            currentProfileSlug = data.profile.slug;
            if (portfolioLink) {
              portfolioLink.href = `/portfolio/${data.profile.slug}`;
            }
          } else {
            const error = await response.json();
            body.innerHTML = `
              <div class="agency-detail-modal__error">
                <p>Failed to load application details: ${error.error || 'Unknown error'}</p>
                <button class="agency-detail-modal__btn agency-detail-modal__btn--primary" onclick="document.getElementById('application-detail-modal').style.display='none'">Close</button>
              </div>
            `;
          }
        } catch (error) {
          console.error('Load application details error:', error);
          body.innerHTML = `
            <div class="agency-detail-modal__error">
              <p>Failed to load application details. Please try again.</p>
              <button class="agency-detail-modal__btn agency-detail-modal__btn--primary" onclick="document.getElementById('application-detail-modal').style.display='none'">Close</button>
            </div>
          `;
        }
      });
    });

    // Close modal
    function closeModal() {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      currentApplicationId = null;
      currentProfileSlug = null;
    }

    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        closeModal();
      }
    });

    function renderApplicationDetails(data) {
      const { application, profile, notes, tags } = data;
      
      const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown';
      nameEl.textContent = fullName;
      subtitleEl.textContent = `Application ${application.status.charAt(0).toUpperCase() + application.status.slice(1)} • Applied ${formatDate(application.created_at)}`;

      // Format timeline events
      const timelineEvents = [];
      if (application.created_at) {
        timelineEvents.push({ type: 'created', date: application.created_at, label: 'Application submitted' });
      }
      if (application.viewed_at) {
        timelineEvents.push({ type: 'viewed', date: application.viewed_at, label: 'Viewed by agency' });
      }
      if (application.accepted_at) {
        timelineEvents.push({ type: 'accepted', date: application.accepted_at, label: 'Application accepted' });
      }
      if (application.declined_at) {
        timelineEvents.push({ type: 'declined', date: application.declined_at, label: 'Application declined' });
      }
      timelineEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Render images gallery
      const imagesHtml = profile.images && profile.images.length > 0
        ? `
          <div class="agency-detail-modal__images">
            <h3 class="agency-detail-modal__section-title">Portfolio Images</h3>
            <div class="agency-detail-modal__images-grid">
              ${profile.images.map(img => `
                <div class="agency-detail-modal__image-item">
                  <img src="${normalizeImagePath(img.path)}" alt="${img.label || 'Portfolio image'}" loading="lazy">
                </div>
              `).join('')}
            </div>
          </div>
        `
        : '';

      body.innerHTML = `
        <div class="agency-detail-modal__tabs">
          <button class="agency-detail-modal__tab agency-detail-modal__tab--active" data-tab="overview">Overview</button>
          <button class="agency-detail-modal__tab" data-tab="timeline">Timeline</button>
          <button class="agency-detail-modal__tab" data-tab="notes">Notes & Tags</button>
        </div>

        <div class="agency-detail-modal__tab-content agency-detail-modal__tab-content--active" data-tab="overview">
          <div class="agency-detail-modal__overview">
            ${imagesHtml}
            
            <div class="agency-detail-modal__info-section">
              <h3 class="agency-detail-modal__section-title">Profile Information</h3>
              <div class="agency-detail-modal__info-grid">
                ${profile.city ? `<div class="agency-detail-modal__info-item">
                  <span class="agency-detail-modal__info-label">Location</span>
                  <span class="agency-detail-modal__info-value">${escapeHtml(profile.city)}${profile.country ? ', ' + escapeHtml(profile.country) : ''}</span>
                </div>` : ''}
                ${profile.height_cm ? `<div class="agency-detail-modal__info-item">
                  <span class="agency-detail-modal__info-label">Height</span>
                  <span class="agency-detail-modal__info-value">${profile.height_cm} cm</span>
                </div>` : ''}
                ${profile.measurements ? `<div class="agency-detail-modal__info-item">
                  <span class="agency-detail-modal__info-label">Measurements</span>
                  <span class="agency-detail-modal__info-value">${escapeHtml(profile.measurements)}</span>
                </div>` : ''}
                ${profile.age ? `<div class="agency-detail-modal__info-item">
                  <span class="agency-detail-modal__info-label">Age</span>
                  <span class="agency-detail-modal__info-value">${profile.age}</span>
                </div>` : ''}
                ${profile.user_email ? `<div class="agency-detail-modal__info-item">
                  <span class="agency-detail-modal__info-label">Email</span>
                  <span class="agency-detail-modal__info-value"><a href="mailto:${escapeHtml(profile.user_email)}">${escapeHtml(profile.user_email)}</a></span>
                </div>` : ''}
              </div>
            </div>

            ${profile.bio_curated ? `
              <div class="agency-detail-modal__bio-section">
                <h3 class="agency-detail-modal__section-title">Bio</h3>
                <p class="agency-detail-modal__bio">${escapeHtml(profile.bio_curated)}</p>
              </div>
            ` : ''}

            <div class="agency-detail-modal__actions-section">
              <h3 class="agency-detail-modal__section-title">Quick Actions</h3>
              <div class="agency-detail-modal__actions-grid">
                ${application.status !== 'accepted' ? `
                  <button class="agency-detail-modal__action-btn agency-detail-modal__action-btn--accept" data-action="accept" data-application-id="${application.id}">
                    Accept Application
                  </button>
                ` : ''}
                ${application.status !== 'declined' ? `
                  <button class="agency-detail-modal__action-btn agency-detail-modal__action-btn--decline" data-action="decline" data-application-id="${application.id}">
                    Decline Application
                  </button>
                ` : ''}
                ${application.status !== 'archived' ? `
                  <button class="agency-detail-modal__action-btn agency-detail-modal__action-btn--archive" data-action="archive" data-application-id="${application.id}">
                    Archive Application
                  </button>
                ` : ''}
                <button class="agency-detail-modal__action-btn agency-detail-modal__action-btn--notes" data-application-id="${application.id}" onclick="document.querySelector('[data-tab=\\'notes\\']').click()">
                  View Notes & Tags
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="agency-detail-modal__tab-content" data-tab="timeline">
          <div class="agency-detail-modal__timeline">
            ${timelineEvents.length > 0 ? `
              <div class="agency-detail-modal__timeline-list">
                ${timelineEvents.map(event => `
                  <div class="agency-detail-modal__timeline-item agency-detail-modal__timeline-item--${event.type}">
                    <div class="agency-detail-modal__timeline-icon"></div>
                    <div class="agency-detail-modal__timeline-content">
                      <div class="agency-detail-modal__timeline-label">${escapeHtml(event.label)}</div>
                      <div class="agency-detail-modal__timeline-date">${formatDate(event.date)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="agency-detail-modal__empty">No timeline events yet.</p>'}
          </div>
        </div>

        <div class="agency-detail-modal__tab-content" data-tab="notes">
          <div class="agency-detail-modal__notes-section">
            <div class="agency-detail-modal__notes-header">
              <h3 class="agency-detail-modal__section-title">Tags</h3>
              <button class="agency-detail-modal__add-btn" onclick="document.getElementById('notes-tags-modal').style.display='flex'; document.getElementById('notes-tags-modal').querySelector('[data-application-id=\\'${application.id}\\']')?.click();">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Manage Tags
              </button>
            </div>
            ${tags.length > 0 ? `
              <div class="agency-detail-modal__tags-list">
                ${tags.map(tag => {
                  const colorStyle = tag.color ? `background-color: ${tag.color}20; color: ${tag.color}; border-color: ${tag.color}40;` : '';
                  return `<span class="agency-detail-modal__tag" style="${colorStyle}">${escapeHtml(tag.tag)}</span>`;
                }).join('')}
              </div>
            ` : '<p class="agency-detail-modal__empty">No tags yet.</p>'}

            <div class="agency-detail-modal__notes-header" style="margin-top: 2rem;">
              <h3 class="agency-detail-modal__section-title">Notes</h3>
              <button class="agency-detail-modal__add-btn" onclick="document.getElementById('notes-tags-modal').style.display='flex'; document.getElementById('notes-tags-modal').querySelector('[data-application-id=\\'${application.id}\\']')?.click();">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Note
              </button>
            </div>
            ${notes.length > 0 ? `
              <div class="agency-detail-modal__notes-list">
                ${notes.map(note => `
                  <div class="agency-detail-modal__note-item">
                    <div class="agency-detail-modal__note-text">${escapeHtml(note.note)}</div>
                    <div class="agency-detail-modal__note-date">${formatDate(note.created_at)}</div>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="agency-detail-modal__empty">No notes yet.</p>'}
          </div>
        </div>
      `;

      // Initialize tabs
      initDetailModalTabs();
      
      // Initialize action buttons
      body.querySelectorAll('.agency-detail-modal__action-btn[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.action;
          const applicationId = btn.dataset.applicationId;
          
          if (!confirm(`Are you sure you want to ${action} this application?`)) return;

          try {
            await updateApplicationStatus(applicationId, action);
            alert(`Application ${action}ed successfully!`);
            closeModal();
            window.location.reload();
          } catch (error) {
            console.error('Action failed:', error);
            alert(`Failed to ${action} application. Please try again.`);
          }
        });
      });
    }

    function initDetailModalTabs() {
      const tabs = body.querySelectorAll('.agency-detail-modal__tab');
      const tabContents = body.querySelectorAll('.agency-detail-modal__tab-content');

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const targetTab = tab.dataset.tab;
          
          // Update active tab
          tabs.forEach(t => t.classList.remove('agency-detail-modal__tab--active'));
          tab.classList.add('agency-detail-modal__tab--active');
          
          // Update active content
          tabContents.forEach(content => {
            if (content.dataset.tab === targetTab) {
              content.classList.add('agency-detail-modal__tab-content--active');
            } else {
              content.classList.remove('agency-detail-modal__tab-content--active');
            }
          });
        });
      });
    }

    function normalizeImagePath(path) {
      if (!path) return '';
      if (path.startsWith('http://') || path.startsWith('https://')) return path;
      if (path.startsWith('/')) return path;
      return '/' + path;
    }

    function formatDate(dateString) {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  /**
   * Batch Operations
   */
  function initBatchOperations() {
    const checkboxes = document.querySelectorAll('.agency-dashboard__select-checkbox');
    const selectAll = document.getElementById('select-all');
    const batchActions = document.getElementById('batch-actions');
    const batchCancel = document.getElementById('batch-cancel');

    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', updateBatchMode);
    });

    selectAll?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      checkboxes.forEach(cb => {
        cb.checked = checked;
        if (checked) {
          state.selectedProfiles.add(cb.dataset.profileId);
        } else {
          state.selectedProfiles.delete(cb.dataset.profileId);
        }
      });
      updateBatchMode();
    });

    batchCancel?.addEventListener('click', () => {
      checkboxes.forEach(cb => {
        cb.checked = false;
        state.selectedProfiles.delete(cb.dataset.profileId);
      });
      updateBatchMode();
    });

    // Batch action buttons
    ['accept', 'decline', 'archive'].forEach(action => {
      const btn = document.getElementById(`batch-${action}`);
      btn?.addEventListener('click', () => {
        performBatchAction(action);
      });
    });
  }

  function updateBatchMode() {
    const checkboxes = document.querySelectorAll('.agency-dashboard__select-checkbox:checked');
    state.selectedProfiles.clear();
    checkboxes.forEach(cb => {
      state.selectedProfiles.add(cb.dataset.profileId);
    });

    const batchActions = document.getElementById('batch-actions');
    const batchCount = document.getElementById('batch-count');
    
    if (state.selectedProfiles.size > 0) {
      state.isBatchMode = true;
      batchActions.style.display = 'flex';
      if (batchCount) batchCount.textContent = state.selectedProfiles.size;
    } else {
      state.isBatchMode = false;
      batchActions.style.display = 'none';
    }
  }

  async function performBatchAction(action) {
    if (state.selectedProfiles.size === 0) return;

    // Get application IDs from selected profile cards
    const selectedCards = Array.from(document.querySelectorAll('.agency-dashboard__select-checkbox:checked'))
      .map(cb => {
        const card = cb.closest('.agency-dashboard__card');
        return card ? card.dataset.applicationId : null;
      })
      .filter(id => id);

    if (selectedCards.length === 0) {
      alert('No applications selected');
      return;
    }

    const confirmed = confirm(`Are you sure you want to ${action} ${selectedCards.length} application(s)?`);

    if (!confirmed) return;

    try {
      const promises = selectedCards.map(id => updateApplicationStatus(id, action));
      await Promise.all(promises);
      
      // Reload page to reflect changes
      window.location.reload();
    } catch (error) {
      console.error('Batch action failed:', error);
      alert('Failed to perform batch action. Please try again.');
    }
  }




  /**
   * Search Functionality
   */
  function initSearch() {
    const searchInput = document.getElementById('agency-search');
    const clearBtn = document.getElementById('clear-search');

    if (!searchInput) return;

    // Debounce search
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performSearch(e.target.value);
      }, 300);

      if (clearBtn) {
        clearBtn.style.display = e.target.value ? 'flex' : 'none';
      }
    });

    clearBtn?.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      performSearch('');
    });
  }

  function performSearch(query) {
    // Simple client-side filtering for now
    // Can be enhanced with server-side search
    const cards = document.querySelectorAll('.agency-dashboard__card, .agency-dashboard__gallery-card, .agency-dashboard__list-item, .agency-dashboard__table-row');
    
    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      const matches = !query || text.includes(query.toLowerCase());
      card.style.display = matches ? '' : 'none';
    });
  }

  /**
   * Filter Interactions
   */
  function initFilters() {
    const filterChips = document.querySelectorAll('.agency-dashboard__filter-chip-remove');
    const toggleBtn = document.getElementById('toggle-advanced-filters');
    const filtersPanel = document.getElementById('advanced-filters-panel');

    filterChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const chipEl = chip.closest('.agency-dashboard__filter-chip');
        const filter = chipEl.dataset.filter;
        removeFilter(filter);
      });
    });

    toggleBtn?.addEventListener('click', () => {
      if (filtersPanel) {
        const isHidden = filtersPanel.style.display === 'none';
        filtersPanel.style.display = isHidden ? 'block' : 'none';
      }
    });
  }

  function removeFilter(filter) {
    // Remove filter from URL and reload
    const url = new URL(window.location);
    url.searchParams.delete(filter);
    window.location.href = url.toString();
  }

  /**
   * Quick Actions
   */
  function initQuickActions() {
    // Handle Accept/Decline/Archive buttons (using application_id)
    document.querySelectorAll('.agency-dashboard__quick-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const action = btn.dataset.action;
        const applicationId = btn.dataset.applicationId;

        if (!applicationId) {
          console.error('No application ID found');
          return;
        }

        const confirmed = confirm(`Are you sure you want to ${action} this application?`);
        if (!confirmed) return;

        btn.disabled = true;
        btn.textContent = 'Processing...';

        try {
          const response = await fetch(`/dashboard/agency/applications/${applicationId}/${action}`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              // Reload to show updated status
              window.location.reload();
            } else {
              throw new Error(data.error || 'Action failed');
            }
          } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }
        } catch (error) {
          console.error('Quick action failed:', error);
          alert(`Failed to ${action} application: ${error.message}`);
          btn.disabled = false;
          btn.textContent = action.charAt(0).toUpperCase() + action.slice(1);
        }
      });
    });
  }

  /**
   * Scout Talent Invite Handler
   */
  function initScoutInvite() {
    document.querySelectorAll('.agency-dashboard__scout-invite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const profileId = btn.dataset.profileId;
        const profileName = btn.dataset.profileName;

        if (!profileId) {
          console.error('No profile ID found');
          return;
        }

        const confirmed = confirm(`Invite ${profileName} to apply to your agency?`);
        if (!confirmed) return;

        btn.disabled = true;
        btn.textContent = 'Inviting...';

        try {
          const response = await fetch(`/dashboard/agency/scout/${profileId}/invite`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              alert(`Invitation sent to ${profileName}! They've been added to your applicants queue.`);
              // Redirect to My Applicants view
              window.location.href = '/dashboard/agency?view=applicants';
            } else {
              throw new Error(data.error || 'Invite failed');
            }
          } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }
        } catch (error) {
          console.error('Scout invite failed:', error);
          alert(`Failed to send invitation: ${error.message}`);
          btn.disabled = false;
          btn.textContent = 'Invite to Apply';
        }
      });
    });
  }

  /**
   * Notes & Tags Modal
   */
  function initNotesAndTags() {
    const modal = document.getElementById('notes-tags-modal');
    const overlay = modal?.querySelector('.agency-notes-modal__overlay');
    const closeBtn = document.getElementById('notes-modal-close');
    const notesBtns = document.querySelectorAll('.agency-dashboard__card-notes-btn, .agency-dashboard__card-notes-indicator');
    const addNoteBtn = document.getElementById('add-note-btn');
    const addTagBtn = document.getElementById('add-tag-btn');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const cancelNoteBtn = document.getElementById('cancel-note-btn');
    const saveTagBtn = document.getElementById('save-tag-btn');
    const cancelTagBtn = document.getElementById('cancel-tag-btn');
    const noteInput = document.getElementById('note-input');
    const noteInputWrapper = document.getElementById('note-input-wrapper');
    const tagInput = document.getElementById('tag-input');
    const tagInputWrapper = document.getElementById('tag-input-wrapper');
    const tagsContainer = document.getElementById('tags-container');
    const notesContainer = document.getElementById('notes-container');
    const colorOptions = document.querySelectorAll('.agency-notes-modal__color-option');

    let currentApplicationId = null;
    let currentProfileId = null;
    let selectedTagColor = '#C9A55A';

    // Open modal
    notesBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const applicationId = btn.dataset.applicationId;
        const profileId = btn.dataset.profileId || btn.closest('.agency-dashboard__card')?.dataset.profileId;
        
        if (!applicationId) {
          console.error('No application ID found');
          return;
        }

        currentApplicationId = applicationId;
        currentProfileId = profileId;

        // Get profile name from card
        const card = btn.closest('.agency-dashboard__card');
        const nameEl = card?.querySelector('.agency-dashboard__card-name');
        const profileName = nameEl?.textContent?.trim() || 'Unknown';

        document.getElementById('notes-modal-name').textContent = profileName;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Load notes and tags
        loadNotes(applicationId);
        loadTags(applicationId);
      });
    });

    // Close modal
    function closeModal() {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      currentApplicationId = null;
      currentProfileId = null;
      hideNoteInput();
      hideTagInput();
    }

    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        closeModal();
      }
    });

    // Add Note
    addNoteBtn?.addEventListener('click', () => {
      hideTagInput();
      showNoteInput();
    });

    cancelNoteBtn?.addEventListener('click', hideNoteInput);

    saveNoteBtn?.addEventListener('click', async () => {
      const noteText = noteInput?.value.trim();
      if (!noteText || !currentApplicationId) return;

      try {
        const response = await fetch(`/api/agency/applications/${currentApplicationId}/notes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ note: noteText })
        });

        if (response.ok) {
          noteInput.value = '';
          hideNoteInput();
          loadNotes(currentApplicationId);
          // Update notes count on card
          updateNotesCountOnCard(currentApplicationId);
        } else {
          const error = await response.json();
          alert(error.error || 'Failed to save note');
        }
      } catch (error) {
        console.error('Save note error:', error);
        alert('Failed to save note. Please try again.');
      }
    });

    // Add Tag
    addTagBtn?.addEventListener('click', () => {
      hideNoteInput();
      showTagInput();
    });

    cancelTagBtn?.addEventListener('click', hideTagInput);

    // Color picker
    colorOptions.forEach(btn => {
      btn.addEventListener('click', () => {
        colorOptions.forEach(b => b.classList.remove('agency-notes-modal__color-option--selected'));
        btn.classList.add('agency-notes-modal__color-option--selected');
        selectedTagColor = btn.dataset.color;
      });
    });

    // Select first color by default
    if (colorOptions.length > 0) {
      colorOptions[0].classList.add('agency-notes-modal__color-option--selected');
    }

    saveTagBtn?.addEventListener('click', async () => {
      const tagText = tagInput?.value.trim();
      if (!tagText || !currentApplicationId) return;

      try {
        const response = await fetch(`/api/agency/applications/${currentApplicationId}/tags`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ tag: tagText, color: selectedTagColor })
        });

        if (response.ok) {
          tagInput.value = '';
          hideTagInput();
          loadTags(currentApplicationId);
          // Reload page to update tags on cards
          window.location.reload();
        } else {
          const error = await response.json();
          alert(error.error || 'Failed to save tag');
        }
      } catch (error) {
        console.error('Save tag error:', error);
        alert('Failed to save tag. Please try again.');
      }
    });

    // Enter key to save
    noteInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        saveNoteBtn?.click();
      }
    });

    tagInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveTagBtn?.click();
      }
    });

    function showNoteInput() {
      noteInputWrapper.style.display = 'block';
      noteInput?.focus();
    }

    function hideNoteInput() {
      noteInputWrapper.style.display = 'none';
      noteInput.value = '';
    }

    function showTagInput() {
      tagInputWrapper.style.display = 'block';
      tagInput?.focus();
    }

    function hideTagInput() {
      tagInputWrapper.style.display = 'none';
      tagInput.value = '';
    }

    async function loadNotes(applicationId) {
      try {
        const response = await fetch(`/api/agency/applications/${applicationId}/notes`);
        if (response.ok) {
          const notes = await response.json();
          renderNotes(notes);
        }
      } catch (error) {
        console.error('Load notes error:', error);
      }
    }

    async function loadTags(applicationId) {
      try {
        const response = await fetch(`/api/agency/applications/${applicationId}/tags`);
        if (response.ok) {
          const tags = await response.json();
          renderTags(tags);
        }
      } catch (error) {
        console.error('Load tags error:', error);
      }
    }

    function renderNotes(notes) {
      if (!notesContainer) return;

      if (notes.length === 0) {
        notesContainer.innerHTML = '<p class="agency-notes-modal__empty">No notes yet. Click "Add Note" to create one.</p>';
        return;
      }

      notesContainer.innerHTML = notes.map(note => {
        const date = new Date(note.created_at);
        const formattedDate = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        return `
          <div class="agency-notes-modal__note" data-note-id="${note.id}">
            <div class="agency-notes-modal__note-content">${escapeHtml(note.note)}</div>
            <div class="agency-notes-modal__note-meta">
              <span class="agency-notes-modal__note-date">${formattedDate}</span>
              <button class="agency-notes-modal__note-delete" data-note-id="${note.id}" title="Delete note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Add delete handlers
      notesContainer.querySelectorAll('.agency-notes-modal__note-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const noteId = btn.dataset.noteId;
          if (!confirm('Delete this note?')) return;

          try {
            const response = await fetch(`/api/agency/applications/${currentApplicationId}/notes/${noteId}`, {
              method: 'DELETE'
            });

            if (response.ok) {
              loadNotes(currentApplicationId);
              updateNotesCountOnCard(currentApplicationId);
            } else {
              alert('Failed to delete note');
            }
          } catch (error) {
            console.error('Delete note error:', error);
            alert('Failed to delete note. Please try again.');
          }
        });
      });
    }

    function renderTags(tags) {
      if (!tagsContainer) return;

      if (tags.length === 0) {
        tagsContainer.innerHTML = '<p class="agency-notes-modal__empty">No tags yet. Click "Add Tag" to create one.</p>';
        return;
      }

      tagsContainer.innerHTML = tags.map(tag => {
        const colorStyle = tag.color ? `background-color: ${tag.color}20; color: ${tag.color}; border-color: ${tag.color}40;` : '';
        return `
          <div class="agency-notes-modal__tag-item" data-tag-id="${tag.id}">
            <span class="agency-notes-modal__tag-label" style="${colorStyle}">${escapeHtml(tag.tag)}</span>
            <button class="agency-notes-modal__tag-delete" data-tag-id="${tag.id}" title="Remove tag">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        `;
      }).join('');

      // Add delete handlers
      tagsContainer.querySelectorAll('.agency-notes-modal__tag-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tagId = btn.dataset.tagId;
          if (!confirm('Remove this tag?')) return;

          try {
            const response = await fetch(`/api/agency/applications/${currentApplicationId}/tags/${tagId}`, {
              method: 'DELETE'
            });

            if (response.ok) {
              loadTags(currentApplicationId);
              // Reload page to update tags on cards
              window.location.reload();
            } else {
              alert('Failed to remove tag');
            }
          } catch (error) {
            console.error('Delete tag error:', error);
            alert('Failed to remove tag. Please try again.');
          }
        });
      });
    }

    function updateNotesCountOnCard(applicationId) {
      const card = document.querySelector(`[data-application-id="${applicationId}"]`);
      if (!card) return;

      // Reload notes to get updated count
      loadNotes(applicationId).then(() => {
        // Update count display on card if it exists
        const notesIndicator = card.querySelector('.agency-dashboard__card-notes-indicator');
        if (notesIndicator) {
          // Count will be updated on next page load, but we can update the text
          fetch(`/api/agency/applications/${applicationId}/notes`)
            .then(r => r.json())
            .then(notes => {
              const count = notes.length;
              const countText = notesIndicator.querySelector('span');
              if (countText) {
                countText.textContent = `${count} note${count !== 1 ? 's' : ''}`;
              }
            })
            .catch(() => {});
        }
      });
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  /**
   * Agency Profile Accordion
   */
  function initAgencyProfileAccordion() {
    const accordionHeaders = document.querySelectorAll('.agency-profile-accordion__header');
    const profileForm = document.getElementById('agency-profile-form');
    const brandingForm = document.getElementById('agency-branding-form');
    const settingsForm = document.getElementById('agency-settings-form');
    const logoInput = document.getElementById('agency-logo');
    const logoPreview = document.getElementById('logo-preview-img');
    const logoPlaceholder = document.getElementById('logo-placeholder');
    const removeLogoBtn = document.getElementById('remove-logo-btn');
    const brandColorInput = document.getElementById('agency-brand-color');
    const brandColorText = document.getElementById('agency-brand-color-text');

    // Accordion toggle
    accordionHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const target = header.dataset.accordion;
        const content = document.querySelector(`[data-content="${target}"]`);
        const isOpen = content.style.display === 'block';

        // Close all
        document.querySelectorAll('.agency-profile-accordion__content').forEach(c => {
          c.style.display = 'none';
        });
        document.querySelectorAll('.agency-profile-accordion__header').forEach(h => {
          h.classList.remove('agency-profile-accordion__header--active');
          const chevron = h.querySelector('.agency-profile-accordion__chevron');
          if (chevron) chevron.style.transform = 'rotate(0deg)';
        });

        // Toggle target
        if (!isOpen) {
          content.style.display = 'block';
          header.classList.add('agency-profile-accordion__header--active');
          const chevron = header.querySelector('.agency-profile-accordion__chevron');
          if (chevron) chevron.style.transform = 'rotate(180deg)';
        }
      });
    });

    // Profile form
    profileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(profileForm);
      const data = Object.fromEntries(formData);
      const messageEl = document.getElementById('agency-profile-message');
      const submitBtn = profileForm.querySelector('button[type="submit"]');
      const btnSpan = submitBtn?.querySelector('span');
      const spinner = submitBtn?.querySelector('.agency-profile-form__btn-spinner');

      submitBtn.disabled = true;
      if (btnSpan) btnSpan.textContent = 'Saving...';
      if (spinner) spinner.style.display = 'block';
      messageEl.textContent = '';
      messageEl.className = 'agency-profile-form__message';

      try {
        const response = await fetch('/api/agency/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
          messageEl.textContent = result.message || 'Profile updated successfully!';
          messageEl.classList.add('agency-profile-form__message--success');
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          messageEl.textContent = result.error || 'Failed to update profile';
          messageEl.classList.add('agency-profile-form__message--error');
        }
      } catch (error) {
        console.error('Profile update error:', error);
        messageEl.textContent = 'Failed to update profile. Please try again.';
        messageEl.classList.add('agency-profile-form__message--error');
      } finally {
        submitBtn.disabled = false;
        if (btnSpan) btnSpan.textContent = 'Save Changes';
        if (spinner) spinner.style.display = 'none';
      }
    });

    // Branding form
    brandingForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(brandingForm);
      const messageEl = document.getElementById('agency-branding-message');
      const submitBtn = brandingForm.querySelector('button[type="submit"]');
      const btnSpan = submitBtn?.querySelector('span');
      const spinner = submitBtn?.querySelector('.agency-profile-form__btn-spinner');

      submitBtn.disabled = true;
      if (btnSpan) btnSpan.textContent = 'Saving...';
      if (spinner) spinner.style.display = 'block';
      messageEl.textContent = '';
      messageEl.className = 'agency-profile-form__message';

      try {
        const response = await fetch('/api/agency/branding', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (response.ok) {
          messageEl.textContent = result.message || 'Branding updated successfully!';
          messageEl.classList.add('agency-profile-form__message--success');
          if (result.logo_path) {
            // Update logo preview
            if (logoPreview) {
              logoPreview.src = result.logo_path.startsWith('http') ? result.logo_path : '/' + result.logo_path;
              logoPreview.closest('.agency-profile-form__logo-preview').style.display = 'block';
              if (logoPlaceholder) logoPlaceholder.style.display = 'none';
            }
          }
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          messageEl.textContent = result.error || 'Failed to update branding';
          messageEl.classList.add('agency-profile-form__message--error');
        }
      } catch (error) {
        console.error('Branding update error:', error);
        messageEl.textContent = 'Failed to update branding. Please try again.';
        messageEl.classList.add('agency-profile-form__message--error');
      } finally {
        submitBtn.disabled = false;
        if (btnSpan) btnSpan.textContent = 'Save Branding';
        if (spinner) spinner.style.display = 'none';
      }
    });

    // Logo preview
    logoInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (logoPreview) {
            logoPreview.src = event.target.result;
            logoPreview.closest('.agency-profile-form__logo-preview').style.display = 'block';
            if (logoPlaceholder) logoPlaceholder.style.display = 'none';
          } else {
            // Create preview if it doesn't exist
            const preview = document.createElement('div');
            preview.className = 'agency-profile-form__logo-preview';
            preview.innerHTML = `
              <img src="${event.target.result}" alt="Agency Logo" id="logo-preview-img">
              <button type="button" class="agency-profile-form__logo-remove" id="remove-logo-btn">Remove</button>
            `;
            logoInput.parentElement.insertBefore(preview, logoInput);
            if (logoPlaceholder) logoPlaceholder.style.display = 'none';
          }
        };
        reader.readAsDataURL(file);
      }
    });

    // Remove logo
    removeLogoBtn?.addEventListener('click', async () => {
      if (!confirm('Remove agency logo?')) return;

      try {
        const formData = new FormData();
        formData.append('remove_logo', 'true');

        const response = await fetch('/api/agency/branding', {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          if (logoPreview) logoPreview.closest('.agency-profile-form__logo-preview').style.display = 'none';
          if (logoPlaceholder) logoPlaceholder.style.display = 'block';
          logoInput.value = '';
          window.location.reload();
        }
      } catch (error) {
        console.error('Remove logo error:', error);
        alert('Failed to remove logo. Please try again.');
      }
    });

    // Color picker sync
    if (brandColorInput && brandColorText) {
      brandColorInput.addEventListener('input', (e) => {
        brandColorText.value = e.target.value.toUpperCase();
      });

      brandColorText.addEventListener('input', (e) => {
        const value = e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(value)) {
          brandColorInput.value = value;
        }
      });
    }

    // Settings form
    settingsForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(settingsForm);
      const data = {
        notify_new_applications: formData.has('notify_new_applications'),
        notify_status_changes: formData.has('notify_status_changes'),
        default_view: formData.get('default_view')
      };
      const messageEl = document.getElementById('agency-settings-message');
      const submitBtn = settingsForm.querySelector('button[type="submit"]');
      const btnSpan = submitBtn?.querySelector('span');
      const spinner = submitBtn?.querySelector('.agency-profile-form__btn-spinner');

      submitBtn.disabled = true;
      if (btnSpan) btnSpan.textContent = 'Saving...';
      if (spinner) spinner.style.display = 'block';
      messageEl.textContent = '';
      messageEl.className = 'agency-profile-form__message';

      try {
        const response = await fetch('/api/agency/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
          messageEl.textContent = result.message || 'Settings updated successfully!';
          messageEl.classList.add('agency-profile-form__message--success');
          setTimeout(() => {
            messageEl.textContent = '';
            messageEl.className = 'agency-profile-form__message';
          }, 3000);
        } else {
          messageEl.textContent = result.error || 'Failed to update settings';
          messageEl.classList.add('agency-profile-form__message--error');
        }
      } catch (error) {
        console.error('Settings update error:', error);
        messageEl.textContent = 'Failed to update settings. Please try again.';
        messageEl.classList.add('agency-profile-form__message--error');
      } finally {
        submitBtn.disabled = false;
        if (btnSpan) btnSpan.textContent = 'Save Settings';
        if (spinner) spinner.style.display = 'none';
      }
    });
  }

  /**
   * Export Data
   */
  function initExportData() {
    const exportBtn = document.getElementById('export-data-btn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
      // Get current filters from URL or state
      const urlParams = new URLSearchParams(window.location.search);
      const status = urlParams.get('status') || '';
      const city = urlParams.get('city') || '';
      const search = urlParams.get('search') || '';

      // Show export options modal
      showExportModal({ status, city, search });
    });
  }

  function showExportModal(filters) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'agency-export-modal';
    modal.innerHTML = `
      <div class="agency-export-modal__overlay"></div>
      <div class="agency-export-modal__content">
        <div class="agency-export-modal__header">
          <h2 class="agency-export-modal__title">Export Applications</h2>
          <button class="agency-export-modal__close" aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="agency-export-modal__body">
          <div class="agency-export-modal__field">
            <label>Export Format</label>
            <div class="agency-export-modal__radio-group">
              <label class="agency-export-modal__radio-label">
                <input type="radio" name="export-format" value="csv" checked>
                <span>CSV (Excel compatible)</span>
              </label>
              <label class="agency-export-modal__radio-label">
                <input type="radio" name="export-format" value="json">
                <span>JSON (Developer format)</span>
              </label>
            </div>
          </div>
          <div class="agency-export-modal__info">
            <p>Exporting <strong>${getFilteredCount(filters)}</strong> application(s) based on current filters.</p>
          </div>
        </div>
        <div class="agency-export-modal__actions">
          <button class="agency-export-modal__btn agency-export-modal__btn--secondary" id="export-cancel-btn">Cancel</button>
          <button class="agency-export-modal__btn agency-export-modal__btn--primary" id="export-download-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Export
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const overlay = modal.querySelector('.agency-export-modal__overlay');
    const closeBtn = modal.querySelector('.agency-export-modal__close');
    const cancelBtn = document.getElementById('export-cancel-btn');
    const downloadBtn = document.getElementById('export-download-btn');

    function closeModal() {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      setTimeout(() => modal.remove(), 300);
    }

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    downloadBtn.addEventListener('click', async () => {
      const format = modal.querySelector('input[name="export-format"]:checked').value;
      const urlParams = new URLSearchParams({
        format,
        ...filters
      });

      downloadBtn.disabled = true;
      downloadBtn.innerHTML = `
        <svg class="agency-export-modal__spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        Exporting...
      `;

      try {
        const response = await fetch(`/api/agency/export?${urlParams.toString()}`);
        
        if (response.ok) {
          if (format === 'json') {
            const data = await response.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pholio-applications-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
          } else {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pholio-applications-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }
          closeModal();
        } else {
          const error = await response.json();
          alert(error.error || 'Failed to export data');
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Export
          `;
        }
      } catch (error) {
        console.error('Export error:', error);
        alert('Failed to export data. Please try again.');
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download Export
        `;
      }
    });

    // ESC key to close
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    });
  }

  function getFilteredCount(filters) {
    // Estimate based on current view or use stats
    if (state.stats) {
      if (filters.status === 'pending') return state.stats.pending || 0;
      if (filters.status === 'accepted') return state.stats.accepted || 0;
      if (filters.status === 'declined') return state.stats.declined || 0;
      if (filters.status === 'archived') return state.stats.archived || 0;
      return state.stats.total || 0;
    }
    return 'all';
  }

  /**
   * API Helpers
   */
  async function updateApplicationStatus(applicationId, action) {
    const response = await fetch(`/dashboard/agency/applications/${applicationId}/${action}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to update status: ${response.statusText}`);
    }

    return response.json();
  }

})();

