/**
 * Agency Dashboard - Applicants Module
 * Handles Kanban, List, Table views, and Application Details
 */

(function(window) {
  'use strict';

  const Applicants = {
    // State for table view selections
    selectedIds: new Set(),
    selectedProfiles: new Map(), // Map of profileId -> { id, name, image }
    
    init() {
      this.initPipeline();
      this.initViewModes();
      this.initFilterDrawer();
      this.initKanbanDragDrop();
      this.initPreviewModal();
      this.initBatchOperations();
      this.initTableSelections();
      this.initSearch();
      this.initFilters();
      this.initQuickActions();
      this.initInboxPage();
      this.initNotesAndTags();
    },

    /**
     * Kanban Drag and Drop
     */
    initKanbanDragDrop() {
      const cards = document.querySelectorAll('.agency-dashboard__card');
      const columns = document.querySelectorAll('.agency-dashboard__kanban-column');

      cards.forEach(card => {
        card.addEventListener('dragstart', this.handleDragStart.bind(this));
        card.addEventListener('dragend', this.handleDragEnd.bind(this));
      });

      columns.forEach(col => {
        col.addEventListener('dragover', this.handleDragOver.bind(this));
        col.addEventListener('dragenter', this.handleDragEnter.bind(this));
        col.addEventListener('dragleave', this.handleDragLeave.bind(this));
        col.addEventListener('drop', this.handleDrop.bind(this));
      });
    },

    handleDragStart(e) {
      window.AgencyDashboard.Core.state.dragState = {
        card: e.target,
        sourceColumn: e.target.closest('.agency-dashboard__kanban-column'),
        offsetX: e.offsetX,
        offsetY: e.offsetY
      };
      e.target.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
      e.target.classList.add('is-dragging');
    },

    handleDragEnd(e) {
      e.target.style.opacity = '1';
      e.target.classList.remove('is-dragging');
      document.querySelectorAll('.agency-dashboard__kanban-column').forEach(col => {
        col.classList.remove('agency-dashboard__kanban-column--drag-over');
      });
      window.AgencyDashboard.Core.state.dragState = null;
    },

    handleDragOver(e) {
      if (window.AgencyDashboard.Core.state.dragState) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    },

    handleDragEnter(e) {
      if (window.AgencyDashboard.Core.state.dragState) {
        e.currentTarget.classList.add('agency-dashboard__kanban-column--drag-over');
      }
    },

    handleDragLeave(e) {
      if (window.AgencyDashboard.Core.state.dragState) {
        e.currentTarget.classList.remove('agency-dashboard__kanban-column--drag-over');
      }
    },

    async handleDrop(e) {
      e.preventDefault();
      const dragState = window.AgencyDashboard.Core.state.dragState;
      if (!dragState) return;

      const targetColumn = e.currentTarget;
      const targetStatus = targetColumn.dataset.status;
      const card = dragState.card;
      const applicationId = card.dataset.applicationId;

      if (!applicationId) {
        console.error('No application ID found on card');
        return;
      }

      const statusToAction = {
        'new': null, // New status doesn't have an action, just viewed
        'pending': null, // Pending doesn't have an action
        'accepted': 'accept',
        'declined': 'decline',
        'archived': 'archive',
        'under-review': 'under-review'
      };

      const action = statusToAction[targetStatus];
      // Pending status usually doesn't have an action endpoint like the others, 
      // but if needed, we can add it. For now, assume valid actions.
      if (!action && targetStatus !== 'pending') return;

      // Optimistic UI update
      const cardsContainer = targetColumn.querySelector('.agency-dashboard__kanban-cards');
      cardsContainer.appendChild(card);
      targetColumn.classList.remove('agency-dashboard__kanban-column--drag-over');

      try {
        // If there's an action, perform it. If moving back to pending (if supported), logic might differ.
        // Assuming we only drag to non-pending statuses for actions:
        if (action) {
          await this.updateApplicationStatus(applicationId, action);
        } else {
           // Handle 'pending' or other non-action status updates if API supports it
           console.warn('Moving to pending not fully implemented via API action');
        }

        // Update card visual state
        card.dataset.status = targetStatus;
        const badge = card.querySelector('.agency-dashboard__badge--status');
        if (badge) {
          badge.className = `agency-dashboard__badge agency-dashboard__badge--status agency-dashboard__badge--${targetStatus}`;
          badge.textContent = targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1);
        }
        
        this.updateColumnCounts();
        window.Toast.success(`Application moved to ${targetStatus}`);

      } catch (err) {
        console.error('Failed to update status:', err);
        window.Toast.error('Failed to update status');
        // Revert UI
        dragState.sourceColumn.querySelector('.agency-dashboard__kanban-cards').appendChild(card);
      }
      
      window.AgencyDashboard.Core.state.dragState = null;
    },

    updateColumnCounts() {
      document.querySelectorAll('.agency-dashboard__kanban-column').forEach(column => {
        const count = column.querySelectorAll('.agency-dashboard__card').length;
        const countEl = column.querySelector('.agency-dashboard__kanban-count');
        if (countEl) countEl.textContent = count;
      });
    },

    async updateApplicationStatus(applicationId, action) {
      const response = await fetch(`/dashboard/agency/applications/${applicationId}/${action}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update status: ${response.statusText}`);
      }
      return response.json();
    },

    updateApplicationCardStatus(applicationId, newStatus) {
      // Update all cards with this application ID
      const cards = document.querySelectorAll(`[data-application-id="${applicationId}"]`);
      cards.forEach(card => {
        card.dataset.status = newStatus;
        const badge = card.querySelector('.applicants-inbox-row__status-badge, .agency-dashboard__status-badge');
        if (badge) {
          badge.className = badge.className.replace(/--\w+/, `--${newStatus}`);
          badge.textContent = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
        }
      });
      
      // Update pipeline counts if they exist
      this.updatePipelineCounts();
    },

    updatePipelineCounts() {
      // Refresh pipeline counts without full page reload
      fetch('/dashboard/agency/applicants?json=1')
        .then(res => res.json())
        .then(data => {
          if (data.pipelineCounts) {
            // Update status tab counts (counts are now inline in button text)
            Object.keys(data.pipelineCounts).forEach(status => {
              const tab = document.querySelector(`[data-status="${status}"].applicants-status-tab`);
              if (tab) {
                // Extract the label text and update with new count
                const label = tab.textContent.split('(')[0].trim();
                tab.textContent = `${label} (${data.pipelineCounts[status]})`;
              }
            });
          }
        })
        .catch(err => console.error('Failed to update pipeline counts:', err));
    },

    /**
     * Application Detail Drawer
     */
    initPreviewModal() {
      // Bind global functions for inline usage
      window.openApplicationDetail = this.openApplicationDetail.bind(this);
      
      const previewButtons = document.querySelectorAll('.agency-dashboard__card-preview, .agency-dashboard__gallery-preview, .agency-dashboard__list-preview, .agency-dashboard__table-preview, .agency-dashboard__table-review, .agency-dashboard__scout-preview-btn, .applicants-inbox-row__action-btn--view');
      
      previewButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const applicationId = btn.dataset.applicationId;
          const profileId = btn.dataset.profileId;
          
          if (!applicationId) {
             // Fallback to profile/portfolio
             const profile = window.AgencyDashboard.Core.state.profiles?.find(p => p.id === profileId);
             if (profile && profile.slug) {
               window.open(`/portfolio/${profile.slug}`, '_blank');
             } else if (profileId) {
                 // Scout view might not have app ID
                 // Could fetch profile details or just show what we have
                 // For now, if no app ID, try to open detail with just profile ID if supported
                 this.openApplicationDetail(profileId);
             }
             return;
          }
          
          this.openApplicationDetail(applicationId);
        });
      });
      
      // Close handlers
      const drawer = document.getElementById('application-detail-drawer');
      const closeBtn = document.getElementById('detail-drawer-close');
      const overlay = drawer?.querySelector('.agency-detail-drawer__overlay');
      
      if (drawer) {
          const closeDrawer = () => {
              drawer.classList.remove('is-open');
              setTimeout(() => drawer.style.display = 'none', 300);
              document.body.style.overflow = '';
          };
          
          closeBtn?.addEventListener('click', closeDrawer);
          overlay?.addEventListener('click', closeDrawer);
          
          document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape' && drawer.style.display === 'flex') {
                  closeDrawer();
              }
          });
      }
    },

    async openApplicationDetail(profileIdOrApplicationId) {
      const drawer = document.getElementById('application-detail-drawer');
      if (!drawer) return;

      // Try to find application ID from profile ID
      let applicationId = profileIdOrApplicationId;
      const profile = window.AgencyDashboard.Core.state.profiles?.find(p => p.id === profileIdOrApplicationId);
      
      if (profile && profile.application_id) {
        applicationId = profile.application_id;
      }

      // If we still don't have an application ID, we might be in scout mode looking at a raw profile
      // Logic for raw profile view vs application view might differ
      
      drawer.style.display = 'flex';
      // Small delay to allow display:flex to apply before adding class for transition
      requestAnimationFrame(() => drawer.classList.add('is-open'));
      document.body.style.overflow = 'hidden';

      const body = document.getElementById('detail-drawer-body');
      if (body) {
        body.innerHTML = `
          <div class="agency-detail-drawer__loading">
            <div class="agency-detail-drawer__spinner"></div>
            <p>Loading details...</p>
          </div>
        `;
      }

      try {
        // Try application endpoint first, then profile endpoint if it fails
        let response = await fetch(`/api/agency/applications/${applicationId}/details`);
        
        if (!response.ok) {
          // If application endpoint fails, try profile endpoint (for discover/scout view)
          response = await fetch(`/api/agency/profiles/${applicationId}/details`);
        }
        
        if (response.ok) {
          const data = await response.json();
          this.renderApplicationDetails(data);
          
          // Setup header actions
          const portfolioLink = document.getElementById('detail-drawer-portfolio-link');
          if (portfolioLink && data.profile.slug) {
            portfolioLink.href = `/portfolio/${data.profile.slug}`;
            portfolioLink.style.display = 'flex';
          }
        } else {
           throw new Error('Failed to load details');
        }
      } catch (error) {
        console.error('Load details error:', error);
        if (body) {
           body.innerHTML = `
            <div class="agency-detail-drawer__error">
              <p>Failed to load details. It might not be an active application.</p>
              <button class="agency-detail-drawer__action-btn" onclick="document.getElementById('application-detail-drawer').classList.remove('is-open'); setTimeout(() => document.getElementById('application-detail-drawer').style.display='none', 300);">Close</button>
            </div>
          `;
        }
      }
    },

    renderApplicationDetails(data) {
      const { application, profile, notes, tags } = data;
      const body = document.getElementById('detail-drawer-body');
      const nameEl = document.getElementById('detail-drawer-name');
      const badgesEl = document.getElementById('detail-drawer-badges');
      
      const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown';
      if (nameEl) nameEl.textContent = fullName;
      
      // Render badges
      if (badgesEl) {
        const badges = [];
        // Add verified badge if profile is verified (you may need to add this field)
        if (profile.is_verified || profile.is_pro) {
          badges.push('<span class="agency-detail-drawer__badge agency-detail-drawer__badge--verified">Verified Profile</span>');
        }
        // Add status badge only if there's an application
        if (application) {
          const status = application.status || 'pending';
          badges.push(`<span class="agency-detail-drawer__badge agency-detail-drawer__badge--pending">${status.charAt(0).toUpperCase() + status.slice(1)}</span>`);
        }
        badgesEl.innerHTML = badges.join('');
      }
      
      // Update back link for discover profiles
      const backLink = document.querySelector('.agency-detail-drawer__back-link');
      if (backLink && !application) {
        backLink.href = '/dashboard/agency/discover';
        backLink.textContent = 'Back to Discover';
      } else if (backLink && application) {
        backLink.href = '/dashboard/agency/applicants';
        backLink.textContent = 'Back to Inbox';
      }

      // Helper function to normalize image path
      const normalizeImagePath = (path) => {
        if (!path) return '';
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        if (path.startsWith('/')) return path;
        return '/' + path;
      };

      // Get main portrait image
      const portraitImage = profile.hero_image_path || (profile.images && profile.images.length > 0 ? profile.images[0].path : '');
      const portraitSrc = portraitImage ? normalizeImagePath(portraitImage) : '';

      // Format height
      const heightFeet = profile.height_cm ? Math.floor(profile.height_cm / 30.48) : null;
      const heightInches = profile.height_cm ? Math.round((profile.height_cm % 30.48) / 2.54) : null;
      const heightDisplay = heightFeet && heightInches ? `${heightFeet}'${heightInches}"` : profile.height_cm ? `${profile.height_cm} cm` : '—';

      // Format location
      const location = profile.city ? (profile.country ? `${profile.city}, ${profile.country}` : profile.city) : 'Location TBD';
      const ageDisplay = profile.age ? `${profile.age} Years` : '—';

      // Extract categories from bio or tags
      const categories = [];
      if (tags && tags.length > 0) {
        tags.forEach(tag => {
          categories.push(tag.tag);
        });
      }
      // Also check bio for category keywords
      if (profile.bio_curated) {
        const bioLower = profile.bio_curated.toLowerCase();
        if (bioLower.includes('editorial') && !categories.includes('Editorial')) categories.push('Editorial');
        if (bioLower.includes('commercial') && !categories.includes('Commercial')) categories.push('Commercial');
        if (bioLower.includes('runway') && !categories.includes('Runway')) categories.push('Runway');
        if (bioLower.includes('fitness') && !categories.includes('Fitness')) categories.push('Fitness');
        if (bioLower.includes('beauty') && !categories.includes('Beauty')) categories.push('Beauty');
      }

      // Render split-screen layout
      body.innerHTML = `
        <div class="agency-detail-drawer__split-layout">
          <!-- Left Column: Portrait Image -->
          <div class="agency-detail-drawer__split-left">
            <div class="agency-detail-drawer__portrait-container">
              ${portraitSrc ? `
                <img 
                  src="${portraitSrc}" 
                  alt="${fullName}"
                  class="agency-detail-drawer__portrait"
                  loading="lazy"
                />
              ` : `
                <div class="agency-detail-drawer__portrait" style="display: flex; align-items: center; justify-content: center; background: var(--agency-bg-elevated, #f5f5f4); color: var(--agency-text-tertiary, #94a3b8); font-size: 3rem; width: 100%; height: 100%;">
                  ${profile.first_name ? profile.first_name.charAt(0) : ''}${profile.last_name ? profile.last_name.charAt(0) : ''}
                </div>
              `}
            </div>
          </div>

          <!-- Right Column: Tabs, Measurements, Categories -->
          <div class="agency-detail-drawer__split-right">
            <!-- Tabs -->
            <div class="agency-detail-drawer__tabs">
              <button class="agency-detail-drawer__tab agency-detail-drawer__tab--active" data-tab="overview">Overview</button>
              <button class="agency-detail-drawer__tab" data-tab="ai-insights">AI Insights</button>
              <button class="agency-detail-drawer__tab" data-tab="communication">Communication</button>
            </div>

            <!-- Tab Content: Overview -->
            <div class="agency-detail-drawer__tab-content" id="tab-overview">
              <!-- Location and Basic Info -->
              <div style="margin-bottom: 2rem; color: var(--agency-text-secondary); font-size: 0.875rem;">
                ${location} • ${ageDisplay} • ${heightDisplay}
              </div>

              <!-- Measurements Section -->
              <div class="agency-detail-drawer__section">
                <h2 class="agency-detail-drawer__section-title">Measurements</h2>
                <div class="agency-detail-drawer__measurements-grid">
                  ${profile.bust ? `
                    <div class="agency-detail-drawer__measurement-item">
                      <div class="agency-detail-drawer__measurement-label">BUST</div>
                      <div class="agency-detail-drawer__measurement-value">${profile.bust}"</div>
                    </div>
                  ` : ''}
                  ${profile.waist ? `
                    <div class="agency-detail-drawer__measurement-item">
                      <div class="agency-detail-drawer__measurement-label">WAIST</div>
                      <div class="agency-detail-drawer__measurement-value">${profile.waist}"</div>
                    </div>
                  ` : ''}
                  ${profile.hips ? `
                    <div class="agency-detail-drawer__measurement-item">
                      <div class="agency-detail-drawer__measurement-label">HIPS</div>
                      <div class="agency-detail-drawer__measurement-value">${profile.hips}"</div>
                    </div>
                  ` : ''}
                  ${profile.shoe_size ? `
                    <div class="agency-detail-drawer__measurement-item">
                      <div class="agency-detail-drawer__measurement-label">SHOES</div>
                      <div class="agency-detail-drawer__measurement-value">${profile.shoe_size}</div>
                    </div>
                  ` : ''}
                  ${profile.eye_color ? `
                    <div class="agency-detail-drawer__measurement-item">
                      <div class="agency-detail-drawer__measurement-label">EYES</div>
                      <div class="agency-detail-drawer__measurement-value">${profile.eye_color}</div>
                    </div>
                  ` : ''}
                  ${profile.hair_color ? `
                    <div class="agency-detail-drawer__measurement-item">
                      <div class="agency-detail-drawer__measurement-label">HAIR</div>
                      <div class="agency-detail-drawer__measurement-value">${profile.hair_color}</div>
                    </div>
                  ` : ''}
                </div>
              </div>

              <!-- Categories Section -->
              ${categories.length > 0 ? `
                <div class="agency-detail-drawer__section">
                  <h2 class="agency-detail-drawer__section-title">Categories</h2>
                  <div class="agency-detail-drawer__categories">
                    ${categories.map(cat => `
                      <span class="agency-detail-drawer__category-pill">${cat}</span>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- Tab Content: AI Insights -->
            <div class="agency-detail-drawer__tab-content" id="tab-ai-insights" style="display: none;">
              <p style="color: var(--agency-text-secondary);">AI insights coming soon...</p>
            </div>

            <!-- Tab Content: Communication -->
            <div class="agency-detail-drawer__tab-content" id="tab-communication" style="display: none;">
              <div class="agency-detail-drawer__section">
                <h2 class="agency-detail-drawer__section-title">Notes</h2>
                <div id="drawer-notes-list">
                  ${notes && notes.length > 0 ? notes.map(n => `
                    <div style="padding: 1rem; margin-bottom: 0.75rem; background: var(--agency-bg-elevated); border-radius: 8px;">
                      <p style="margin: 0 0 0.5rem 0; color: var(--agency-text-primary);">${this.escapeHtml(n.note)}</p>
                      <small style="color: var(--agency-text-tertiary);">${window.AgencyDashboard.Core.formatDate(n.created_at)}</small>
                    </div>
                  `).join('') : '<p style="color: var(--agency-text-tertiary);">No notes yet.</p>'}
                </div>
                <div style="margin-top: 1.5rem;">
                  <textarea 
                    id="drawer-note-input" 
                    placeholder="Add a note..." 
                    style="width: 100%; min-height: 100px; padding: 0.75rem; border: 1px solid var(--agency-border); border-radius: 8px; font-family: var(--agency-font-sans); font-size: 0.875rem; resize: vertical;"
                  ></textarea>
                  <button 
                    id="drawer-note-send" 
                    style="margin-top: 0.75rem; padding: 0.625rem 1.5rem; background: var(--agency-text-primary); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;"
                  >Add Note</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      // Initialize tab switching
      const tabButtons = body.querySelectorAll('.agency-detail-drawer__tab');
      const tabContents = body.querySelectorAll('.agency-detail-drawer__tab-content');
      
      tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const tabName = btn.dataset.tab;
          
          // Update active tab
          tabButtons.forEach(b => b.classList.remove('agency-detail-drawer__tab--active'));
          btn.classList.add('agency-detail-drawer__tab--active');
          
          // Show/hide tab content
          tabContents.forEach(content => {
            content.style.display = 'none';
          });
          const activeContent = document.getElementById(`tab-${tabName}`);
          if (activeContent) {
            activeContent.style.display = 'block';
          }
        });
      });

      // Bind Action Buttons
      const acceptBtn = document.getElementById('detail-drawer-accept');
      const compCardLink = document.getElementById('detail-drawer-comp-card-link');
      
      // Only show accept button if there's an application and it's not already accepted
      if (acceptBtn) {
        if (application && application.status !== 'accepted') {
          acceptBtn.style.display = 'inline-flex';
          acceptBtn.onclick = async () => {
            try {
              acceptBtn.disabled = true;
              acceptBtn.textContent = 'Accepting...';
              await this.updateApplicationStatus(application.id, 'accept');
              window.Toast.success('Application Accepted');
              // Optimistic UI update - update the card status without reload
              this.updateApplicationCardStatus(application.id, 'accepted');
              // Close drawer after a short delay
              setTimeout(() => {
                const drawer = document.getElementById('application-detail-drawer');
                if (drawer) {
                  drawer.classList.remove('is-open');
                  setTimeout(() => drawer.style.display = 'none', 300);
                  document.body.style.overflow = '';
                }
              }, 1000);
            } catch (error) {
              console.error('Failed to accept application:', error);
              window.Toast.error('Failed to accept application. Please try again.');
              acceptBtn.disabled = false;
              acceptBtn.textContent = 'Accept Application';
            }
          };
        } else {
          acceptBtn.style.display = 'none';
        }
      }

      // Setup Comp Card link
      if (compCardLink && profile.slug) {
        compCardLink.href = `/pdf/compcard/${profile.slug}`;
        compCardLink.style.display = 'inline-flex';
      }

      // Bind Note Input (only if there's an application)
      const noteSend = document.getElementById('drawer-note-send');
      const noteInput = document.getElementById('drawer-note-input');
      if (noteSend && noteInput && application) {
          noteSend.onclick = async () => {
              const text = noteInput.value.trim();
              if (!text) return;
              try {
                  await fetch(`/api/agency/applications/${application.id}/notes`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ note: text })
                  });
                  window.Toast.success('Note added');
                  // Reload the drawer to show new note
                  this.openApplicationDetail(application.id);
              } catch(e) {
                  console.error('Failed to add note:', e);
                  window.Toast.error('Failed to add note');
              }
          };
      } else if (noteInput && !application) {
          // Hide note input for discover profiles without applications
          const noteSection = noteInput.closest('.agency-detail-drawer__section');
          if (noteSection) {
              noteSection.style.display = 'none';
          }
      }
    },

    escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
    
    /**
     * Batch Operations
     */
    initBatchOperations() {
       // Reuse logic from original
       const checkboxes = document.querySelectorAll('.agency-dashboard__select-checkbox');
       // ... event listeners ...
       // Use window.AgencyDashboard.Core.state.selectedProfiles
       
       // Simplified transfer:
       checkboxes.forEach(cb => {
           cb.addEventListener('change', () => {
               if(cb.checked) window.AgencyDashboard.Core.state.selectedProfiles.add(cb.dataset.profileId);
               else window.AgencyDashboard.Core.state.selectedProfiles.delete(cb.dataset.profileId);
               this.updateBatchUI();
           });
       });
    },
    
    updateBatchUI() {
        const batchActions = document.getElementById('batch-actions');
        const count = document.getElementById('batch-count');
        const size = window.AgencyDashboard.Core.state.selectedProfiles.size;
        
        if (batchActions) {
            batchActions.style.display = size > 0 ? 'flex' : 'none';
            if (count) count.textContent = size;
        }
    },
    
    /**
     * Table View Selections & Floating Action Bar
     */
    initTableSelections() {
      // Select All checkbox
      const selectAll = document.getElementById('select-all');
      if (selectAll) {
        selectAll.addEventListener('change', (e) => {
          const checkboxes = document.querySelectorAll('#view-table .agency-dashboard__select-checkbox');
          checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            this.handleTableCheckboxChange(cb);
          });
        });
      }
      
      // Individual checkboxes in table
      const tableCheckboxes = document.querySelectorAll('#view-table .agency-dashboard__select-checkbox');
      tableCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => this.handleTableCheckboxChange(cb));
      });
      
      // Clear selection button
      const clearBtn = document.getElementById('clear-selection');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => this.clearTableSelections());
      }
      
      // Action buttons
      const compareBtn = document.getElementById('compare-selected');
      if (compareBtn) {
        compareBtn.addEventListener('click', () => this.handleCompare());
      }
      
      const addToBoardBtn = document.getElementById('add-to-board');
      if (addToBoardBtn) {
        addToBoardBtn.addEventListener('click', () => this.handleAddToBoard());
      }
      
      const archiveBtn = document.getElementById('archive-selected');
      if (archiveBtn) {
        archiveBtn.addEventListener('click', () => this.handleArchive());
      }
    },
    
    handleTableCheckboxChange(checkbox) {
      const profileId = checkbox.dataset.profileId;
      const row = checkbox.closest('.agency-dashboard__table-row');
      const applicationId = row ? row.dataset.applicationId : null;
      
      if (checkbox.checked) {
        // Add to selection
        this.selectedIds.add(profileId);
        
        // Get profile data from row
        const nameText = row.querySelector('.agency-dashboard__table-name-text');
        const avatar = row.querySelector('.agency-dashboard__table-avatar');
        const heightCell = row.querySelector('.agency-dashboard__table-height');
        const measurementsCell = row.querySelector('.agency-dashboard__table-measurements');
        const statusBadge = row.querySelector('.agency-dashboard__status-badge');
        
        const name = nameText ? nameText.textContent.trim() : 'Unknown';
        const image = avatar ? avatar.src : null;
        const height = heightCell ? heightCell.textContent.trim() : '—';
        const measurementsText = measurementsCell ? measurementsCell.textContent.trim() : '—';
        
        // Parse measurements if available (format: "32-25-35")
        let bust = null, waist = null, hips = null;
        if (measurementsText && measurementsText !== '—' && measurementsText !== 'N/A') {
          const parts = measurementsText.split('-');
          if (parts.length === 3) {
            bust = parts[0].trim();
            waist = parts[1].trim();
            hips = parts[2].trim();
          }
        }
        
        this.selectedProfiles.set(profileId, {
          id: profileId,
          applicationId: applicationId,
          name: name,
          image: image,
          height: height,
          measurements: measurementsText,
          bust: bust,
          waist: waist,
          hips: hips,
          status: statusBadge ? statusBadge.textContent.trim() : 'Pending'
        });
      } else {
        // Remove from selection
        this.selectedIds.delete(profileId);
        this.selectedProfiles.delete(profileId);
      }
      
      // Update select all checkbox
      const selectAll = document.getElementById('select-all');
      if (selectAll) {
        const allCheckboxes = document.querySelectorAll('#view-table .agency-dashboard__select-checkbox');
        const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
        selectAll.checked = checkedCount === allCheckboxes.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
      }
      
      this.updateFloatingActionBar();
    },
    
    clearTableSelections() {
      this.selectedIds.clear();
      this.selectedProfiles.clear();
      
      const checkboxes = document.querySelectorAll('#view-table .agency-dashboard__select-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = false;
      });
      
      const selectAll = document.getElementById('select-all');
      if (selectAll) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      }
      
      this.updateFloatingActionBar();
    },
    
    updateFloatingActionBar() {
      const bar = document.getElementById('table-floating-action-bar');
      const countEl = document.getElementById('selected-count');
      const avatarsEl = document.getElementById('selected-avatars');
      const compareModal = document.getElementById('compare-modal');
      
      if (!bar || !countEl || !avatarsEl) return;
      
      // Hide floating dock when compare modal is open
      const isCompareOpen = compareModal && compareModal.classList.contains('is-visible');
      
      // Only show if table view is active
      const tableView = document.getElementById('view-table');
      if (!tableView || tableView.style.display === 'none') {
        bar.classList.remove('is-visible');
        return;
      }
      
      const count = this.selectedIds.size;
      
      if (count > 0 && !isCompareOpen) {
        // Show bar (only if compare modal is not open)
        bar.classList.add('is-visible');
        
        // Update count
        countEl.textContent = `${count} ${count === 1 ? 'Selected' : 'Selected'}`;
        
        // Update avatars (show max 5, with overlap)
        avatarsEl.innerHTML = '';
        const profiles = Array.from(this.selectedProfiles.values()).slice(0, 5);
        profiles.forEach(profile => {
          const img = document.createElement('img');
          img.src = profile.image || '/images/default-avatar.png';
          img.alt = profile.name;
          img.className = 'agency-dashboard__floating-action-bar__avatar';
          avatarsEl.appendChild(img);
        });
        
        // Show "+X more" if there are more than 5
        if (this.selectedProfiles.size > 5) {
          const more = document.createElement('div');
          more.className = 'agency-dashboard__floating-action-bar__avatar';
          more.style.cssText = 'background: #f3f4f6; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #6b7280; font-weight: 600;';
          more.textContent = `+${this.selectedProfiles.size - 5}`;
          avatarsEl.appendChild(more);
        }
      } else {
        // Hide bar
        bar.classList.remove('is-visible');
      }
    },
    
    async handleCompare() {
      if (this.selectedIds.size === 0) return;
      
      const profileIds = Array.from(this.selectedIds);
      const modal = document.getElementById('compare-modal');
      const grid = document.getElementById('compare-grid');
      
      if (!modal || !grid) return;
      
      // Show modal with animation
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      
      // Show and animate overlay (sibling element)
      const overlay = document.querySelector('.agency-compare-modal__overlay');
      if (overlay) {
        overlay.style.display = 'block';
      }
      
      // Trigger animation
      setTimeout(() => {
        modal.classList.add('is-visible');
        if (overlay) {
          overlay.classList.add('is-visible');
        }
        // Hide floating dock when compare opens
        this.updateBatchUI();
      }, 10);
      
      // Show loading state
      grid.innerHTML = '<div style="min-width: 300px; text-align: center; padding: 4rem; color: var(--agency-text-secondary);">Loading...</div>';
      
      try {
        // Get profile data from stored selections or fetch from API
        const profileDataPromises = profileIds.map(async (profileId) => {
          // First, try to use stored data
          const stored = this.selectedProfiles.get(profileId);
          if (stored && stored.applicationId) {
            // Try to fetch full details from API for missing fields
            try {
              const response = await fetch(`/api/agency/applications/${stored.applicationId}/details`);
              if (response.ok) {
                const data = await response.json();
                return {
                  id: profileId,
                  name: stored.name,
                  image: stored.image || (data.profile.hero_image_path || (data.profile.images && data.profile.images[0] ? data.profile.images[0].path : null)),
                  height: stored.height !== '—' ? stored.height : (data.profile.height_cm ? `${Math.floor(data.profile.height_cm / 30.48)}'${Math.round((data.profile.height_cm % 30.48) / 2.54)}"` : '—'),
                  measurements: stored.measurements !== '—' ? stored.measurements : '—',
                  status: stored.status,
                  bust: stored.bust || data.profile.bust,
                  waist: stored.waist || data.profile.waist,
                  hips: stored.hips || data.profile.hips,
                  shoe_size: data.profile.shoe_size,
                  eye_color: data.profile.eye_color,
                  hair_color: data.profile.hair_color,
                  match_score: data.application ? (data.application.match_score || data.application.board_match_score) : null
                };
              }
            } catch (e) {
              console.error('Failed to fetch profile details:', e);
            }
            
            // Use stored data with defaults
            return {
              id: profileId,
              name: stored.name,
              image: stored.image,
              height: stored.height,
              measurements: stored.measurements,
              status: stored.status,
              bust: stored.bust,
              waist: stored.waist,
              hips: stored.hips,
              shoe_size: null,
              eye_color: null,
              hair_color: null,
              match_score: null
            };
          }
          
          // Fallback: use stored basic data
          if (stored) {
            return {
              id: profileId,
              name: stored.name,
              image: stored.image,
              height: stored.height || '—',
              measurements: stored.measurements || '—',
              status: stored.status || 'Pending',
              bust: stored.bust,
              waist: stored.waist,
              hips: stored.hips,
              shoe_size: null,
              eye_color: null,
              hair_color: null,
              match_score: null
            };
          }
          
          return null;
        });
        
        const profiles = (await Promise.all(profileDataPromises)).filter(p => p !== null);
        
        // Render columns (max 4) - all visible side-by-side
        const maxColumns = Math.min(profiles.length, 4);
        grid.innerHTML = '';
        
        // Update title with count
        const titleEl = document.querySelector('.agency-compare-modal__title');
        if (titleEl) {
          titleEl.textContent = `Comparing ${profiles.length} ${profiles.length === 1 ? 'Applicant' : 'Applicants'}`;
        }
        
        profiles.slice(0, maxColumns).forEach(profile => {
          const column = document.createElement('div');
          column.className = 'agency-compare-column';
          
          // Format measurements
          let measurementsHtml = '';
          if (profile.bust && profile.waist && profile.hips) {
            // Remove quotes if present
            const bust = profile.bust.toString().replace(/"/g, '');
            const waist = profile.waist.toString().replace(/"/g, '');
            const hips = profile.hips.toString().replace(/"/g, '');
            measurementsHtml = `
              <div class="agency-compare-row__measurements">
                <div class="agency-compare-row__measurement">
                  <div class="agency-compare-row__measurement-label">Bust</div>
                  <div class="agency-compare-row__measurement-value">${bust}"</div>
                </div>
                <div class="agency-compare-row__measurement">
                  <div class="agency-compare-row__measurement-label">Waist</div>
                  <div class="agency-compare-row__measurement-value">${waist}"</div>
                </div>
                <div class="agency-compare-row__measurement">
                  <div class="agency-compare-row__measurement-label">Hips</div>
                  <div class="agency-compare-row__measurement-value">${hips}"</div>
                </div>
              </div>
            `;
          } else {
            measurementsHtml = '<div class="agency-compare-row__value">—</div>';
          }
          
          column.innerHTML = `
            <div class="agency-compare-column__header">
              <img 
                src="${profile.image || '/images/default-avatar.png'}" 
                alt="${profile.name}"
                class="agency-compare-column__photo"
                onerror="this.src='/images/default-avatar.png'"
              >
              <h3 class="agency-compare-column__name">${profile.name}</h3>
            </div>
            <div class="agency-compare-column__body">
              <!-- Row 1: Height and Shoes -->
              <div class="agency-compare-row">
                <div class="agency-compare-row__label">Details</div>
                <div class="agency-compare-row__grid">
                  <div class="agency-compare-row__grid-item">
                    <div class="agency-compare-row__grid-label">Height</div>
                    <div class="agency-compare-row__grid-value">${profile.height}</div>
                  </div>
                  <div class="agency-compare-row__grid-item">
                    <div class="agency-compare-row__grid-label">Shoes</div>
                    <div class="agency-compare-row__grid-value">${profile.shoe_size || '—'}</div>
                  </div>
                </div>
              </div>
              
              <!-- Row 2: Eyes and Hair -->
              <div class="agency-compare-row">
                <div class="agency-compare-row__label">Appearance</div>
                <div class="agency-compare-row__grid">
                  <div class="agency-compare-row__grid-item">
                    <div class="agency-compare-row__grid-label">Eyes</div>
                    <div class="agency-compare-row__grid-value">${profile.eye_color || '—'}</div>
                  </div>
                  <div class="agency-compare-row__grid-item">
                    <div class="agency-compare-row__grid-label">Hair</div>
                    <div class="agency-compare-row__grid-value">${profile.hair_color || '—'}</div>
                  </div>
                </div>
              </div>
              
              <!-- Measurements Row -->
              <div class="agency-compare-row">
                <div class="agency-compare-row__label">Measurements</div>
                ${measurementsHtml}
              </div>
              
              <!-- AI Match Score -->
              <div class="agency-compare-row">
                <div class="agency-compare-row__label">AI Match Score</div>
                <div class="agency-compare-row__value">${profile.match_score ? `${profile.match_score}%` : '—'}</div>
              </div>
              
              <!-- Notes -->
              <div class="agency-compare-row">
                <div class="agency-compare-row__label">Notes</div>
                <textarea 
                  class="agency-compare-column__notes" 
                  placeholder="Add notes..."
                  data-profile-id="${profile.id}"
                ></textarea>
              </div>
            </div>
            <div class="agency-compare-column__footer">
              <button 
                class="agency-compare-column__select-winner" 
                data-profile-id="${profile.id}"
                data-profile-name="${profile.name}"
              >
                Select Winner
              </button>
            </div>
          `;
          
          grid.appendChild(column);
        });
        
        // Bind close button
        const closeBtn = document.getElementById('compare-modal-close');
        if (closeBtn) {
          closeBtn.onclick = () => this.closeCompareModal();
        }
        
        // Bind select winner buttons
        const winnerButtons = grid.querySelectorAll('.agency-compare-column__select-winner');
        winnerButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            const profileId = btn.dataset.profileId;
            const profileName = btn.dataset.profileName;
            this.handleSelectWinner(profileId, profileName);
          });
        });
        
        // Close on overlay click
        const overlay = modal.querySelector('.agency-compare-modal__overlay');
        if (overlay) {
          overlay.onclick = () => this.closeCompareModal();
        }
        
        // Close on Escape key (use a one-time listener to avoid duplicates)
        const escapeHandler = (e) => {
          if (e.key === 'Escape' && modal.style.display === 'flex') {
            this.closeCompareModal();
            document.removeEventListener('keydown', escapeHandler);
          }
        };
        document.addEventListener('keydown', escapeHandler);
        
      } catch (error) {
        console.error('Failed to load compare data:', error);
        grid.innerHTML = '<div style="min-width: 300px; text-align: center; padding: 4rem; color: #dc2626;">Failed to load comparison data. Please try again.</div>';
      }
    },
    
    closeCompareModal() {
      const modal = document.getElementById('compare-modal');
      if (!modal) return;
      
      // Remove visible class for animation
      modal.classList.remove('is-visible');
      const overlay = document.querySelector('.agency-compare-modal__overlay');
      if (overlay) {
        overlay.classList.remove('is-visible');
      }
      
      // Hide after animation
      setTimeout(() => {
        modal.style.display = 'none';
        if (overlay) {
          overlay.style.display = 'none';
        }
        document.body.style.overflow = '';
        // Show floating dock again when compare closes
        this.updateFloatingActionBar();
      }, 300);
    },
    
    handleSelectWinner(profileId, profileName) {
      // TODO: Implement winner selection logic
      window.Toast.success(`${profileName} selected as winner!`);
      console.log('Selected winner:', profileId, profileName);
    },
    
    handleAddToBoard() {
      if (this.selectedIds.size === 0) return;
      
      const profileIds = Array.from(this.selectedIds);
      // TODO: Implement add to board modal
      console.log('Add to board:', profileIds);
      window.Toast.info('Add to board feature coming soon');
    },
    
    handleArchive() {
      if (this.selectedIds.size === 0) return;
      
      const profileIds = Array.from(this.selectedIds);
      // TODO: Implement archive action
      console.log('Archive profiles:', profileIds);
      window.Toast.info('Archive feature coming soon');
    },

    initSearch() {
       // Search in applicants header
       const searchInput = document.getElementById('applicants-search-input');
       if (searchInput) {
         // Restore search value from URL on page load
         const urlParams = new URLSearchParams(window.location.search);
         const searchParam = urlParams.get('search');
         if (searchParam) {
           searchInput.value = searchParam;
         }

         let searchTimeout;
         searchInput.addEventListener('input', (e) => {
           clearTimeout(searchTimeout);
           const term = e.target.value.trim();
           
           searchTimeout = setTimeout(() => {
             if (term.length >= 2 || term.length === 0) {
               const url = new URL(window.location);
               // Reset to page 1 when searching
               url.searchParams.delete('page');
               if (term) {
                 url.searchParams.set('search', term);
               } else {
                 url.searchParams.delete('search');
               }
               // Navigate and preserve the input value in the URL
               window.location.href = url.toString();
             }
           }, 500);
         });

         // Enter key to search immediately
         searchInput.addEventListener('keydown', (e) => {
           if (e.key === 'Enter') {
             e.preventDefault();
             clearTimeout(searchTimeout);
             const term = e.target.value.trim();
             const url = new URL(window.location);
             // Reset to page 1 when searching
             url.searchParams.delete('page');
             if (term) {
               url.searchParams.set('search', term);
             } else {
               url.searchParams.delete('search');
             }
             // Navigate and preserve the input value in the URL
             window.location.href = url.toString();
           }
         });

         // Clear button functionality (optional - if you want to add a clear button)
         // For now, users can manually clear the input and it will trigger the search
       }

       // Legacy search (if exists)
       const legacySearch = document.getElementById('agency-search');
       if (legacySearch) {
         legacySearch.addEventListener('input', (e) => {
           const term = e.target.value.toLowerCase();
           document.querySelectorAll('.agency-dashboard__card').forEach(card => {
             const text = card.innerText.toLowerCase();
             card.style.display = text.includes(term) ? '' : 'none';
           });
         });
       }
    },

    initFilters() {
       // Transfer logic
    },

    initQuickActions() {
       document.querySelectorAll('[data-action]').forEach(btn => {
           if (btn.classList.contains('agency-dashboard__quick-btn') || 
               btn.classList.contains('agency-dashboard__card-action-btn') ||
               btn.classList.contains('applicants-inbox-row__action-btn')) {
               btn.addEventListener('click', async (e) => {
                   e.preventDefault();
                   e.stopPropagation();
                   const action = btn.dataset.action;
                   const appId = btn.dataset.applicationId;
                   if (!appId) return;
                   
                   try {
                       const btnText = btn.textContent;
                       btn.disabled = true;
                       btn.textContent = 'Processing...';
                       await this.updateApplicationStatus(appId, action);
                       window.Toast.success(`Application ${action}ed successfully`);
                       // Optimistic UI update
                       this.updateApplicationCardStatus(appId, action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'archived');
                       btn.disabled = false;
                       btn.textContent = btnText;
                   } catch(e) {
                       console.error('Action failed:', e);
                       window.Toast.error(e.message || 'Action failed. Please try again.');
                       btn.disabled = false;
                   }
               });
           }
       });
       
       // Handle view button clicks
       document.querySelectorAll('.applicants-inbox-row__action-btn--view').forEach(btn => {
           btn.addEventListener('click', (e) => {
               e.preventDefault();
               e.stopPropagation();
               const applicationId = btn.dataset.applicationId;
               const profileId = btn.dataset.profileId;
               if (applicationId) {
                   this.openApplicationDetail(applicationId);
               } else if (profileId) {
                   this.openApplicationDetail(profileId);
               }
           });
       });
    },

    /**
     * Pipeline Stage Click Handlers
     */
    initPipeline() {
      const stages = document.querySelectorAll('.applicants-pipeline__stage');
      stages.forEach(stage => {
        stage.addEventListener('click', () => {
          const status = stage.dataset.status;
          const url = new URL(window.location);
          if (status === 'all') {
            url.searchParams.delete('status');
          } else {
            url.searchParams.set('status', status);
          }
          window.location.href = url.toString();
        });
      });
    },

    /**
     * View Mode Toggle
     */
    initViewModes() {
      const viewButtons = document.querySelectorAll('.agency-applicants-header__view-btn');
      const views = {
        list: document.getElementById('view-list'),
        gallery: document.getElementById('view-gallery'),
        table: document.getElementById('view-table')
      };

      // Get saved preference or default to list
      const savedView = localStorage.getItem('applicants-view-mode') || 'list';
      
      viewButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const viewMode = btn.dataset.view;
          
          // Skip pipeline view if it exists
          if (viewMode === 'pipeline') return;
          
          // Clear table selections when leaving table view
          if (viewMode !== 'table' && this.selectedIds.size > 0) {
            this.clearTableSelections();
          }
          
          // Update active button
          viewButtons.forEach(b => b.classList.remove('agency-applicants-header__view-btn--active'));
          btn.classList.add('agency-applicants-header__view-btn--active');
          
          // Hide all views
          Object.values(views).forEach(view => {
            if (view) {
              view.style.display = 'none';
              view.classList.remove('agency-dashboard__view--active');
            }
          });
          
          // Show selected view
          if (views[viewMode]) {
            views[viewMode].style.display = 'block';
            views[viewMode].classList.add('agency-dashboard__view--active');
          }
          
          // Hide floating bar if not in table view
          const floatingBar = document.getElementById('table-floating-action-bar');
          if (floatingBar && viewMode !== 'table') {
            floatingBar.classList.remove('is-visible');
          }
          
          // Save preference
          localStorage.setItem('applicants-view-mode', viewMode);
          
          // Update URL
          const url = new URL(window.location);
          url.searchParams.set('view', viewMode);
          window.history.pushState({}, '', url);
        });
      });

      // Set initial view (default to list)
      const initialView = new URLSearchParams(window.location.search).get('view') || savedView;
      const initialBtn = Array.from(viewButtons).find(btn => btn.dataset.view === initialView);
      if (initialBtn && initialView !== 'pipeline') {
        initialBtn.click();
      } else if (views.list) {
        // Default to list view
        views.list.style.display = 'block';
        views.list.classList.add('agency-dashboard__view--active');
        const listBtn = Array.from(viewButtons).find(btn => btn.dataset.view === 'list');
        if (listBtn) {
          listBtn.classList.add('agency-applicants-header__view-btn--active');
        }
      }
    },

    /**
     * Filter Drawer
     */
    initFilterDrawer() {
      const drawer = document.getElementById('applicants-filter-drawer');
      const openBtn = document.getElementById('applicants-filters-btn');
      const closeBtn = document.getElementById('applicants-filter-drawer-close');
      const overlay = document.getElementById('applicants-filter-drawer-overlay');
      const applyBtn = document.getElementById('applicants-filter-apply');
      const clearBtn = document.getElementById('applicants-filter-clear');

      if (!drawer) return;

      const openDrawer = () => {
        drawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      };

      const closeDrawer = () => {
        drawer.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      };

      openBtn?.addEventListener('click', openDrawer);
      closeBtn?.addEventListener('click', closeDrawer);
      overlay?.addEventListener('click', closeDrawer);

      // ESC key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.getAttribute('aria-hidden') === 'false') {
          closeDrawer();
        }
      });

      // Apply filters
      applyBtn?.addEventListener('click', () => {
        const filters = this.collectFilters();
        const url = new URL(window.location);
        
        // Clear existing filter params
        ['date_from', 'date_to', 'category', 'location', 'age_min', 'age_max', 'source', 'board', 'match_min', 'match_max', 'city', 'letter', 'search', 'min_height', 'max_height'].forEach(param => {
          url.searchParams.delete(param);
        });

        // Reset to page 1 when applying filters
        url.searchParams.set('page', '1');

        // Add new filter params
        Object.entries(filters).forEach(([key, value]) => {
          if (value) {
            if (Array.isArray(value)) {
              value.forEach(v => url.searchParams.append(key, v));
            } else {
              url.searchParams.set(key, value);
            }
          }
        });

        // Persist filters to localStorage
        try {
          localStorage.setItem('applicants-filters', JSON.stringify(filters));
        } catch (e) {
          console.warn('Failed to save filters to localStorage:', e);
        }

        window.location.href = url.toString();
      });

      // Clear filters
      clearBtn?.addEventListener('click', () => {
        document.querySelectorAll('.applicants-filter-drawer__input, .applicants-filter-drawer__select, .applicants-filter-drawer__checkbox').forEach(input => {
          if (input.type === 'checkbox') {
            input.checked = false;
          } else {
            input.value = '';
          }
        });
        
        // Clear from localStorage
        try {
          localStorage.removeItem('applicants-filters');
        } catch (e) {
          console.warn('Failed to clear filters from localStorage:', e);
        }
        
        // Redirect to clean URL
        const url = new URL(window.location);
        ['date_from', 'date_to', 'category', 'location', 'age_min', 'age_max', 'source', 'board', 'match_min', 'match_max', 'city', 'letter', 'search', 'min_height', 'max_height', 'page'].forEach(param => {
          url.searchParams.delete(param);
        });
        window.location.href = url.toString();
      });

      // Load saved filters from localStorage on drawer open
      openBtn?.addEventListener('click', () => {
        try {
          const savedFilters = localStorage.getItem('applicants-filters');
          if (savedFilters) {
            const filters = JSON.parse(savedFilters);
            // Restore filter values
            if (filters.date_from) {
              const dateFromInput = document.getElementById('filter-date-from');
              if (dateFromInput) dateFromInput.value = filters.date_from;
            }
            if (filters.date_to) {
              const dateToInput = document.getElementById('filter-date-to');
              if (dateToInput) dateToInput.value = filters.date_to;
            }
            if (filters.location) {
              const locationInput = document.getElementById('filter-location');
              if (locationInput) locationInput.value = filters.location;
            }
            if (filters.age_min) {
              const ageMinInput = document.getElementById('filter-age-min');
              if (ageMinInput) ageMinInput.value = filters.age_min;
            }
            if (filters.age_max) {
              const ageMaxInput = document.getElementById('filter-age-max');
              if (ageMaxInput) ageMaxInput.value = filters.age_max;
            }
            if (filters.board) {
              const boardSelect = document.getElementById('filter-board');
              if (boardSelect) boardSelect.value = filters.board;
            }
            if (filters.match_min) {
              const matchMinInput = document.getElementById('filter-match-min');
              const matchMinValue = document.getElementById('filter-match-min-value');
              if (matchMinInput) {
                matchMinInput.value = filters.match_min;
                if (matchMinValue) matchMinValue.textContent = filters.match_min;
              }
            }
            if (filters.match_max) {
              const matchMaxInput = document.getElementById('filter-match-max');
              const matchMaxValue = document.getElementById('filter-match-max-value');
              if (matchMaxInput) {
                matchMaxInput.value = filters.match_max;
                if (matchMaxValue) matchMaxValue.textContent = filters.match_max;
              }
            }
            // Restore checkboxes
            if (Array.isArray(filters.category)) {
              filters.category.forEach(cat => {
                const checkbox = document.querySelector(`input[name="category"][value="${cat}"]`);
                if (checkbox) checkbox.checked = true;
              });
            }
            if (Array.isArray(filters.source)) {
              filters.source.forEach(src => {
                const checkbox = document.querySelector(`input[name="source"][value="${src}"]`);
                if (checkbox) checkbox.checked = true;
              });
            }
          }
        } catch (e) {
          console.warn('Failed to load saved filters:', e);
        }
      });

      // Update match score display
      const matchMin = document.getElementById('filter-match-min');
      const matchMax = document.getElementById('filter-match-max');
      const matchMinValue = document.getElementById('filter-match-min-value');
      const matchMaxValue = document.getElementById('filter-match-max-value');

      matchMin?.addEventListener('input', (e) => {
        if (matchMinValue) matchMinValue.textContent = e.target.value;
      });

      matchMax?.addEventListener('input', (e) => {
        if (matchMaxValue) matchMaxValue.textContent = e.target.value;
      });
    },

    collectFilters() {
      const filters = {};

      // Date range (application created date)
      const dateFrom = document.getElementById('filter-date-from');
      const dateTo = document.getElementById('filter-date-to');
      if (dateFrom?.value) filters.date_from = dateFrom.value;
      if (dateTo?.value) filters.date_to = dateTo.value;

      // Categories (note: category filter needs to be implemented in backend based on bio_curated content)
      const categories = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(cb => cb.value);
      if (categories.length > 0) filters.category = categories;

      // Location (maps to city filter)
      const location = document.getElementById('filter-location');
      if (location?.value) {
        filters.location = location.value;
        filters.city = location.value; // Also set city for backend compatibility
      }

      // Age range
      const ageMin = document.getElementById('filter-age-min');
      const ageMax = document.getElementById('filter-age-max');
      if (ageMin?.value && parseInt(ageMin.value, 10) > 0) filters.age_min = ageMin.value;
      if (ageMax?.value && parseInt(ageMax.value, 10) > 0) filters.age_max = ageMax.value;

      // Source
      const sources = Array.from(document.querySelectorAll('input[name="source"]:checked')).map(cb => cb.value);
      if (sources.length > 0) filters.source = sources;

      // Board (maps to board_id)
      const board = document.getElementById('filter-board');
      if (board?.value) {
        filters.board = board.value;
        filters.board_id = board.value; // Also set board_id for backend compatibility
      }

      // Match score (only applies when board is selected)
      const matchMin = document.getElementById('filter-match-min');
      const matchMax = document.getElementById('filter-match-max');
      if (matchMin?.value && matchMin.value !== '0') filters.match_min = matchMin.value;
      if (matchMax?.value && matchMax.value !== '100') filters.match_max = matchMax.value;

      return filters;
    },

    initInboxPage() {
      // Status tab clicks
      const statusTabs = document.querySelectorAll('.applicants-status-tab');
      statusTabs.forEach(tab => {
          tab.addEventListener('click', () => {
              const status = tab.dataset.status;
              const url = new URL(window.location);
              if (status === 'all') {
                url.searchParams.delete('status');
              } else {
                url.searchParams.set('status', status);
              }
              window.location.href = url.toString();
          });
      });
      
      // Legacy filter pills (if they still exist)
      const legacyPills = document.querySelectorAll('.agency-inbox-header__filter-pill');
      legacyPills.forEach(pill => {
          pill.addEventListener('click', () => {
              const status = pill.dataset.status;
              const url = new URL(window.location);
              if (status === 'all') url.searchParams.delete('status');
              else url.searchParams.set('status', status);
              window.location.href = url.toString();
          });
      });
    },

    initNotesAndTags() {
      // Logic for the standalone modal if used, or delegate to drawer
    }
  };

  window.AgencyDashboard = window.AgencyDashboard || {};
  window.AgencyDashboard.Applicants = Applicants;

})(window);
