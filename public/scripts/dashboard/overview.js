/**
 * Agency Dashboard - Overview Module
 * Handles overview page functionality: greeting, dynamic stats, and interactions
 */

(function(window) {
  'use strict';

  const Overview = {
    init() {
      const overviewSection = document.getElementById('overview-dashboard');
      if (!overviewSection) return;

      // Update greeting immediately (basic version)
      this.updateGreeting();
      
      // Initialize interactions
      this.initRecentApplicants();
      this.initQuickActions();
      
      // Update with dynamic text immediately (using available data)
      this.updateDynamicText();
      
      // Load stats and enhance dynamic text after stats load
      this.loadOverviewStats().then(() => {
        this.updateDynamicText(); // Update again with fresh stats
      }).catch((error) => {
        console.error('[Overview] Initialization error:', error);
        // Text already updated with available data, no need to update again
      });
    },

    /**
     * Update greeting based on user's local timezone
     */
    updateGreeting() {
      const greetingElement = document.getElementById('overview-greeting');
      if (!greetingElement) return;

      const hour = new Date().getHours();
      let greeting = 'Good Morning';
      
      if (hour >= 12 && hour < 17) {
        greeting = 'Good Afternoon';
      } else if (hour >= 17 && hour < 22) {
        greeting = 'Good Evening';
      } else if (hour >= 22 || hour < 5) {
        greeting = 'Good Night';
      }

      // Get agency name from data attribute or fallback
      const agencyName = greetingElement.dataset.agencyName || 'Agency';
      
      // Store for use in dynamic header
      this.currentGreeting = greeting;
      this.agencyName = agencyName;
      
      // Update only the greeting time text (agency name stays in template with gradient)
      const greetingTimeElement = document.getElementById('greeting-time');
      if (greetingTimeElement) {
        greetingTimeElement.textContent = `${greeting},`;
      }
    },

    /**
     * Load overview stats from API and update KPIs
     */
    async loadOverviewStats() {
      const talentPoolElement = document.getElementById('overview-talent-pool');
      const boardsGrowthElement = document.getElementById('overview-boards-growth');
      
      // Show loading state
      if (talentPoolElement) {
        talentPoolElement.textContent = '—';
        talentPoolElement.classList.add('loading');
      }
      if (boardsGrowthElement) {
        boardsGrowthElement.textContent = '—';
        boardsGrowthElement.classList.add('loading');
      }

      try {
        const response = await fetch('/api/agency/overview/stats');
        if (!response.ok) throw new Error('Failed to fetch stats');
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to load stats');

        // Update talent pool
        if (talentPoolElement && data.stats.totalTalentPool !== undefined) {
          talentPoolElement.textContent = data.stats.totalTalentPool.toLocaleString();
          talentPoolElement.classList.remove('loading');
        }

        // Update board growth
        if (boardsGrowthElement && data.stats.boardGrowth !== undefined) {
          const growth = data.stats.boardGrowth;
          const sign = growth >= 0 ? '+' : '';
          boardsGrowthElement.textContent = `${sign}${growth}%`;
          boardsGrowthElement.classList.remove('loading');
          
          // Add visual indicator class
          boardsGrowthElement.classList.remove('positive', 'negative', 'neutral');
          if (growth > 0) {
            boardsGrowthElement.classList.add('positive');
          } else if (growth < 0) {
            boardsGrowthElement.classList.add('negative');
          } else {
            boardsGrowthElement.classList.add('neutral');
          }
        }

        // Store stats for use in dynamic header/subheader
        this.stats = data.stats;
      } catch (error) {
        console.error('[Overview] Failed to load stats:', error);
        
        // Show error state with graceful fallback
        if (talentPoolElement) {
          talentPoolElement.textContent = '—';
          talentPoolElement.classList.remove('loading');
          talentPoolElement.classList.add('error');
          talentPoolElement.title = 'Unable to load talent pool data';
        }
        if (boardsGrowthElement) {
          boardsGrowthElement.textContent = '—';
          boardsGrowthElement.classList.remove('loading');
          boardsGrowthElement.classList.add('error');
          boardsGrowthElement.title = 'Unable to load growth data';
        }

        // Show toast notification only if it's not a network error (user might be offline)
        if (error.message && !error.message.includes('fetch')) {
          if (window.Toast) {
            window.Toast.error('Failed to load overview statistics', 'Overview');
          }
        }
      }
    },

    /**
     * Initialize recent applicants click handlers
     */
    initRecentApplicants() {
      const recentList = document.getElementById('overview-recent-applicants');
      if (!recentList) return;

      recentList.addEventListener('click', (e) => {
        const item = e.target.closest('.agency-overview__recent-item');
        if (!item) return;

        const applicationId = item.dataset.applicationId;
        const profileId = item.dataset.profileId;

        if (profileId) {
          // Try to use Applicants module if available
          if (window.AgencyDashboard && window.AgencyDashboard.Applicants) {
            if (window.AgencyDashboard.Applicants.openApplicationDetail) {
              window.AgencyDashboard.Applicants.openApplicationDetail(profileId, applicationId);
              return;
            }
          }
          
          // Fallback: navigate to applicants page with filter
          if (applicationId) {
            window.location.href = `/dashboard/agency/applicants?application_id=${applicationId}`;
          } else {
            window.location.href = `/dashboard/agency/applicants?profile_id=${profileId}`;
          }
        }
      });
    },

    /**
     * Initialize quick action buttons
     */
    initQuickActions() {
      const createBoardBtn = document.getElementById('quick-action-create-board');
      if (createBoardBtn) {
        createBoardBtn.addEventListener('click', () => {
          if (window.openBoardEditor) {
            window.openBoardEditor();
          } else {
            window.location.href = '/dashboard/agency/boards';
          }
        });
      }
    },

    /**
     * Get dynamic header text based on context
     */
    getDynamicHeader() {
      const hour = new Date().getHours();
      const dayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
      const pendingCount = this.getPendingCount();
      const newTodayCount = this.getNewTodayCount();
      
      const agencyName = this.agencyName || 'Agency';
      const greeting = this.currentGreeting || 'Hello';

      // Monday motivation
      if (dayOfWeek === 1) {
        if (pendingCount > 0) {
          return `Start your week strong, ${agencyName}! You have ${pendingCount} application${pendingCount !== 1 ? 's' : ''} to review`;
        }
        return `Start your week strong, ${agencyName}`;
      }

      // Friday wrap-up
      if (dayOfWeek === 5) {
        if (pendingCount === 0) {
          return `Wrap up the week, ${agencyName}. All caught up!`;
        }
        return `Wrap up the week, ${agencyName}. ${pendingCount} application${pendingCount !== 1 ? 's' : ''} pending`;
      }

      // Time-based with context
      if (hour >= 5 && hour < 12) { // Morning
        if (pendingCount > 0) {
          return `${greeting}, ${agencyName}! You have ${pendingCount} application${pendingCount !== 1 ? 's' : ''} to review`;
        }
        if (newTodayCount > 0) {
          return `${greeting}, ${agencyName}! ${newTodayCount} new face${newTodayCount !== 1 ? 's' : ''} joined today`;
        }
        return `${greeting}, ${agencyName}`;
      }

      if (hour >= 12 && hour < 17) { // Afternoon
        if (pendingCount === 0) {
          return `${greeting}, ${agencyName}. All caught up!`;
        }
        if (pendingCount > 5) {
          return `${greeting}, ${agencyName}. ${pendingCount} applications waiting`;
        }
        return `${greeting}, ${agencyName}`;
      }

      if (hour >= 17 && hour < 22) { // Evening
        if (newTodayCount > 0) {
          return `${greeting}, ${agencyName}. ${newTodayCount} new application${newTodayCount !== 1 ? 's' : ''} arrived today`;
        }
        if (pendingCount > 0) {
          return `${greeting}, ${agencyName}. ${pendingCount} application${pendingCount !== 1 ? 's' : ''} pending`;
        }
        return `${greeting}, ${agencyName}`;
      }

      // Night
      return `${greeting}, ${agencyName}`;
    },

    /**
     * Get dynamic subheader text based on context
     */
    getDynamicSubheader() {
      const pendingCount = this.getPendingCount();
      const newTodayCount = this.getNewTodayCount();
      const boardGrowth = this.stats?.boardGrowth || 0;
      const talentPool = this.stats?.totalTalentPool;

      // Priority: Pending applications
      if (pendingCount > 0) {
        return `You have ${pendingCount} pending application${pendingCount !== 1 ? 's' : ''} waiting for review`;
      }

      // New applications today
      if (newTodayCount > 0) {
        return `${newTodayCount} new application${newTodayCount !== 1 ? 's' : ''} arrived today`;
      }

      // All caught up
      if (pendingCount === 0) {
        return 'All applications are up to date. Ready to discover new talent?';
      }

      // Growth metrics
      if (boardGrowth > 0 && boardGrowth !== undefined) {
        return `Your boards have grown by ${boardGrowth}% this month`;
      }

      // Default
      return 'Here is your daily overview';
    },

    /**
     * Get pending applications count from DOM or stats
     */
    getPendingCount() {
      // Try to get from stats if available
      if (window.AGENCY_DASHBOARD_DATA && window.AGENCY_DASHBOARD_DATA.stats) {
        return window.AGENCY_DASHBOARD_DATA.stats.pending || 0;
      }
      
      // Fallback: try to find in DOM
      const pendingCard = document.querySelector('.agency-overview__kpi-card--highlight .agency-overview__kpi-value');
      if (pendingCard) {
        const count = parseInt(pendingCard.textContent);
        if (!isNaN(count)) return count;
      }
      
      return 0;
    },

    /**
     * Get new applications today count from stats
     */
    getNewTodayCount() {
      if (window.AGENCY_DASHBOARD_DATA && window.AGENCY_DASHBOARD_DATA.stats) {
        return window.AGENCY_DASHBOARD_DATA.stats.newToday || 0;
      }
      return 0;
    },

    /**
     * Update dynamic header and subheader
     */
    updateDynamicText() {
      // Note: Greeting structure is now static in template with gradient agency name
      // Only the time-based greeting text is updated by updateGreeting()
      // Subtitle is also static now: "Here is what is happening with your roster today."
      // No longer updating dynamically to preserve the new design structure
    },

    /**
     * Refresh overview data
     */
    async refresh() {
      await this.loadOverviewStats();
      this.updateDynamicText();
    }
  };

  // Expose globally
  window.AgencyDashboard = window.AgencyDashboard || {};
  window.AgencyDashboard.Overview = Overview;

  // Initialize on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    Overview.init();
  });

})(window);

