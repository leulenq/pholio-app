/**
 * Agency Dashboard - Discover Module
 * Handles Talent Discovery, Filtering, View Modes, and AI Search
 */

(function(window) {
  'use strict';

  const Discover = {
    currentView: 'grid',
    searchHistory: [],
    filterState: {},
    sortBy: 'relevance',
    profiles: [],

    init() {
      this.initHeroSearch();
      this.initViewModes();
      this.initScoutFilters();
      this.initFilterChips();
      this.initScoutInvite();
      this.initTrendingCarousel();
      this.initDiscoverPage();
      this.initKeyboardShortcuts();
      this.initLazyLoading();
      this.updateResultsCount();
      this.updateEmptyState();
    },

    initHeroSearch() {
      const heroForm = document.getElementById('discover-hero-search-form');
      const heroQuery = document.getElementById('discover-hero-query');
      const heroLocation = document.getElementById('discover-hero-location');
      const heroHeight = document.getElementById('discover-hero-height');
      const aiEnabled = document.getElementById('ai-search-enabled');

      if (!heroForm) return;

      // Load search history
      this.loadSearchHistory();

      // AI Search toggle
      if (aiEnabled) {
        aiEnabled.addEventListener('change', (e) => {
          const enabled = e.target.checked;
          localStorage.setItem('discover-ai-enabled', enabled);
          this.showAISuggestion(enabled);
        });

        // Load saved preference
        const saved = localStorage.getItem('discover-ai-enabled');
        if (saved !== null) {
          aiEnabled.checked = saved === 'true';
        }
      }

      // Search suggestions
      if (heroQuery) {
        heroQuery.addEventListener('input', (e) => {
          this.handleSearchSuggestions(e.target.value);
        });

        heroQuery.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            heroForm.dispatchEvent(new Event('submit'));
          }
        });
      }

      // Location autocomplete
      if (heroLocation) {
        heroLocation.addEventListener('input', (e) => {
          this.handleLocationAutocomplete(e.target.value);
        });
      }

      // Form submission
      heroForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.performHeroSearch();
      });
    },

    handleSearchSuggestions(query) {
      const suggestionsEl = document.getElementById('discover-hero-suggestions');
      if (!suggestionsEl || !query || query.length < 2) {
        if (suggestionsEl) suggestionsEl.classList.remove('show');
        return;
      }

      // Get AI enabled state
      const aiEnabled = document.getElementById('ai-search-enabled')?.checked || false;

      // Generate suggestions (can be enhanced with actual AI/API)
      const suggestions = this.generateSearchSuggestions(query, aiEnabled);
      
      if (suggestions.length > 0) {
        suggestionsEl.innerHTML = suggestions.map(s => `
          <div class="discover-hero__suggestions-item" role="option" tabindex="0">
            ${this.highlightMatch(s, query)}
          </div>
        `).join('');

        suggestionsEl.classList.add('show');

        // Handle suggestion clicks
        suggestionsEl.querySelectorAll('.discover-hero__suggestions-item').forEach((item, index) => {
          item.addEventListener('click', () => {
            document.getElementById('discover-hero-query').value = suggestions[index];
            suggestionsEl.classList.remove('show');
            this.performHeroSearch();
          });
        });
      } else {
        suggestionsEl.classList.remove('show');
      }
    },

    generateSearchSuggestions(query, aiEnabled) {
      // Simple suggestions - can be enhanced with AI/API
      const commonSearches = [
        'Redhead in London',
        'Tall models in Paris',
        'New faces in New York',
        'Commercial models',
        'Runway models',
        'Blonde in Berlin'
      ];

      if (aiEnabled) {
        // AI-enhanced suggestions
        return commonSearches.filter(s => 
          s.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);
      }

      return commonSearches.filter(s => 
        s.toLowerCase().startsWith(query.toLowerCase())
      ).slice(0, 5);
    },

    highlightMatch(text, query) {
      const regex = new RegExp(`(${query})`, 'gi');
      return text.replace(regex, '<strong>$1</strong>');
    },

    handleLocationAutocomplete(query) {
      const suggestionsEl = document.getElementById('discover-hero-location-suggestions');
      if (!suggestionsEl || !query || query.length < 2) {
        if (suggestionsEl) suggestionsEl.classList.remove('show');
        return;
      }

      const cities = [
        'New York', 'Paris', 'London', 'Berlin', 'Milan', 'Tokyo',
        'Los Angeles', 'Copenhagen', 'Stockholm', 'Amsterdam', 'Barcelona'
      ];

      const matches = cities.filter(city => 
        city.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5);

      if (matches.length > 0) {
        suggestionsEl.innerHTML = matches.map(city => `
          <div class="discover-hero__suggestions-item" role="option" tabindex="0">
            ${city}
          </div>
        `).join('');

        suggestionsEl.classList.add('show');

        suggestionsEl.querySelectorAll('.discover-hero__suggestions-item').forEach((item, index) => {
          item.addEventListener('click', () => {
            document.getElementById('discover-hero-location').value = matches[index];
            suggestionsEl.classList.remove('show');
          });
        });
      } else {
        suggestionsEl.classList.remove('show');
      }
    },

    performHeroSearch() {
      const query = document.getElementById('discover-hero-query')?.value || '';
      const location = document.getElementById('discover-hero-location')?.value || '';
      const height = document.getElementById('discover-hero-height')?.value || '';

      // Save to history
      if (query) {
        this.addToSearchHistory(query);
      }

      // Build URL
      const params = new URLSearchParams();
      if (query) params.set('search', query);
      if (location) params.set('city', location);
      if (height) {
        const [min, max] = height.split('-');
        if (min) params.set('min_height', min);
        if (max) params.set('max_height', max);
      }

      window.location.href = `/dashboard/agency/discover?${params.toString()}`;
    },

    addToSearchHistory(query) {
      this.searchHistory = this.searchHistory.filter(q => q !== query);
      this.searchHistory.unshift(query);
      this.searchHistory = this.searchHistory.slice(0, 5);
      localStorage.setItem('discover-search-history', JSON.stringify(this.searchHistory));
      this.updateRecentSearches();
    },

    loadSearchHistory() {
      const saved = localStorage.getItem('discover-search-history');
      if (saved) {
        try {
          this.searchHistory = JSON.parse(saved);
          this.updateRecentSearches();
        } catch (e) {
          this.searchHistory = [];
        }
      }
    },

    updateRecentSearches() {
      const recentEl = document.getElementById('discover-hero-recent');
      const recentList = document.getElementById('discover-hero-recent-list');
      
      if (!recentEl || !recentList) return;

      if (this.searchHistory.length > 0) {
        recentEl.style.display = 'flex';
        recentList.innerHTML = this.searchHistory.map(query => `
          <button class="discover-hero__recent-item" data-query="${query}">${query}</button>
        `).join('');

        recentList.querySelectorAll('.discover-hero__recent-item').forEach(item => {
          item.addEventListener('click', () => {
            document.getElementById('discover-hero-query').value = item.dataset.query;
            this.performHeroSearch();
          });
        });
      } else {
        recentEl.style.display = 'none';
      }
    },

    showAISuggestion(enabled) {
      if (enabled && window.Toast) {
        window.Toast.info('AI search is now enabled. Try natural language queries like "Redhead in London"', 'AI Search Enabled');
      }
    },

    initViewModes() {
      const viewBtns = document.querySelectorAll('.discover-controls__view-btn');
      const gridView = document.getElementById('discover-talent-grid');
      const listView = document.getElementById('discover-talent-list');

      viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const view = btn.dataset.view;
          this.switchView(view);
        });
      });

      // Load saved view preference and initialize
      const savedView = localStorage.getItem('discover-view-mode') || 'grid';
      // Ensure initial state is set correctly
      if (gridView && listView) {
        gridView.classList.remove('discover-view--active');
        listView.classList.remove('discover-view--active');
      }
      this.switchView(savedView);
    },

    switchView(view) {
      const gridView = document.getElementById('discover-talent-grid');
      const listView = document.getElementById('discover-talent-list');
      const emptyState = document.querySelector('.agency-dashboard__empty-state.discover-view');
      const viewBtns = document.querySelectorAll('.discover-controls__view-btn');

      // Update buttons
      viewBtns.forEach(btn => {
        btn.classList.toggle('discover-controls__view-btn--active', btn.dataset.view === view);
      });

      // Update views
      if (gridView) {
        gridView.classList.toggle('discover-view--active', view === 'grid');
      }
      if (listView) {
        listView.classList.toggle('discover-view--active', view === 'list');
      }
      
      // Show/hide empty state based on whether there are results
      if (emptyState) {
        const gridCount = gridView?.querySelectorAll('.agency-dashboard__scout-card').length || 0;
        const listCount = listView?.querySelectorAll('.agency-dashboard__scout-list-item').length || 0;
        const hasResults = gridCount > 0 || listCount > 0;
        
        if (hasResults) {
          emptyState.classList.remove('discover-view--active');
        } else {
          // Hide both views and show empty state
          gridView?.classList.remove('discover-view--active');
          listView?.classList.remove('discover-view--active');
          emptyState.classList.add('discover-view--active');
        }
      }

      this.currentView = view;
      localStorage.setItem('discover-view-mode', view);
      this.updateResultsCount();
    },

    initFilterChips() {
      const chipsContainer = document.getElementById('discover-filter-chips');
      if (!chipsContainer) return;

      // Remove chip handler
      chipsContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.discover-filter-chips__chip');
        if (chip) {
          const filterKey = chip.dataset.filterKey;
          const filterValue = JSON.parse(chip.dataset.filterValue || '{}');
          this.removeFilter(filterKey, filterValue);
        }

        // Clear all
        if (e.target.id === 'discover-filter-chips-clear-all' || e.target.closest('#discover-filter-chips-clear-all')) {
          this.clearAllFilters();
        }
      });
    },

    removeFilter(key, value) {
      const url = new URL(window.location.href);
      
      // Remove the filter from URL
      Object.keys(value).forEach(param => {
        url.searchParams.delete(param);
      });

      window.location.href = url.toString();
    },

    clearAllFilters() {
      window.location.href = '/dashboard/agency/discover';
    },

    initScoutFilters() {
      const form = document.getElementById('scout-filters-form');
      if (!form) return;

      // Debounce helper
      const debounce = (func, delay) => {
        let timer;
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => func.apply(this, args), delay);
        };
      };

      const applyFilters = async () => {
        const formData = new FormData(form);
        
        // Handle gender checkboxes (convert to single value)
        const genderCheckboxes = form.querySelectorAll('input[name="gender"]:checked');
        if (genderCheckboxes.length === 1) {
          formData.set('gender', genderCheckboxes[0].value);
        } else if (genderCheckboxes.length > 1) {
          // Multiple selected - clear gender filter
          formData.delete('gender');
        }

        const params = new URLSearchParams(formData);
        const url = `/dashboard/agency/discover?${params.toString()}`;
        
        const activeView = document.querySelector('.discover-view--active');
        const container = document.querySelector('.discover-views-container');
        
        // Show loading state
        if (activeView) {
          activeView.style.opacity = '0.5';
          activeView.style.pointerEvents = 'none';
        }
        
        // Show skeleton loaders
        this.showSkeletonLoaders();
        
        try {
          const response = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
          if (!response.ok) throw new Error('Filter failed');
          
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          
          // Update grid view
          const newGrid = doc.querySelector('#discover-talent-grid');
          const currentGrid = document.getElementById('discover-talent-grid');
          if (currentGrid && newGrid) {
            currentGrid.innerHTML = newGrid.innerHTML;
            currentGrid.classList.add('discover-view--active');
            this.initScoutInvite();
          }

          // Update list view
          const newList = doc.querySelector('#discover-talent-list');
          const currentList = document.getElementById('discover-talent-list');
          if (currentList && newList) {
            currentList.innerHTML = newList.innerHTML;
            this.initScoutInvite();
          }

          // Update filter chips
          const newChips = doc.querySelector('#discover-filter-chips');
          const currentChips = document.getElementById('discover-filter-chips');
          if (currentChips && newChips) {
            currentChips.outerHTML = newChips.outerHTML;
            this.initFilterChips();
          } else if (!currentChips && newChips) {
            // Insert chips if they don't exist
            const container = document.querySelector('.discover-controls');
            if (container) {
              container.insertAdjacentHTML('afterend', newChips.outerHTML);
              this.initFilterChips();
            }
          }

          // Update results count
          this.updateResultsCount();
          
          window.history.pushState({}, '', url);
        } catch (err) {
          console.error('[Discover] Filter error:', err);
          this.showError('Failed to filter results. Please try again.');
          if (window.Toast) window.Toast.error('Failed to filter results');
        } finally {
          if (activeView) {
            activeView.style.opacity = '1';
            activeView.style.pointerEvents = '';
          }
          this.hideSkeletonLoaders();
        }
      };

      const debouncedFilter = debounce(applyFilters, 500);

      // Range sliders
      const heightMinSlider = document.getElementById('scout-min-height-slider');
      const heightMaxSlider = document.getElementById('scout-max-height-slider');
      const ageMinSlider = document.getElementById('scout-min-age-slider');
      const ageMaxSlider = document.getElementById('scout-max-age-slider');

      [heightMinSlider, heightMaxSlider, ageMinSlider, ageMaxSlider].forEach(slider => {
        if (slider) {
          slider.addEventListener('input', (e) => {
            const id = e.target.id.replace('-slider', '');
            const input = document.getElementById(id);
            if (input) input.value = e.target.value;
            debouncedFilter();
          });
        }
      });

      // Number inputs
      form.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('input', debouncedFilter);
      });

      // Selects and checkboxes
      form.querySelectorAll('select, input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', debouncedFilter);
      });

      // Color pickers
      form.querySelectorAll('.scout-filters__color-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const color = btn.dataset.color;
          const filter = btn.dataset.filter;
          const hiddenInput = document.getElementById(`scout-${filter}`);
          
          // Toggle active state
          form.querySelectorAll(`[data-filter="${filter}"]`).forEach(b => {
            b.classList.remove('scout-filters__color-option--active');
          });

          if (hiddenInput && hiddenInput.value === color) {
            // Deselect
            hiddenInput.value = '';
          } else {
            // Select
            btn.classList.add('scout-filters__color-option--active');
            if (hiddenInput) hiddenInput.value = color;
          }

          debouncedFilter();
        });
      });

      // Quick filter presets
      form.querySelectorAll('.scout-filters__preset').forEach(preset => {
        preset.addEventListener('click', () => {
          this.applyPreset(preset.dataset.preset);
        });
      });
      
      // Reset Button
      const resetBtn = document.getElementById('scout-filters-reset');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          form.reset();
          window.location.href = '/dashboard/agency/discover';
        });
      }
    },

    applyPreset(presetName) {
      const form = document.getElementById('scout-filters-form');
      if (!form) return;

      // Reset form first
      form.reset();

      switch (presetName) {
        case 'new-faces':
          // Filter for profiles created in last 30 days
          // This would need backend support
          window.location.href = '/dashboard/agency/discover?sort=newest';
          break;
        case 'runway':
          // Typical runway requirements
          document.getElementById('scout-min-height').value = '175';
          document.getElementById('scout-max-height').value = '190';
          form.dispatchEvent(new Event('submit', { cancelable: true }));
          break;
        case 'commercial':
          // More flexible requirements
          document.getElementById('scout-min-height').value = '160';
          document.getElementById('scout-max-height').value = '180';
          form.dispatchEvent(new Event('submit', { cancelable: true }));
          break;
      }
    },

    initScoutInvite() {
      // Grid view invite buttons
      document.querySelectorAll('.agency-dashboard__scout-invite-btn').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = 'true';
        
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this.handleInvite(btn);
        });
      });

      // List view invite buttons
      document.querySelectorAll('.agency-dashboard__scout-list-invite').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = 'true';
        
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this.handleInvite(btn);
        });
      });
    },

    async handleInvite(btn) {
      const profileId = btn.dataset.profileId;
      const name = btn.dataset.profileName || 'Talent';

      const confirmed = await window.Toast.confirm(
        `Invite ${name} to apply to your agency?`, 
        'Send Invitation'
      );
      if (!confirmed) return;

      btn.disabled = true;
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<span>Inviting...</span>';

      try {
        const response = await fetch(`/dashboard/agency/discover/${profileId}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });

        if (response.ok) {
          if (window.Toast) window.Toast.success(`Invitation sent to ${name}`);
          btn.innerHTML = '<span>Invited</span>';
          btn.style.background = '#10b981';
        } else {
          throw new Error('Invite failed');
        }
      } catch (err) {
        console.error(err);
        if (window.Toast) window.Toast.error('Failed to send invitation');
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    },

    initTrendingCarousel() {
      // Initialize both trending carousels
      this.initCarousel('trending-city-carousel', 'trending-city-prev', 'trending-city-next', 300);
      this.initCarousel('new-faces-carousel', 'new-faces-prev', 'new-faces-next', 300);
    },

    initCarousel(carouselId, prevId, nextId, cardWidth) {
      const carousel = document.getElementById(carouselId);
      const track = carousel?.querySelector('.discover-trending__track');
      const prevBtn = document.getElementById(prevId);
      const nextBtn = document.getElementById(nextId);

      if (!track) return;

      let scrollPosition = 0;
      const gap = 16; // gap between cards
      const scrollAmount = (cardWidth + gap) * 2;

      const scroll = (direction) => {
        const maxScroll = track.scrollWidth - track.clientWidth;
        scrollPosition += direction * scrollAmount;
        scrollPosition = Math.max(0, Math.min(scrollPosition, maxScroll));
        track.scrollTo({ left: scrollPosition, behavior: 'smooth' });
      };

      if (prevBtn) {
        prevBtn.addEventListener('click', () => scroll(-1));
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => scroll(1));
      }

      // Update button states
      const updateButtons = () => {
        if (prevBtn) prevBtn.disabled = scrollPosition <= 0;
        if (nextBtn) nextBtn.disabled = scrollPosition >= track.scrollWidth - track.clientWidth;
      };

      track.addEventListener('scroll', () => {
        scrollPosition = track.scrollLeft;
        updateButtons();
      });

      updateButtons();
    },

    initDiscoverPage() {
      // Load profiles from window data
      if (window.AGENCY_DASHBOARD_DATA && window.AGENCY_DASHBOARD_DATA.profiles) {
        this.profiles = [...window.AGENCY_DASHBOARD_DATA.profiles];
      }
      
      // Initialize sort dropdown
      this.initSortDropdown();
      
      // Quick View Handlers - Use the same drawer as applicants/inbox
      document.querySelectorAll('.agency-dashboard__scout-preview-btn, .agency-dashboard__scout-list-preview').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const profileId = btn.dataset.profileId;
          if (profileId && window.AgencyDashboard?.Applicants?.openApplicationDetail) {
            window.AgencyDashboard.Applicants.openApplicationDetail(profileId);
          }
        });
      });

      // Card click handlers (open preview using same drawer)
      document.querySelectorAll('.agency-dashboard__scout-card, .agency-dashboard__scout-list-item').forEach(card => {
        card.addEventListener('click', (e) => {
          // Don't trigger if clicking a button
          if (e.target.closest('button') || e.target.closest('a')) return;
          
          const profileId = card.dataset.profileId;
          if (profileId && window.AgencyDashboard?.Applicants?.openApplicationDetail) {
            window.AgencyDashboard.Applicants.openApplicationDetail(profileId);
          }
        });
      });

      // Filter toggle removed - sidebar no longer used
    },

    initSortDropdown() {
      const dropdown = document.getElementById('discover-sort-dropdown');
      const trigger = document.getElementById('discover-sort-trigger');
      const menu = document.getElementById('discover-sort-menu');
      const triggerText = document.getElementById('discover-sort-trigger-text');
      const items = menu?.querySelectorAll('.discover-sort-dropdown__item');
      
      if (!dropdown || !trigger || !menu) return;

      // Get initial sort from URL or default to 'relevance'
      const urlParams = new URLSearchParams(window.location.search);
      const initialSort = urlParams.get('sort') || 'relevance';
      this.sortBy = initialSort;
      this.updateSortDropdown(initialSort, triggerText, items);
      this.applySorting();

      // Toggle dropdown
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('is-open');
        if (isOpen) {
          dropdown.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        } else {
          dropdown.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });

      // Handle item clicks
      items?.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const sortValue = item.dataset.sort;
          this.sortBy = sortValue;
          this.updateSortDropdown(sortValue, triggerText, items);
          this.applySorting();
          dropdown.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        });
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
          dropdown.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });

      // Close on Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dropdown.classList.contains('is-open')) {
          dropdown.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });
    },

    updateSortDropdown(activeSort, triggerText, items) {
      const sortLabels = {
        'relevance': 'Relevance',
        'newest': 'Newest First',
        'az': 'A-Z'
      };

      if (triggerText) {
        triggerText.textContent = sortLabels[activeSort] || 'Relevance';
      }

      items?.forEach(item => {
        const check = item.querySelector('.discover-sort-dropdown__check');
        if (item.dataset.sort === activeSort) {
          item.classList.add('discover-sort-dropdown__item--active');
          if (check) check.style.display = 'block';
        } else {
          item.classList.remove('discover-sort-dropdown__item--active');
          if (check) check.style.display = 'none';
        }
      });
    },

    applySorting() {
      if (!this.profiles || this.profiles.length === 0) return;

      const sorted = this.getSortedProfiles([...this.profiles]);
      
      // Re-render both grid and list views
      this.renderProfiles(sorted);
    },

    getSortedProfiles(profiles) {
      switch (this.sortBy) {
        case 'relevance':
          // Sort by AI match score descending (highest score first)
          return profiles.sort((a, b) => {
            const scoreA = a.match_score || 0;
            const scoreB = b.match_score || 0;
            // Primary sort: match score descending
            if (scoreB !== scoreA) {
              return scoreB - scoreA;
            }
            // Secondary sort: if scores are equal, sort by last name then first name
            const lastNameA = (a.last_name || '').trim().toLowerCase();
            const lastNameB = (b.last_name || '').trim().toLowerCase();
            const lastNameCompare = lastNameA.localeCompare(lastNameB);
            if (lastNameCompare !== 0) {
              return lastNameCompare;
            }
            const firstNameA = (a.first_name || '').trim().toLowerCase();
            const firstNameB = (b.first_name || '').trim().toLowerCase();
            return firstNameA.localeCompare(firstNameB);
          });

        case 'newest':
          // Sort by created_at descending
          return profiles.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
            const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
            return dateB - dateA;
          });

        case 'az':
          // Sort alphabetically by last name, then first name (A-Z ascending)
          return profiles.sort((a, b) => {
            // Get last names, fallback to empty string if missing
            const lastNameA = (a.last_name || '').trim().toLowerCase();
            const lastNameB = (b.last_name || '').trim().toLowerCase();
            
            // Compare last names first
            const lastNameCompare = lastNameA.localeCompare(lastNameB);
            if (lastNameCompare !== 0) {
              return lastNameCompare;
            }
            
            // If last names are equal, compare first names
            const firstNameA = (a.first_name || '').trim().toLowerCase();
            const firstNameB = (b.first_name || '').trim().toLowerCase();
            return firstNameA.localeCompare(firstNameB);
          });

        default:
          return profiles;
      }
    },

    renderProfiles(sortedProfiles) {
      // Create a map of profile ID to index for quick lookup
      const profileIndexMap = new Map();
      sortedProfiles.forEach((profile, index) => {
        profileIndexMap.set(profile.id, index);
      });

      // Get grid and list containers - preserve current view mode
      const gridView = document.getElementById('discover-talent-grid');
      const listView = document.getElementById('discover-talent-list');
      
      // Determine current view mode - don't reset it
      const isGridView = gridView?.classList.contains('discover-view--active') || 
                        (!listView?.classList.contains('discover-view--active') && this.currentView === 'grid');

      if (isGridView && gridView) {
        const grid = gridView.querySelector('.discover-grid');
        if (grid) {
          // Get all existing cards
          const cards = Array.from(grid.querySelectorAll('.discover-card[data-profile-id]'));
          
          // Sort cards by their profile index in the sorted array
          cards.sort((a, b) => {
            const idA = a.dataset.profileId;
            const idB = b.dataset.profileId;
            const indexA = profileIndexMap.get(idA) ?? Infinity;
            const indexB = profileIndexMap.get(idB) ?? Infinity;
            return indexA - indexB;
          });
          
          // Re-append cards in sorted order (this preserves all classes and structure)
          // Use DocumentFragment for better performance
          const fragment = document.createDocumentFragment();
          cards.forEach(card => {
            fragment.appendChild(card);
          });
          grid.appendChild(fragment);
        }
      } else if (listView) {
        const items = Array.from(listView.querySelectorAll('.agency-dashboard__scout-list-item[data-profile-id]'));
        // Sort items by their profile index
        items.sort((a, b) => {
          const idA = a.dataset.profileId;
          const idB = b.dataset.profileId;
          const indexA = profileIndexMap.get(idA) ?? Infinity;
          const indexB = profileIndexMap.get(idB) ?? Infinity;
          return indexA - indexB;
        });
        // Re-append in sorted order
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
          fragment.appendChild(item);
        });
        listView.appendChild(fragment);
      }

      // Update URL without reload
      const url = new URL(window.location.href);
      url.searchParams.set('sort', this.sortBy);
      window.history.pushState({}, '', url);
    },

    initKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // Focus search on / or s
        if ((e.key === '/' || e.key === 's') && !e.target.matches('input, textarea')) {
          const searchInput = document.getElementById('discover-hero-query');
          if (searchInput) {
            e.preventDefault();
            searchInput.focus();
          }
        }

        // Toggle view with v
        if (e.key === 'v' && !e.target.matches('input, textarea')) {
          e.preventDefault();
          this.switchView(this.currentView === 'grid' ? 'list' : 'grid');
        }
      });
    },

    updateResultsCount() {
      const grid = document.getElementById('discover-talent-grid');
      const list = document.getElementById('discover-talent-list');
      const countEl = document.getElementById('discover-results-count');
      
      if (!countEl) return;

      // Count from both views (they should have same count)
      const gridCount = grid?.querySelectorAll('.agency-dashboard__scout-card').length || 0;
      const listCount = list?.querySelectorAll('.agency-dashboard__scout-list-item').length || 0;
      const count = Math.max(gridCount, listCount);
      
      countEl.textContent = `${count} ${count === 1 ? 'result' : 'results'}`;
    },

    updateEmptyState() {
      const gridView = document.getElementById('discover-talent-grid');
      const listView = document.getElementById('discover-talent-list');
      const emptyState = document.querySelector('.agency-dashboard__empty-state.discover-view');
      
      if (!emptyState) return;
      
      const gridCount = gridView?.querySelectorAll('.agency-dashboard__scout-card').length || 0;
      const listCount = listView?.querySelectorAll('.agency-dashboard__scout-list-item').length || 0;
      const hasResults = gridCount > 0 || listCount > 0;
      
      if (hasResults) {
        emptyState.classList.remove('discover-view--active');
      } else {
        // Hide both views and show empty state
        gridView?.classList.remove('discover-view--active');
        listView?.classList.remove('discover-view--active');
        emptyState.classList.add('discover-view--active');
      }
    },

    initLazyLoading() {
      // Lazy load images
      if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                observer.unobserve(img);
              }
            }
          });
        }, {
          rootMargin: '50px'
        });

        document.querySelectorAll('img[data-src]').forEach(img => {
          imageObserver.observe(img);
        });
      }
    },

    openQuickPreview(profileId) {
      const modal = document.getElementById('talent-preview-modal');
      const body = document.getElementById('talent-preview-body');
      if (!modal || !body) return;

      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';

      // Show loading state
      body.innerHTML = `
        <div class="talent-preview-modal__loading">
          <div class="loading-spinner"></div>
          <p>Loading profile...</p>
        </div>
      `;

      // Fetch profile data
      fetch(`/api/agency/discover/${profileId}/preview`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            this.renderPreview(data.profile);
          } else {
            throw new Error(data.error || 'Failed to load');
          }
        })
        .catch(err => {
          console.error('[Preview] Error:', err);
          body.innerHTML = `
            <div class="talent-preview-modal__loading">
              <p style="color: #ef4444;">Failed to load profile. Please try again.</p>
              <button onclick="window.AgencyDashboard.Discover.closeQuickPreview()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #0f172a; color: white; border: none; border-radius: 6px; cursor: pointer;">Close</button>
            </div>
          `;
        });

      // Close handlers
      const closeBtn = document.getElementById('talent-preview-close');
      const overlay = modal.querySelector('.talent-preview-modal__overlay');
      
      if (closeBtn) {
        closeBtn.onclick = () => this.closeQuickPreview();
      }
      if (overlay) {
        overlay.onclick = () => this.closeQuickPreview();
      }

      // ESC key
      const handleEsc = (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
          this.closeQuickPreview();
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);
    },

    renderPreview(profile) {
      const body = document.getElementById('talent-preview-body');
      if (!body) return;

      const heightFeet = profile.height_cm ? Math.floor(profile.height_cm / 30.48) : null;
      const heightInches = profile.height_cm ? Math.round((profile.height_cm % 30.48) / 2.54) : null;
      const heightDisplay = heightFeet && heightInches ? `${heightFeet}'${heightInches}"` : profile.height_cm ? `${profile.height_cm} cm` : '--';
      const location = profile.city && profile.country 
        ? `${profile.city}, ${profile.country}`
        : profile.city || 'Location not specified';

      body.innerHTML = `
        <div class="talent-preview-modal__image">
          ${profile.hero_image_path ? `<img src="${profile.hero_image_path.startsWith('http') ? profile.hero_image_path : '/' + profile.hero_image_path}" alt="${profile.first_name} ${profile.last_name}">` : ''}
        </div>
        <div class="talent-preview-modal__info">
          <h2 class="talent-preview-modal__name">${profile.first_name} ${profile.last_name}</h2>
          <p class="talent-preview-modal__location">${location}</p>
          <div class="talent-preview-modal__stats">
            <div class="talent-preview-modal__stat">
              <span class="talent-preview-modal__stat-label">Height</span>
              <span class="talent-preview-modal__stat-value">${heightDisplay}</span>
            </div>
            <div class="talent-preview-modal__stat">
              <span class="talent-preview-modal__stat-label">Age</span>
              <span class="talent-preview-modal__stat-value">${profile.age || '--'} Years</span>
            </div>
          </div>
          ${profile.bio ? `<p class="talent-preview-modal__bio">${profile.bio}</p>` : ''}
          <div class="talent-preview-modal__actions">
            <a href="/portfolio/${profile.slug}" target="_blank" class="talent-preview-modal__btn talent-preview-modal__btn--primary">
              View Full Profile
            </a>
            <button class="talent-preview-modal__btn talent-preview-modal__btn--secondary" data-profile-id="${profile.id}" data-profile-name="${profile.first_name} ${profile.last_name}">
              Invite to Apply
            </button>
          </div>
        </div>
      `;

      // Bind invite button
      const inviteBtn = body.querySelector('[data-profile-id]');
      if (inviteBtn) {
        inviteBtn.addEventListener('click', () => {
          this.handleInvite(inviteBtn);
          this.closeQuickPreview();
        });
      }
    },

    closeQuickPreview() {
      const modal = document.getElementById('talent-preview-modal');
      if (!modal) return;

      modal.style.display = 'none';
      document.body.style.overflow = '';
    },

    showSkeletonLoaders() {
      const activeView = document.querySelector('.discover-view--active');
      if (!activeView) return;

      const skeletonCount = 6;
      const isGrid = activeView.classList.contains('discover-view--grid');
      
      if (isGrid) {
        activeView.innerHTML = Array(skeletonCount).fill(0).map(() => `
          <div class="discover-skeleton discover-skeleton--card"></div>
        `).join('');
      } else {
        activeView.innerHTML = Array(skeletonCount).fill(0).map(() => `
          <div class="discover-skeleton" style="height: 120px; border-radius: 12px;"></div>
        `).join('');
      }
    },

    hideSkeletonLoaders() {
      // Skeleton loaders will be replaced by actual content
    },

    showError(message) {
      const activeView = document.querySelector('.discover-view--active');
      if (!activeView) return;

      activeView.innerHTML = `
        <div class="discover-error">
          <svg class="discover-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h3 class="discover-error-title">Something went wrong</h3>
          <p class="discover-error-text">${message}</p>
          <button class="discover-error-action" onclick="window.location.reload()">Reload Page</button>
        </div>
      `;
    }
  };

  window.AgencyDashboard = window.AgencyDashboard || {};
  window.AgencyDashboard.Discover = Discover;

})(window);
