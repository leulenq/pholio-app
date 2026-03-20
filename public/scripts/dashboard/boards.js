/**
 * Agency Dashboard - Boards Module
 * Handles Board Management and Board Editor
 */

(function(window) {
  'use strict';

  const Boards = {
    currentTab: 'basic',
    isSubmitting: false,

    init() {
      this.initBoardsManagement();
      this.initBoardEditor();
    },

    initBoardsManagement() {
      const createBtn = document.getElementById('create-board-btn');
      if (createBtn) {
        createBtn.addEventListener('click', () => this.openBoardEditor());
      }
      
      const emptyStateCreateBtn = document.getElementById('create-board-btn-empty');
      if (emptyStateCreateBtn) {
        emptyStateCreateBtn.addEventListener('click', () => this.openBoardEditor());
      }
      
      // Quick Action on Overview
      const quickActionCreate = document.getElementById('quick-action-create-board');
      if (quickActionCreate) {
        quickActionCreate.addEventListener('click', () => this.openBoardEditor());
      }
      
      // Initialize menu dropdowns
      this.initBoardMenuDropdowns();

      // Event delegation for board actions
      const boardsGrid = document.getElementById('boards-grid');
      if (boardsGrid) {
        boardsGrid.addEventListener('click', async (e) => {
          // Menu button click - toggle dropdown
          const menuBtn = e.target.closest('.agency-boards-page__menu-btn');
          if (menuBtn) {
            e.stopPropagation();
            const boardId = menuBtn.dataset.boardId;
            this.toggleMenuDropdown(boardId);
            return;
          }
          
          // Menu item click - handle action
          const menuItem = e.target.closest('.agency-boards-page__menu-item');
          if (menuItem) {
            e.stopPropagation();
            const action = menuItem.dataset.action;
            const boardId = menuItem.dataset.boardId;
            this.closeAllMenus();
            
            if (action === 'edit') this.openBoardEditor(boardId);
            if (action === 'delete') this.deleteBoard(boardId);
            if (action === 'duplicate') this.duplicateBoard(boardId);
            if (action === 'toggle') this.toggleBoardStatus(boardId);
            return;
          }
          
          // Menu / Edit / Delete Actions (legacy support)
          const actionBtn = e.target.closest('[data-action]');
          if (actionBtn) {
              const action = actionBtn.dataset.action;
              const boardId = actionBtn.dataset.boardId;
              if (action === 'edit') this.openBoardEditor(boardId);
              if (action === 'delete') this.deleteBoard(boardId);
              if (action === 'duplicate') this.duplicateBoard(boardId);
              if (action === 'toggle') this.toggleBoardStatus(boardId);
          }
          
          // If clicking the card itself (not a button)
          const card = e.target.closest('.agency-boards-page__card');
          if (card && !e.target.closest('button') && !e.target.closest('a') && !e.target.closest('.agency-boards-page__menu-dropdown')) {
             window.location.href = `/dashboard/agency/applicants?board_id=${card.dataset.boardId}`;
          }
          
          // Close menus when clicking outside
          if (!e.target.closest('.agency-boards-page__menu-wrapper')) {
            this.closeAllMenus();
          }
        });
      }
      
      // Close menus when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.agency-boards-page__menu-wrapper')) {
          this.closeAllMenus();
        }
      });
    },

    initBoardEditor() {
      const modal = document.getElementById('board-editor-modal');
      if (!modal) return;

      // Tab Navigation
      this.initTabs();
      
      // Weight Sliders
      this.initWeightSliders();
      
      // Form Submission
      this.initFormSubmission();
      
      // Close handlers
      this.initCloseHandlers();
      
      // Keyboard navigation
      this.initKeyboardNavigation();
    },

    initTabs() {
      const tabs = document.querySelectorAll('.board-editor-modal__nav-item');
      
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const targetTab = tab.dataset.tab;
          this.switchTab(targetTab);
        });
      });

      // Next button handler
      const nextBtn = document.getElementById('board-editor-next');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          const tabOrder = ['basic', 'requirements', 'weights'];
          const currentIndex = tabOrder.indexOf(this.currentTab);
          if (currentIndex < tabOrder.length - 1) {
            this.switchTab(tabOrder[currentIndex + 1]);
          }
        });
      }
    },

    switchTab(tabName) {
      const tabs = document.querySelectorAll('.board-editor-modal__nav-item');
      const tabContents = document.querySelectorAll('.board-editor-modal__tab-content');
      const nextBtn = document.getElementById('board-editor-next');
      const saveBtn = document.getElementById('board-editor-save');

      // Update tab buttons
      tabs.forEach(tab => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('board-editor-modal__nav-item--active', isActive);
        tab.setAttribute('aria-selected', isActive);
      });

      // Update tab content
      tabContents.forEach(content => {
        const isActive = content.dataset.content === tabName;
        content.classList.toggle('board-editor-modal__tab-content--active', isActive);
        content.hidden = !isActive;
      });

      this.currentTab = tabName;

      // Update Footer Buttons
      if (nextBtn && saveBtn) {
        if (tabName === 'weights') {
          nextBtn.style.display = 'none';
          saveBtn.style.display = 'block';
        } else {
          nextBtn.style.display = 'block';
          saveBtn.style.display = 'none';
        }
      }
    },

    initWeightSliders() {
      const sliders = document.querySelectorAll('.board-editor-modal__weight-slider');
      
      sliders.forEach(slider => {
        // Update display value on input
        slider.addEventListener('input', (e) => {
          const value = parseFloat(e.target.value);
          const sliderId = e.target.id; // e.g. weight-height
          const valueId = sliderId.replace('weight-', 'val-');
          const valueDisplay = document.getElementById(valueId);
          
          if (valueDisplay) {
            valueDisplay.textContent = value.toFixed(1);
            e.target.setAttribute('aria-valuenow', value);
          }
        });

        // Initial value display
        const value = parseFloat(slider.value);
        const sliderId = slider.id;
        const valueId = sliderId.replace('weight-', 'val-');
        const valueDisplay = document.getElementById(valueId);
        
        if (valueDisplay) {
          valueDisplay.textContent = value.toFixed(1);
        }
      });
    },

    initFormSubmission() {
      const form = document.getElementById('board-editor-form');
      if (!form) return;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (this.isSubmitting) return;

        // Validate form
        if (!this.validateForm()) {
          return;
        }

        await this.saveBoard();
      });
    },

    validateForm() {
      const nameInput = document.getElementById('board-name');
      const nameError = document.getElementById('board-name-error');
      
      // Clear previous errors
      if (nameError) nameError.textContent = '';
      if (nameInput) {
        nameInput.classList.remove('board-editor-modal__input--error');
        nameInput.setAttribute('aria-invalid', 'false');
      }

      // Validate name
      if (!nameInput || !nameInput.value.trim()) {
        if (nameError) {
          nameError.textContent = 'Board name is required';
        }
        if (nameInput) {
          nameInput.classList.add('board-editor-modal__input--error');
          nameInput.setAttribute('aria-invalid', 'true');
          nameInput.focus();
        }
        this.switchTab('basic');
        return false;
      }

      return true;
    },

    async saveBoard() {
      const form = document.getElementById('board-editor-form');
      const boardId = document.getElementById('board-editor-id').value;
      const saveBtn = document.getElementById('board-editor-save');
      const saveText = document.getElementById('board-editor-save-text');
      const spinner = document.getElementById('board-editor-spinner');
      const statusEl = document.getElementById('board-editor-save-status');

      this.isSubmitting = true;
      
      // Update UI
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.classList.add('board-editor-modal__btn--loading');
      }
      if (saveText) saveText.textContent = boardId ? 'Saving...' : 'Creating...';
      if (spinner) spinner.style.display = 'block';
      if (statusEl) statusEl.textContent = '';

      try {
        const formData = new FormData(form);
        
        // Build basic board payload
        const boardPayload = {
          name: formData.get('name').trim(),
          description: formData.get('description')?.trim() || null,
          is_active: formData.get('is_active') === 'on'
        };

        // Create or update board
        const boardUrl = boardId ? `/api/agency/boards/${boardId}` : '/api/agency/boards';
        const boardMethod = boardId ? 'PUT' : 'POST';
        
        const boardRes = await fetch(boardUrl, {
          method: boardMethod,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(boardPayload)
        });

        if (!boardRes.ok) {
          const errorData = await boardRes.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to save board');
        }

        const boardData = await boardRes.json();
        const finalBoardId = boardId || boardData.id;

        // Save requirements
        const requirementsPayload = this.buildRequirementsPayload(formData);
        await fetch(`/api/agency/boards/${finalBoardId}/requirements`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requirementsPayload)
        });

        // Save weights
        const weightsPayload = this.buildWeightsPayload(formData);
        await fetch(`/api/agency/boards/${finalBoardId}/weights`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(weightsPayload)
        });

        // Success
        if (window.Toast) {
          window.Toast.success(`Board ${boardId ? 'updated' : 'created'} successfully`);
        }
        
        // Close modal and reload
        this.closeEditor();
        setTimeout(() => window.location.reload(), 300);

      } catch (err) {
        console.error('[Board Editor] Save error:', err);
        
        if (window.Toast) {
          window.Toast.error(err.message || 'Failed to save board');
        }
        
        if (statusEl) {
          statusEl.textContent = err.message || 'An error occurred. Please try again.';
          statusEl.className = 'board-editor-modal__save-status board-editor-modal__save-status--error';
        }
      } finally {
        this.isSubmitting = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.classList.remove('board-editor-modal__btn--loading');
        }
        if (saveText) saveText.textContent = 'Save Board';
        if (spinner) spinner.style.display = 'none';
      }
    },

    buildRequirementsPayload(formData) {
      // Collect gender checkboxes
      const genders = [];
      formData.getAll('genders').forEach(gender => {
        if (gender) genders.push(gender);
      });

      return {
        min_age: formData.get('min_age') ? parseInt(formData.get('min_age')) : null,
        max_age: formData.get('max_age') ? parseInt(formData.get('max_age')) : null,
        min_height_cm: formData.get('min_height_cm') ? parseInt(formData.get('min_height_cm')) : null,
        max_height_cm: formData.get('max_height_cm') ? parseInt(formData.get('max_height_cm')) : null,
        genders: genders.length > 0 ? genders : null,
        min_bust: formData.get('min_bust') ? parseInt(formData.get('min_bust')) : null,
        max_bust: formData.get('max_bust') ? parseInt(formData.get('max_bust')) : null,
        min_waist: formData.get('min_waist') ? parseInt(formData.get('min_waist')) : null,
        max_waist: formData.get('max_waist') ? parseInt(formData.get('max_waist')) : null,
        min_hips: formData.get('min_hips') ? parseInt(formData.get('min_hips')) : null,
        max_hips: formData.get('max_hips') ? parseInt(formData.get('max_hips')) : null,
        min_social_reach: formData.get('min_social_reach') ? parseInt(formData.get('min_social_reach')) : null,
        social_reach_importance: formData.get('social_reach_importance') || null
      };
    },

    buildWeightsPayload(formData) {
      return {
        height_weight: formData.get('height_weight') ? parseFloat(formData.get('height_weight')) : 0,
        age_weight: formData.get('age_weight') ? parseFloat(formData.get('age_weight')) : 0,
        measurements_weight: formData.get('measurements_weight') ? parseFloat(formData.get('measurements_weight')) : 0,
        experience_weight: formData.get('experience_weight') ? parseFloat(formData.get('experience_weight')) : 0,
        social_reach_weight: formData.get('social_reach_weight') ? parseFloat(formData.get('social_reach_weight')) : 0,
        location_weight: formData.get('location_weight') ? parseFloat(formData.get('location_weight')) : 0
      };
    },

    initCloseHandlers() {
      const modal = document.getElementById('board-editor-modal');
      const closeBtn = document.getElementById('board-editor-close');
      const cancelBtn = document.getElementById('board-editor-cancel');
      const overlay = modal?.querySelector('.board-editor-modal__overlay');

      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeEditor());
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.closeEditor());
      }

      if (overlay) {
        overlay.addEventListener('click', () => this.closeEditor());
      }
    },

    initKeyboardNavigation() {
      const modal = document.getElementById('board-editor-modal');
      if (!modal) return;

      // ESC key to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
          this.closeEditor();
        }
      });

      // Trap focus within modal
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      modal.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      });
    },

    closeEditor() {
      const modal = document.getElementById('board-editor-modal');
      if (!modal) return;

      modal.style.display = 'none';
      document.body.style.overflow = '';
      
      // Reset form state
      const form = document.getElementById('board-editor-form');
      if (form) {
        form.reset();
        this.clearErrors();
      }
      
      // Reset to first tab
      this.switchTab('basic');
    },

    clearErrors() {
      const errors = document.querySelectorAll('.board-editor-modal__error');
      const errorInputs = document.querySelectorAll('.board-editor-modal__input--error');
      
      errors.forEach(el => el.textContent = '');
      errorInputs.forEach(el => {
        el.classList.remove('board-editor-modal__input--error');
        el.setAttribute('aria-invalid', 'false');
      });
    },

    async openBoardEditor(boardId = null) {
      const modal = document.getElementById('board-editor-modal');
      if (!modal) {
        // Fallback if modal partial not included
        if (boardId) window.location.href = `/dashboard/agency/boards/${boardId}/edit`;
        else window.location.href = '/dashboard/agency/boards/new'; 
        return;
      }
      
      const title = document.getElementById('board-editor-title');
      const idInput = document.getElementById('board-editor-id');
      const form = document.getElementById('board-editor-form');
      
      // Reset form
      form.reset();
      this.clearErrors();
      idInput.value = boardId || '';
      title.textContent = boardId ? 'Edit Board' : 'Create New Board';
      
      // Reset to first tab
      this.switchTab('basic');
      
      // Load board data if editing
      if (boardId) {
        try {
          const response = await fetch(`/api/agency/boards/${boardId}`);
          if (!response.ok) throw new Error('Failed to load board');
          
          const data = await response.json();
          this.populateForm(data);
        } catch (err) {
          console.error('[Board Editor] Load error:', err);
          if (window.Toast) {
            window.Toast.error('Failed to load board data');
          }
        }
      }
      
      // Show modal
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      
      // Focus first input
      const firstInput = form.querySelector('input:not([type="hidden"]), textarea');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    },

    populateForm(data) {
      // Basic info
      const nameInput = document.getElementById('board-name');
      const descInput = document.getElementById('board-description');
      const activeInput = document.getElementById('board-is-active');
      
      if (nameInput) nameInput.value = data.name || '';
      if (descInput) descInput.value = data.description || '';
      if (activeInput) activeInput.checked = data.is_active !== false;

      // Requirements
      if (data.requirements) {
        const req = data.requirements;
        if (req.min_age) document.getElementById('req-min-age').value = req.min_age;
        if (req.max_age) document.getElementById('req-max-age').value = req.max_age;
        if (req.min_height_cm) document.getElementById('req-min-height').value = req.min_height_cm;
        if (req.max_height_cm) document.getElementById('req-max-height').value = req.max_height_cm;
        if (req.min_bust) document.getElementById('req-min-bust').value = req.min_bust;
        if (req.max_bust) document.getElementById('req-max-bust').value = req.max_bust;
        if (req.min_waist) document.getElementById('req-min-waist').value = req.min_waist;
        if (req.max_waist) document.getElementById('req-max-waist').value = req.max_waist;
        if (req.min_hips) document.getElementById('req-min-hips').value = req.min_hips;
        if (req.max_hips) document.getElementById('req-max-hips').value = req.max_hips;
        if (req.min_social_reach) document.getElementById('req-min-social-reach').value = req.min_social_reach;
        if (req.social_reach_importance) document.getElementById('req-social-importance').value = req.social_reach_importance;

        // Populate gender checkboxes
        if (req.genders && Array.isArray(req.genders)) {
          req.genders.forEach(gender => {
            const checkbox = document.querySelector(`input[name="genders"][value="${gender}"]`);
            if (checkbox) checkbox.checked = true;
          });
        }
      }

      // Weights
      if (data.scoring_weights) {
        const weights = data.scoring_weights;
        if (weights.height_weight !== undefined) {
          const slider = document.getElementById('weight-height');
          if (slider) {
            slider.value = weights.height_weight;
            slider.dispatchEvent(new Event('input'));
          }
        }
        if (weights.age_weight !== undefined) {
          const slider = document.getElementById('weight-age');
          if (slider) {
            slider.value = weights.age_weight;
            slider.dispatchEvent(new Event('input'));
          }
        }
        if (weights.measurements_weight !== undefined) {
          const slider = document.getElementById('weight-measurements');
          if (slider) {
            slider.value = weights.measurements_weight;
            slider.dispatchEvent(new Event('input'));
          }
        }
        if (weights.experience_weight !== undefined) {
          const slider = document.getElementById('weight-experience');
          if (slider) {
            slider.value = weights.experience_weight;
            slider.dispatchEvent(new Event('input'));
          }
        }
        if (weights.social_reach_weight !== undefined) {
          const slider = document.getElementById('weight-social');
          if (slider) {
            slider.value = weights.social_reach_weight;
            slider.dispatchEvent(new Event('input'));
          }
        }
        if (weights.location_weight !== undefined) {
          const slider = document.getElementById('weight-location');
          if (slider) {
            slider.value = weights.location_weight;
            slider.dispatchEvent(new Event('input'));
          }
        }
      }
    },

    async deleteBoard(boardId) {
      const confirmed = await window.Toast.confirm(
        'Are you sure you want to delete this board? This action cannot be undone.', 
        'Delete Board'
      );
      if (!confirmed) return;
      
      try {
        const response = await fetch(`/api/agency/boards/${boardId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete');
        
        if (window.Toast) {
          window.Toast.success('Board deleted');
        }
        window.location.reload();
      } catch(e) {
        console.error('[Board Delete] Error:', e);
        if (window.Toast) {
          window.Toast.error('Failed to delete board');
        }
      }
    },

    async duplicateBoard(boardId) {
      try {
        const response = await fetch(`/api/agency/boards/${boardId}/duplicate`, { method: 'POST' });
        if (!response.ok) throw new Error('Failed to duplicate');
        
        if (window.Toast) {
          window.Toast.success('Board duplicated');
        }
        window.location.reload();
      } catch(e) {
        console.error('[Board Duplicate] Error:', e);
        if (window.Toast) {
          window.Toast.error('Failed to duplicate board');
        }
      }
    },

    initBoardMenuDropdowns() {
      // Set up menu button aria attributes
      const menuButtons = document.querySelectorAll('.agency-boards-page__menu-btn');
      menuButtons.forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
        const wrapper = btn.closest('.agency-boards-page__menu-wrapper');
        if (wrapper) {
          wrapper.setAttribute('data-open', 'false');
        }
      });
    },

    toggleMenuDropdown(boardId) {
      const menuBtn = document.querySelector(`.agency-boards-page__menu-btn[data-board-id="${boardId}"]`);
      if (!menuBtn) return;
      
      const wrapper = menuBtn.closest('.agency-boards-page__menu-wrapper');
      const dropdown = wrapper?.querySelector('.agency-boards-page__menu-dropdown');
      
      if (!wrapper || !dropdown) return;
      
      const isOpen = wrapper.getAttribute('data-open') === 'true';
      
      // Close all other menus first
      this.closeAllMenus();
      
      if (!isOpen) {
        // Open this menu
        wrapper.setAttribute('data-open', 'true');
        dropdown.classList.add('is-open');
        menuBtn.setAttribute('aria-expanded', 'true');
      }
    },

    closeAllMenus() {
      const openMenus = document.querySelectorAll('.agency-boards-page__menu-wrapper[data-open="true"]');
      openMenus.forEach(wrapper => {
        wrapper.setAttribute('data-open', 'false');
        const dropdown = wrapper.querySelector('.agency-boards-page__menu-dropdown');
        const btn = wrapper.querySelector('.agency-boards-page__menu-btn');
        if (dropdown) dropdown.classList.remove('is-open');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    },

    initBoardMenuDropdowns() {
      // Set up menu button aria attributes
      const menuButtons = document.querySelectorAll('.agency-boards-page__menu-btn');
      menuButtons.forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
        const wrapper = btn.closest('.agency-boards-page__menu-wrapper');
        if (wrapper) {
          wrapper.setAttribute('data-open', 'false');
        }
      });
    },

    toggleMenuDropdown(boardId) {
      const menuBtn = document.querySelector(`.agency-boards-page__menu-btn[data-board-id="${boardId}"]`);
      if (!menuBtn) return;
      
      const wrapper = menuBtn.closest('.agency-boards-page__menu-wrapper');
      const dropdown = wrapper?.querySelector('.agency-boards-page__menu-dropdown');
      
      if (!wrapper || !dropdown) return;
      
      const isOpen = wrapper.getAttribute('data-open') === 'true';
      
      // Close all other menus first
      this.closeAllMenus();
      
      if (!isOpen) {
        // Open this menu
        wrapper.setAttribute('data-open', 'true');
        dropdown.classList.add('is-open');
        menuBtn.setAttribute('aria-expanded', 'true');
      }
    },

    closeAllMenus() {
      const openMenus = document.querySelectorAll('.agency-boards-page__menu-wrapper[data-open="true"]');
      openMenus.forEach(wrapper => {
        wrapper.setAttribute('data-open', 'false');
        const dropdown = wrapper.querySelector('.agency-boards-page__menu-dropdown');
        const btn = wrapper.querySelector('.agency-boards-page__menu-btn');
        if (dropdown) dropdown.classList.remove('is-open');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    },

    async toggleBoardStatus(boardId) {
      try {
        // First get current board status
        const boardRes = await fetch(`/api/agency/boards/${boardId}`);
        if (!boardRes.ok) throw new Error('Failed to load board');
        
        const board = await boardRes.json();
        const newStatus = !board.is_active;
        
        // Update status
        const updateRes = await fetch(`/api/agency/boards/${boardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: newStatus })
        });
        
        if (!updateRes.ok) throw new Error('Failed to update');
        
        if (window.Toast) {
          window.Toast.success(`Board ${newStatus ? 'activated' : 'deactivated'}`);
        }
        window.location.reload();
      } catch(e) {
        console.error('[Board Toggle] Error:', e);
        if (window.Toast) {
          window.Toast.error('Failed to update board status');
        }
      }
    }
  };

  window.AgencyDashboard = window.AgencyDashboard || {};
  window.AgencyDashboard.Boards = Boards;

  // Expose for global calls (e.g. Quick Actions)
  window.openBoardEditor = Boards.openBoardEditor.bind(Boards);

})(window);
