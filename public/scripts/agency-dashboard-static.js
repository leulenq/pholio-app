/**
 * Agency Dashboard Static - Apple-Level Hover Captions
 * 
 * Pixel-perfect tooltips with 100% coverage - every visual block is interactive
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    animationDuration: 180, // ms (matches Framer Motion ease: [0.16, 1, 0.3, 1])
    mobileTooltipDuration: 5000, // 5 seconds on mobile
    tooltipMaxWidth: 280,
    connectorWidth: 2,
    spacing: 16,
    viewportPadding: 16
  };

  // State
  let activeTooltip = null;
  let tooltipElement = null;
  let connectorElement = null;
  let mobileTimeout = null;
  let agencyName = 'True Modeling Agency';

  // Comprehensive tooltip zones - EVERY visual block
  const TOOLTIP_ZONES = [
    // Greeting
    {
      selector: '.agency-overview__greeting',
      caption: 'Your personalized dashboard greeting',
      position: 'top-center'
    },
    // KPI Cards - Individual
    {
      selector: '.agency-overview__kpi-card--highlight',
      caption: 'Your pending applications appear here',
      position: 'top-center'
    },
    {
      selector: '.agency-overview__kpi-grid > .agency-overview__kpi-card:nth-of-type(2)',
      caption: 'Your active casting boards',
      position: 'top-center'
    },
    {
      selector: '.agency-overview__kpi-grid > .agency-overview__kpi-card:nth-of-type(3)',
      caption: 'Your total talent pool',
      position: 'top-center'
    },
    // Recent Applicants Section
    {
      selector: '.agency-overview__recent-applicants .agency-overview__section-header',
      caption: 'Your recent applicants section',
      position: 'top-left'
    },
    // Individual Applicant Rows
    {
      selector: '.agency-overview__recent-item:nth-of-type(1)',
      caption: 'Your newest applicant with 94% AI match',
      position: 'right'
    },
    {
      selector: '.agency-overview__recent-item:nth-of-type(2)',
      caption: 'Your applicant from New York with 91% match',
      position: 'right'
    },
    {
      selector: '.agency-overview__recent-item:nth-of-type(3)',
      caption: 'Your applicant from Miami with 89% match',
      position: 'right'
    },
    // Quick Actions Section
    {
      selector: '.agency-overview__quick-actions .agency-overview__section-header',
      caption: 'Your quick actions section',
      position: 'bottom-center'
    },
    // Individual Quick Action Cards
    {
      selector: '.agency-overview__quick-action-card:nth-of-type(1)',
      caption: 'Your create new board action',
      position: 'bottom-center'
    },
    {
      selector: '.agency-overview__quick-action-card:nth-of-type(2)',
      caption: 'Your discover talent action',
      position: 'bottom-center'
    },
    {
      selector: '.agency-overview__quick-action-card:nth-of-type(3)',
      caption: 'Your review inbox action',
      position: 'bottom-center'
    },
    // Sidebar Elements
    {
      selector: '.agency-sidebar__logo',
      caption: 'Your Pholio logo',
      position: 'right'
    },
    {
      selector: '.agency-sidebar__brand',
      caption: 'Your agency branding',
      position: 'right'
    },
    {
      selector: '.agency-sidebar__search-trigger',
      caption: 'Your quick find command palette',
      position: 'right'
    },
    {
      selector: '.agency-sidebar__nav-item[data-page="overview"]',
      caption: 'Your command center',
      position: 'right'
    },
    {
      selector: '.agency-sidebar__nav-item[data-page="applicants"]',
      caption: 'Your inbox for new submissions',
      position: 'right'
    },
    {
      selector: '.agency-sidebar__nav-item[data-page="discover"]',
      caption: 'Your AI-powered talent discovery',
      position: 'right'
    },
    {
      selector: '.agency-sidebar__nav-item[data-page="boards"]',
      caption: 'Your drag-and-drop casting boards',
      position: 'right'
    },
    {
      selector: '.agency-sidebar__nav-item[data-page="analytics"]',
      caption: 'Your performance analytics',
      position: 'right'
    },
    {
      selector: '.agency-sidebar__footer .agency-sidebar__nav-item',
      caption: 'Your settings',
      position: 'right'
    }
  ];

  /**
   * Create transparent hover trigger divs for ALL zones
   */
  function createHoverTriggers() {
    const dashboard = document.getElementById('agency-hero-dashboard');
    if (!dashboard) return;

    const wrapper = document.getElementById('agency-dashboard-preview');
    if (!wrapper) return;

    // Remove existing triggers
    document.querySelectorAll('.apple-tooltip-trigger').forEach(t => t.remove());

    TOOLTIP_ZONES.forEach((zone, index) => {
      const element = dashboard.querySelector(zone.selector);
      if (!element) {
        console.warn(`Tooltip zone not found: ${zone.selector}`);
        return;
      }

      // Wait for layout to settle, use double RAF for reliable measurements
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const rect = element.getBoundingClientRect();
          const wrapperRect = wrapper.getBoundingClientRect();

          // Skip if element is not visible or has zero dimensions
          if (rect.width === 0 || rect.height === 0 || 
              rect.top === 0 && rect.left === 0 && rect.width === 0 && rect.height === 0) {
            return;
          }

          // Calculate position relative to wrapper
          const top = rect.top - wrapperRect.top;
          const left = rect.left - wrapperRect.left;
          const width = rect.width;
          const height = rect.height;

          // Ensure we're within wrapper bounds (safety check)
          if (top < 0 || left < 0 || top + height > wrapperRect.height || left + width > wrapperRect.width) {
            // Still create trigger but log warning
            console.warn(`Tooltip zone partially outside wrapper: ${zone.selector}`);
          }

          // Create transparent trigger covering the FULL element rectangle
          const trigger = document.createElement('div');
          trigger.className = 'apple-tooltip-trigger';
          trigger.setAttribute('data-zone-index', index);
          trigger.setAttribute('data-caption', zone.caption);
          trigger.setAttribute('data-position', zone.position);
          trigger.setAttribute('aria-label', zone.caption);
          
          // Use exact pixel coordinates relative to wrapper
          trigger.style.cssText = `
            position: absolute;
            top: ${Math.max(0, top)}px;
            left: ${Math.max(0, left)}px;
            width: ${width}px;
            height: ${height}px;
            background: transparent;
            cursor: pointer;
            z-index: 100;
            pointer-events: auto;
          `;

        // Add gold info icon in top-right corner
        const infoIcon = document.createElement('div');
        infoIcon.className = 'apple-tooltip-info-icon';
        infoIcon.innerHTML = '◦';
        infoIcon.setAttribute('aria-hidden', 'true');
        infoIcon.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          width: 16px;
          height: 16px;
          color: #C9A55A;
          font-size: 12px;
          line-height: 16px;
          text-align: center;
          opacity: 0.4;
          transition: opacity 0.2s ease;
          pointer-events: none;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
        `;
        trigger.appendChild(infoIcon);

        // Show icon on hover
        trigger.addEventListener('mouseenter', () => {
          infoIcon.style.opacity = '0.8';
        });
        trigger.addEventListener('mouseleave', () => {
          infoIcon.style.opacity = '0.4';
        });

          wrapper.appendChild(trigger);
        });
      });
    });
  }

  /**
   * Format caption with gold first word
   */
  function formatCaption(text) {
    const words = text.split(' ');
    if (words.length === 0) return text;
    
    const firstWord = words[0];
    const rest = words.slice(1).join(' ');
    
    return `<span class="apple-tooltip-first-word">${firstWord}</span> ${rest}`;
  }

  /**
   * Calculate tooltip position with smart viewport overflow prevention
   */
  function calculateTooltipPosition(triggerRect, tooltipRect, position, viewport) {
    const spacing = CONFIG.spacing;
    const padding = CONFIG.viewportPadding;
    let top, left;
    let finalPosition = position;

    // Calculate base position
    switch (position) {
      case 'top-center':
        top = triggerRect.top - tooltipRect.height - spacing;
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'top-left':
        top = triggerRect.top - tooltipRect.height - spacing;
        left = triggerRect.left;
        break;
      case 'top-right':
        top = triggerRect.top - tooltipRect.height - spacing;
        left = triggerRect.right - tooltipRect.width;
        break;
      case 'bottom-center':
        top = triggerRect.bottom + spacing;
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'bottom-left':
        top = triggerRect.bottom + spacing;
        left = triggerRect.left;
        break;
      case 'bottom-right':
        top = triggerRect.bottom + spacing;
        left = triggerRect.right - tooltipRect.width;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
        left = triggerRect.right + spacing;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
        left = triggerRect.left - tooltipRect.width - spacing;
        break;
      default:
        top = triggerRect.top - tooltipRect.height - spacing;
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
    }

    // Smart horizontal overflow prevention
    if (left < padding) {
      left = padding;
      // If we're on the right side, try left side
      if (position === 'right') {
        left = triggerRect.left - tooltipRect.width - spacing;
        finalPosition = 'left';
      }
    } else if (left + tooltipRect.width > viewport.width - padding) {
      left = viewport.width - tooltipRect.width - padding;
      // If we're on the left side, try right side
      if (position === 'left') {
        left = triggerRect.right + spacing;
        finalPosition = 'right';
      }
    }

    // Smart vertical overflow prevention with auto-flip
    if (top < padding) {
      // Try bottom
      if (position.includes('top')) {
        top = triggerRect.bottom + spacing;
        finalPosition = position.replace('top', 'bottom');
      } else {
        top = padding;
      }
    } else if (top + tooltipRect.height > viewport.height - padding) {
      // Try top
      if (position.includes('bottom')) {
        top = triggerRect.top - tooltipRect.height - spacing;
        finalPosition = position.replace('bottom', 'top');
      } else {
        top = viewport.height - tooltipRect.height - padding;
      }
    }

    return { top, left, position: finalPosition };
  }

  /**
   * Calculate connector line from trigger center to tooltip
   */
  function calculateConnector(triggerRect, tooltipRect, tooltipPos) {
    const triggerCenterX = triggerRect.left + (triggerRect.width / 2);
    const triggerCenterY = triggerRect.top + (triggerRect.height / 2);
    const tooltipCenterX = tooltipPos.left + (tooltipRect.width / 2);
    const tooltipCenterY = tooltipPos.top + (tooltipRect.height / 2);

    const dx = tooltipCenterX - triggerCenterX;
    const dy = tooltipCenterY - triggerCenterY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    return {
      x: triggerCenterX,
      y: triggerCenterY,
      length,
      angle
    };
  }

  /**
   * Show tooltip with Apple-level animation
   */
  function showTooltip(trigger, caption, position) {
    hideTooltip(); // Remove any existing tooltip

    const portal = document.getElementById('tooltip-portal');
    if (!portal) return;

    // Create tooltip element
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'apple-tooltip';
    tooltipElement.innerHTML = `<div class="apple-tooltip-content">${formatCaption(caption)}</div>`;
    portal.appendChild(tooltipElement);

    // Force layout calculation
    tooltipElement.style.visibility = 'hidden';
    tooltipElement.style.display = 'block';
    const tooltipRect = tooltipElement.getBoundingClientRect();

    // Get trigger position relative to viewport
    const triggerRect = trigger.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    // Calculate position with smart overflow prevention
    const tooltipPos = calculateTooltipPosition(triggerRect, tooltipRect, position, viewport);
    tooltipElement.style.top = `${tooltipPos.top}px`;
    tooltipElement.style.left = `${tooltipPos.left}px`;
    tooltipElement.style.visibility = 'visible';

    // Create connector line from trigger center
    const connector = calculateConnector(triggerRect, tooltipRect, tooltipPos);
    connectorElement = document.createElement('div');
    connectorElement.className = 'apple-tooltip-connector';
    connectorElement.style.cssText = `
      position: fixed;
      left: ${connector.x}px;
      top: ${connector.y}px;
      width: ${connector.length}px;
      height: ${CONFIG.connectorWidth}px;
      background: #C9A55A;
      transform: rotate(${connector.angle}deg);
      transform-origin: 0 50%;
      z-index: 9998;
      pointer-events: none;
      opacity: 0.6;
    `;
    portal.appendChild(connectorElement);

    // Show tooltip instantly - no animation
    tooltipElement.classList.add('apple-tooltip--visible');
  }

  /**
   * Hide tooltip instantly
   */
  function hideTooltip() {
    if (tooltipElement) {
      // Instant exit - no delay, no animation
      if (tooltipElement.parentNode) {
        tooltipElement.parentNode.removeChild(tooltipElement);
      }
      tooltipElement = null;
    }

    if (connectorElement) {
      if (connectorElement.parentNode) {
        connectorElement.parentNode.removeChild(connectorElement);
      }
      connectorElement = null;
    }

    if (mobileTimeout) {
      clearTimeout(mobileTimeout);
      mobileTimeout = null;
    }
  }

  /**
   * Initialize tooltip system
   */
  function initTooltips() {
    const dashboard = document.getElementById('agency-hero-dashboard');
    if (!dashboard) return;

    // Wait for layout to settle, then create triggers
    setTimeout(() => {
      createHoverTriggers();

      // Attach event listeners after a brief delay to ensure triggers are in DOM
      setTimeout(() => {
        attachEventListeners();
      }, 100);
    }, 100);
  }

  /**
   * Attach event listeners to all triggers
   */
  function attachEventListeners() {
    const triggers = document.querySelectorAll('.apple-tooltip-trigger');
    const isMobile = window.innerWidth < 768;

    triggers.forEach(trigger => {
      const caption = trigger.getAttribute('data-caption');
      const position = trigger.getAttribute('data-position') || 'top-center';

      if (isMobile) {
        // Mobile: tap behavior (5 seconds)
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (activeTooltip === trigger) {
            hideTooltip();
            activeTooltip = null;
          } else {
            showTooltip(trigger, caption, position);
            activeTooltip = trigger;

            // Auto-hide after 5 seconds
            mobileTimeout = setTimeout(() => {
              hideTooltip();
              activeTooltip = null;
            }, CONFIG.mobileTooltipDuration);
          }
        });
      } else {
        // Desktop: hover behavior (instant show/hide)
        trigger.addEventListener('mouseenter', () => {
          showTooltip(trigger, caption, position);
          activeTooltip = trigger;
        });

        trigger.addEventListener('mouseleave', () => {
          hideTooltip();
          activeTooltip = null;
        });
      }
    });

    // Close tooltip on outside click (mobile)
    if (isMobile) {
      document.addEventListener('click', (e) => {
        if (activeTooltip && 
            !activeTooltip.contains(e.target) && 
            !tooltipElement?.contains(e.target)) {
          hideTooltip();
          activeTooltip = null;
        }
      });
    }
  }

  /**
   * Initialize personalization listener
   */
  function initPersonalization() {
    const form = document.getElementById('preview-form');
    const input = document.getElementById('preview-agency-input');
    const cta = document.getElementById('preview-cta');
    
    if (!form || !input) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const newAgencyName = input.value.trim();
      
      if (!newAgencyName) return;

      agencyName = newAgencyName;

      // Update agency name displays
      const nameElements = document.querySelectorAll('#agency-name-display, #agency-name-greeting');
      nameElements.forEach(el => {
        if (el) {
          el.style.opacity = '0';
          el.style.transform = 'translateY(4px)';
          setTimeout(() => {
            el.textContent = newAgencyName;
            el.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
          }, 150);
        }
      });

      // Show CTA
      if (cta) {
        cta.style.display = 'block';
        cta.style.opacity = '0';
        cta.style.transform = 'translateY(8px)';
        cta.style.transition = 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        setTimeout(() => {
          cta.style.opacity = '1';
          cta.style.transform = 'translateY(0)';
        }, 10);
      }
    });
  }

  /**
   * Initialize animated metrics
   */
  function initAnimatedMetrics() {
    const kpiValues = document.querySelectorAll('[data-count-target]:not([data-count-animated="true"])');
    if (kpiValues.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target;
          const target = parseInt(element.getAttribute('data-count-target'), 10);
          if (isNaN(target)) return;

          element.setAttribute('data-count-animated', 'true');
          animateCountUp(element, target);
          observer.unobserve(element);
        }
      });
    }, { threshold: 0.3 });

    kpiValues.forEach(el => observer.observe(el));
  }

  function animateCountUp(element, target) {
    const duration = 1500;
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        element.textContent = target;
        clearInterval(timer);
      } else {
        element.textContent = Math.floor(current);
      }
    }, 16);
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initTooltips();
      initPersonalization();
      initAnimatedMetrics();
    });
  } else {
    initTooltips();
    initPersonalization();
    initAnimatedMetrics();
  }

  // Recalculate triggers on resize (with debounce)
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // Remove old triggers
      document.querySelectorAll('.apple-tooltip-trigger').forEach(t => t.remove());
      // Recreate triggers
      createHoverTriggers();
      // Reattach listeners
      setTimeout(() => attachEventListeners(), 50);
    }, 250);
  });
})();
