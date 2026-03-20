/**
 * Agency Command Center JavaScript
 * 
 * Handles:
 * - Interactive hotspots on hover/tap
 * - Instant agency name personalization
 * - Micro-slider functionality
 * - Animated count-ups
 * - Mobile tab switcher
 */

(function() {
  'use strict';

  console.log('[Agency Command Center] Script loaded');

  // ============================================
  // Interactive Hotspots
  // ============================================

  function initHotspots() {
    const commandCenter = document.getElementById('agency-command-center');
    const hotspots = document.getElementById('command-hotspots');

    if (!commandCenter || !hotspots) return;

    const isMobile = window.innerWidth < 768;
    let hotspotsVisible = false;

    function toggleHotspots(visible) {
      if (isMobile) {
        // Toggle on mobile
        if (visible) {
          hotspots.style.opacity = '0';
          hotspotsVisible = false;
        } else {
          hotspots.style.opacity = '1';
          hotspotsVisible = true;
        }
      } else {
        // Hover on desktop (handled by CSS)
        return;
      }
    }

    if (isMobile) {
      // Mobile: tap to toggle
      commandCenter.addEventListener('click', (e) => {
        if (e.target.closest('.agency-hotspot')) return;
        toggleHotspots(hotspotsVisible);
      });

      // Close hotspots when clicking outside on mobile
      document.addEventListener('click', (e) => {
        if (!commandCenter.contains(e.target) && hotspotsVisible) {
          toggleHotspots(true);
        }
      });
    }
  }

  // ============================================
  // Instant Agency Name Personalization
  // ============================================

  function initAgencyPersonalization() {
    const previewForm = document.getElementById('preview-form');
    const agencyInput = document.getElementById('preview-agency-input');
    const previewCta = document.getElementById('preview-cta');
    const agencyNameDisplay = document.getElementById('agency-name-display');

    if (!previewForm || !agencyInput || !agencyNameDisplay) return;

    previewForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const agencyName = agencyInput.value.trim();

      if (!agencyName) {
        agencyInput.focus();
        return;
      }

      // Format name (capitalize first letter of each word)
      const formattedName = agencyName.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');

      // Animate name change with smooth morph/fade
      animateNameChange(agencyNameDisplay, formattedName);

      // Show CTA after name change
      setTimeout(() => {
        if (previewCta) {
          previewCta.style.display = 'block';
          previewCta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 600);
    });

    function animateNameChange(element, newName) {
      if (!element) return;

      // Add changing class for fade effect
      element.classList.add('name-changing');

      // Smooth morph effect
      setTimeout(() => {
        element.textContent = '';
        element.classList.remove('name-changing');

        // Typewriter effect for premium feel
        let index = 0;
        const typeInterval = setInterval(() => {
          if (index < newName.length) {
            element.textContent += newName[index];
            index++;
          } else {
            clearInterval(typeInterval);
          }
        }, 40);
      }, 200);
    }
  }

  // ============================================
  // Micro-Slider Functionality
  // ============================================

  function initMicroSlider() {
    const slider = document.getElementById('micro-slider-input');
    const sliderHandle = document.getElementById('micro-slider-handle');
    const beforeSection = document.getElementById('micro-slider-before');
    const afterSection = document.getElementById('micro-slider-after');

    if (!slider || !sliderHandle || !beforeSection || !afterSection) return;

    const isMobile = window.innerWidth < 768;

    function updateSlider(value) {
      const percentage = value;
      
      // Update clip paths for smooth reveal
      beforeSection.setAttribute('data-slider-value', percentage);
      afterSection.setAttribute('data-slider-value', percentage);
      
      // Update handle position (only if handle exists and not mobile)
      if (sliderHandle && !isMobile) {
        sliderHandle.style.left = `${percentage}%`;
      }
      
      // Update divider line position
      const container = document.querySelector('.agency-command-center__micro-slider-container');
      if (container && container.style) {
        const divider = container.querySelector('::before');
        if (container.style.setProperty) {
          container.style.setProperty('--slider-position', `${percentage}%`);
        }
      }
      
      // Update clip paths with smooth transition
      const beforeClip = `inset(0 ${100 - percentage}% 0 0)`;
      const afterClip = `inset(0 0 0 ${percentage}%)`;
      
      beforeSection.style.clipPath = beforeClip;
      afterSection.style.clipPath = afterClip;
    }

    // Handle slider input
    slider.addEventListener('input', (e) => {
      updateSlider(parseFloat(e.target.value));
    });

    // Mobile: toggle buttons instead of slider
    if (isMobile) {
      const toggleBefore = document.createElement('button');
      const toggleAfter = document.createElement('button');
      toggleBefore.className = 'agency-command-center__toggle-button active';
      toggleBefore.textContent = 'Traditional';
      toggleAfter.className = 'agency-command-center__toggle-button';
      toggleAfter.textContent = 'Pholio';

      const toggleContainer = document.createElement('div');
      toggleContainer.className = 'agency-command-center__micro-slider-toggle';
      toggleContainer.appendChild(toggleBefore);
      toggleContainer.appendChild(toggleAfter);

      const header = document.querySelector('.agency-command-center__micro-slider-header');
      if (header) {
        header.appendChild(toggleContainer);
      }

      slider.style.display = 'none';
      if (sliderHandle) sliderHandle.style.display = 'none';

      toggleBefore.addEventListener('click', () => {
        toggleBefore.classList.add('active');
        toggleAfter.classList.remove('active');
        updateSlider(0);
        slider.value = 0;
      });

      toggleAfter.addEventListener('click', () => {
        toggleAfter.classList.add('active');
        toggleBefore.classList.remove('active');
        updateSlider(100);
        slider.value = 100;
      });
    }

    // Initialize
    updateSlider(0);
  }

  // ============================================
  // Animated Metric Count-Ups
  // ============================================

  function initMetricAnimations() {
    const kpiValues = document.querySelectorAll('.agency-command-center__kpi-value[data-count-target]');
    const statValue = document.querySelector('.dashboard-showcase__stat-value[data-count-target]');

    if (kpiValues.length === 0 && !statValue) return;

    // Use Intersection Observer for viewport-triggered animations
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.3
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.target.dataset.countAnimated === 'false') {
          animateCountUp(entry.target);
          entry.target.dataset.countAnimated = 'true';
        }
      });
    }, observerOptions);

    // Observe all count elements
    kpiValues.forEach(el => observer.observe(el));
    if (statValue) observer.observe(statValue);

    function animateCountUp(element) {
      const target = parseInt(element.dataset.countTarget);
      const duration = 1500; // 1.5 seconds for luxurious feel
      const startTime = performance.now();
      const startValue = 0;

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out cubic)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.floor(startValue + (target - startValue) * easeOut);
        
        element.textContent = currentValue.toString();
        
        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          element.textContent = target.toString();
          element.classList.add('count-complete');
        }
      }

      requestAnimationFrame(update);
    }
  }

  // ============================================
  // Mobile Tab Switcher
  // ============================================

  function initMobileTabSwitcher() {
    if (window.innerWidth >= 1024) return;

    const main = document.querySelector('.agency-command-center__main');
    if (!main) return;

    // Create tab switcher
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'agency-command-center__tabs-mobile';

    const overviewTab = document.createElement('button');
    overviewTab.className = 'agency-command-center__tab-mobile active';
    overviewTab.textContent = 'Overview';
    overviewTab.setAttribute('aria-label', 'Show Overview');

    const discoverTab = document.createElement('button');
    discoverTab.className = 'agency-command-center__tab-mobile';
    discoverTab.textContent = 'Discover';
    discoverTab.setAttribute('aria-label', 'Show Discover');

    const boardsTab = document.createElement('button');
    boardsTab.className = 'agency-command-center__tab-mobile';
    boardsTab.textContent = 'Boards';
    boardsTab.setAttribute('aria-label', 'Show Boards');

    tabsContainer.appendChild(overviewTab);
    tabsContainer.appendChild(discoverTab);
    tabsContainer.appendChild(boardsTab);

    // Insert before main content
    main.parentNode.insertBefore(tabsContainer, main);

    // Get layers
    const overviewLayer = document.querySelector('.agency-command-center__overview-layer');
    const applicantsLayer = document.querySelector('.agency-command-center__applicants-layer');
    const discoverLayer = document.querySelector('.agency-command-center__discover-layer');
    const boardLayer = document.querySelector('.agency-command-center__board-layer');
    const analyticsLayer = document.querySelector('.agency-command-center__analytics-layer');

    // Tab switching logic
    function showTab(tabName) {
      // Reset all tabs
      [overviewTab, discoverTab, boardsTab].forEach(tab => tab.classList.remove('active'));

      // Hide all layers
      [overviewLayer, applicantsLayer, discoverLayer, boardLayer, analyticsLayer].forEach(layer => {
        if (layer) layer.style.display = 'none';
      });

      // Show relevant layers based on tab
      if (tabName === 'overview') {
        overviewTab.classList.add('active');
        if (overviewLayer) overviewLayer.style.display = 'block';
        if (applicantsLayer) applicantsLayer.style.display = 'block';
        if (analyticsLayer) analyticsLayer.style.display = 'flex';
      } else if (tabName === 'discover') {
        discoverTab.classList.add('active');
        if (discoverLayer) discoverLayer.style.display = 'block';
      } else if (tabName === 'boards') {
        boardsTab.classList.add('active');
        if (boardLayer) boardLayer.style.display = 'block';
      }
    }

    overviewTab.addEventListener('click', () => showTab('overview'));
    discoverTab.addEventListener('click', () => showTab('discover'));
    boardsTab.addEventListener('click', () => showTab('boards'));

    // Initially show overview
    showTab('overview');
  }

  // ============================================
  // Initialize Everything
  // ============================================

  function init() {
    initHotspots();
    initAgencyPersonalization();
    initMicroSlider();
    initMetricAnimations();
    
    // Mobile tab switcher only on mobile
    if (window.innerWidth < 1024) {
      initMobileTabSwitcher();
    }

    // Re-initialize mobile features on resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (window.innerWidth < 1024) {
          initMobileTabSwitcher();
        }
      }, 250);
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

