/**
 * Agency Hero JavaScript
 * 
 * Handles:
 * - Agency name personalization with Framer Motion-like morph
 * - Interactive hotspots on hover/tap
 * - Micro-slider functionality
 * - Animated count-ups
 * - Mobile carousel/accordion
 * - Sticky personalization bar on mobile
 * 
 * Total size: < 20 KB
 */

(function() {
  'use strict';

  console.log('[Agency Hero] Script loaded');

  // ============================================
  // Agency Name Personalization
  // ============================================

  function initPersonalization() {
    const form = document.getElementById('preview-form');
    const input = document.getElementById('preview-agency-input');
    const cta = document.getElementById('preview-cta');
    const nameDisplays = document.querySelectorAll('#agency-name-display, .agency-hero__sidebar-name');

    if (!form || !input || nameDisplays.length === 0) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const agencyName = input.value.trim();
      if (!agencyName) {
        input.focus();
        return;
      }

      // Format name (capitalize first letter of each word)
      const formattedName = agencyName.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');

      // Smooth morph animation
      nameDisplays.forEach(el => {
        animateNameChange(el, formattedName);
      });

      // Show CTA after animation
      setTimeout(() => {
        if (cta) {
          cta.style.display = 'block';
          cta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 800);
    });

    function animateNameChange(element, newName) {
      if (!element) return;

      // Fade out
      element.style.opacity = '0';
      element.style.transform = 'scale(0.95)';

      setTimeout(() => {
        element.textContent = '';
        element.style.opacity = '1';
        element.style.transform = 'scale(1)';

        // Typewriter effect
        let index = 0;
        const typeInterval = setInterval(() => {
          if (index < newName.length) {
            element.textContent += newName[index];
            index++;
          } else {
            clearInterval(typeInterval);
          }
        }, 30);
      }, 200);
    }
  }

  // ============================================
  // Interactive Hotspots
  // ============================================

  function initHotspots() {
    const center = document.getElementById('agency-command-center');
    const hotspots = document.getElementById('command-hotspots');

    if (!center || !hotspots) return;

    const isMobile = window.innerWidth < 768;
    let hotspotsVisible = false;

    if (isMobile) {
      // Mobile: tap to toggle
      center.addEventListener('click', (e) => {
        if (e.target.closest('.agency-hero__hotspot')) return;
        hotspotsVisible = !hotspotsVisible;
        hotspots.style.opacity = hotspotsVisible ? '1' : '0';
      });
    }
    // Desktop: hover handled by CSS
  }

  // ============================================
  // Micro-Slider
  // ============================================

  function initMicroSlider() {
    const slider = document.getElementById('micro-slider-input');
    const handle = document.getElementById('micro-slider-handle');
    const before = document.getElementById('micro-slider-before');
    const after = document.getElementById('micro-slider-after');
    const container = document.querySelector('.agency-hero__slider-container');

    if (!slider || !before || !after || !container) return;

    const isMobile = window.innerWidth < 768;

    function updateSlider(value) {
      const percentage = value;
      
      // Update clip paths
      const beforeClip = `inset(0 ${100 - percentage}% 0 0)`;
      const afterClip = `inset(0 0 0 ${percentage}%)`;
      
      before.style.clipPath = beforeClip;
      after.style.clipPath = afterClip;
      
      // Update handle and divider
      if (handle && !isMobile) {
        handle.style.left = `${percentage}%`;
      }
      
      if (container) {
        container.style.setProperty('--slider-position', `${percentage}%`);
      }
    }

    slider.addEventListener('input', (e) => {
      updateSlider(parseFloat(e.target.value));
    });

    // Mobile: toggle buttons
    if (isMobile) {
      const toggleBefore = document.createElement('button');
      const toggleAfter = document.createElement('button');
      toggleBefore.className = 'agency-hero__slider-toggle-button active';
      toggleBefore.textContent = 'Traditional';
      toggleAfter.className = 'agency-hero__slider-toggle-button';
      toggleAfter.textContent = 'Pholio';

      const toggleContainer = document.createElement('div');
      toggleContainer.className = 'agency-hero__slider-toggle';
      toggleContainer.appendChild(toggleBefore);
      toggleContainer.appendChild(toggleAfter);

      const header = document.querySelector('.agency-hero__slider-header');
      if (header) {
        header.appendChild(toggleContainer);
      }

      slider.style.display = 'none';
      if (handle) handle.style.display = 'none';

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

    updateSlider(0);
  }

  // ============================================
  // Animated Count-Ups
  // ============================================

  function initMetricAnimations() {
    const kpiValues = document.querySelectorAll('.agency-hero__kpi-value[data-count-target]');

    if (kpiValues.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.target.dataset.countAnimated === 'false') {
          animateCountUp(entry.target);
          entry.target.dataset.countAnimated = 'true';
        }
      });
    }, { threshold: 0.3 });

    kpiValues.forEach(el => observer.observe(el));

    function animateCountUp(element) {
      const target = parseInt(element.dataset.countTarget);
      const duration = 1500;
      const startTime = performance.now();
      const startValue = 0;

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.floor(startValue + (target - startValue) * easeOut);
        
        element.textContent = currentValue.toString();
        
        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          element.textContent = target.toString();
        }
      }

      requestAnimationFrame(update);
    }
  }

  // ============================================
  // Mobile Carousel/Accordion
  // ============================================

  function initMobileSnippets() {
    if (window.innerWidth >= 1024) return;

    const exploded = document.querySelector('.agency-hero__exploded');
    if (!exploded) return;

    // Convert to carousel
    exploded.classList.add('agency-hero__snippet-carousel');
    
    // Make snippets scrollable
    const snippets = exploded.querySelectorAll('.agency-hero__snippet');
    snippets.forEach(snippet => {
      snippet.style.flex = '0 0 85%';
      snippet.style.scrollSnapAlign = 'start';
    });
  }

  // ============================================
  // Initialize Everything
  // ============================================

  function init() {
    initPersonalization();
    initHotspots();
    initMicroSlider();
    initMetricAnimations();
    
    if (window.innerWidth < 1024) {
      initMobileSnippets();
    }

    // Re-initialize on resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (window.innerWidth < 1024) {
          initMobileSnippets();
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


