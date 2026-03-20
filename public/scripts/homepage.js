(function () {
  'use strict';

  console.log('[Pholio Homepage] Script loaded at', new Date().toISOString());

  function initUniversalHeaderMenu() {
    const menuToggle = document.querySelector('.universal-header__menu-toggle');
    const navPanel = document.getElementById('universalNav');
    const navOverlay = document.getElementById('universalNavOverlay');
    const closeButton = navPanel?.querySelector('.universal-header__close');
    const focusableSelectors = 'a[href], button:not([disabled]), textarea, input, select';
    let lastFocusedElement = null;

    if (!menuToggle || !navPanel || !navOverlay) return;

    const isOpen = () => navPanel.classList.contains('is-open');

    const trapFocus = (event) => {
      if (!isOpen()) return;
      if (event.key !== 'Tab') return;

      const focusableElements = navPanel.querySelectorAll(focusableSelectors);
      if (!focusableElements.length) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    const openNav = () => {
      if (isOpen()) return;
      lastFocusedElement = document.activeElement;

      // Remove hidden attribute first
      navPanel.removeAttribute('hidden');
      navPanel.setAttribute('aria-hidden', 'false');
      navOverlay.removeAttribute('hidden');
      
      // Force reflow to ensure panel is visible
      navPanel.offsetHeight;
      
      // Add classes to trigger animations
      requestAnimationFrame(() => {
        navPanel.classList.add('is-open');
        navOverlay.classList.add('is-visible');
      });
      
      document.body.classList.add('nav-open');
      menuToggle.setAttribute('aria-expanded', 'true');

      const focusable = navPanel.querySelectorAll(focusableSelectors);
      if (focusable.length) {
        setTimeout(() => focusable[0].focus(), 150);
      }
    };

    const closeNav = () => {
      if (!isOpen()) return;
      navPanel.classList.remove('is-open');
      navPanel.setAttribute('aria-hidden', 'true');
      navOverlay.classList.remove('is-visible');
      menuToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-open');

      setTimeout(() => {
        navPanel.setAttribute('hidden', '');
        navOverlay.hidden = true;
      }, 300);

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        setTimeout(() => lastFocusedElement.focus(), 100);
      }
    };

    menuToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      if (isOpen()) {
        closeNav();
      } else {
        openNav();
      }
    });

    closeButton?.addEventListener('click', (event) => {
      event.preventDefault();
      closeNav();
    });

    navOverlay.addEventListener('click', closeNav);

    navPanel.addEventListener('keydown', trapFocus);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) {
        closeNav();
      }
    });

    const navLinks = navPanel.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        closeNav();
      });
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024 && isOpen()) {
        closeNav();
      }
    });

    // Swipe gesture support
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let isSwiping = false;

    navPanel.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      isSwiping = false;
    }, { passive: true });

    navPanel.addEventListener('touchmove', (e) => {
      if (!isOpen()) return;
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      
      const deltaX = touchEndX - touchStartX;
      const deltaY = Math.abs(touchEndY - touchStartY);
      
      // Only consider horizontal swipes
      if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > deltaY) {
        isSwiping = true;
        // Only allow swiping left (to close)
        if (deltaX < 0) {
          const panelWidth = navPanel.offsetWidth;
          const swipePercent = Math.abs(deltaX) / panelWidth;
          const translateX = Math.max(0, Math.min(100, swipePercent * 100));
          
          // Apply transform during swipe
          navPanel.style.transform = `translateX(${translateX}%)`;
          navOverlay.style.opacity = String(1 - swipePercent * 0.5);
        }
      }
    }, { passive: true });

    navPanel.addEventListener('touchend', (e) => {
      if (!isOpen() || !isSwiping) {
        navPanel.style.transform = '';
        navOverlay.style.opacity = '';
        return;
      }

      touchEndX = e.changedTouches[0].screenX;
      const deltaX = touchEndX - touchStartX;
      const panelWidth = navPanel.offsetWidth;
      const swipePercent = Math.abs(deltaX) / panelWidth;

      // Reset transform
      navPanel.style.transform = '';
      navOverlay.style.opacity = '';

      // Close if swiped more than 30% of panel width
      if (deltaX < 0 && swipePercent > 0.3) {
        closeNav();
      } else {
        // Snap back if not enough swipe
        navPanel.classList.add('is-open');
      }

      isSwiping = false;
    }, { passive: true });
  }

  function initHeaderScroll() {
    const header = document.querySelector('.universal-header--homepage') || document.querySelector('.universal-header');
    if (!header) return;

    let ticking = false;

    function updateHeader() {
      const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

      if (currentScroll > 50) {
        if (!header.classList.contains('scrolled')) {
          header.classList.add('scrolled');
        }
      } else {
        if (header.classList.contains('scrolled')) {
          header.classList.remove('scrolled');
        }
      }

      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(updateHeader);
        ticking = true;
      }
    }, { passive: true });

    updateHeader();
  }

  // Transformation Hero Animation
  function initTransformationHero() {
    const heroSection = document.getElementById('transformation-hero');
    if (!heroSection) return;

    const rawDocument = heroSection.querySelector('.email-draft');
    const portfolioCard = heroSection.querySelector('.portfolio-card');
    const transformationZone = document.getElementById('transformation-zone');
    const replayButton = document.getElementById('replay-transformation');

    if (!rawDocument || !portfolioCard || !transformationZone) return;

    let isAnimating = false;
    const EMAIL_SHOW_DURATION = 2000; // Show email for 2 seconds
    const BUILD_DURATION = 4000; // Portfolio build takes 4 seconds

    // Build portfolio card in real-time
    function buildPortfolio() {
      if (isAnimating) return;
      
      isAnimating = true;
      transformationZone.classList.add('animating');

      // Step 1: Build header (name and location)
      const header = portfolioCard.querySelector('.portfolio-card__header');
      const name = portfolioCard.querySelector('.portfolio-card__name');
      const location = portfolioCard.querySelector('.portfolio-card__location');
      
      setTimeout(() => {
        if (header) {
          header.style.opacity = '0';
          header.style.transform = 'translateY(-20px)';
          header.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          header.style.opacity = '1';
          header.style.transform = 'translateY(0)';
        }
      }, 0);

      setTimeout(() => {
        if (name) {
          name.style.opacity = '0';
          name.style.transform = 'translateY(10px) scale(0.95)';
          name.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
          name.style.opacity = '1';
          name.style.transform = 'translateY(0) scale(1)';
        }
      }, 300);

      setTimeout(() => {
        if (location) {
          location.style.opacity = '0';
          location.style.transform = 'translateY(5px)';
          location.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          location.style.opacity = '1';
          location.style.transform = 'translateY(0)';
        }
      }, 800);

      // Step 2: Build hero image
      const heroImage = portfolioCard.querySelector('.portfolio-card__hero-image');
      const heroImg = portfolioCard.querySelector('.portfolio-card__hero-image img');
      
      setTimeout(() => {
        if (heroImage) {
          heroImage.style.opacity = '0';
          heroImage.style.transform = 'scale(0.98)';
          heroImage.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
          heroImage.style.opacity = '1';
          heroImage.style.transform = 'scale(1)';
        }
        if (heroImg) {
          heroImg.style.filter = 'brightness(0.7) contrast(0.8) grayscale(0.3)';
          heroImg.style.transition = 'filter 1.2s ease';
          heroImg.style.filter = 'brightness(1.05) contrast(1.08) grayscale(0)';
        }
      }, 1200);

      // Step 3: Build stats section
      const stats = portfolioCard.querySelector('.portfolio-card__stats');
      const statItems = portfolioCard.querySelectorAll('.portfolio-card__stat');
      const contact = portfolioCard.querySelector('.portfolio-card__contact');
      
      setTimeout(() => {
        if (stats) {
          stats.style.opacity = '0';
          stats.style.transform = 'translateY(15px)';
          stats.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
          stats.style.opacity = '1';
          stats.style.transform = 'translateY(0)';
        }
      }, 2000);

      statItems.forEach((stat, index) => {
        const label = stat.querySelector('.portfolio-card__stat-label');
        const value = stat.querySelector('.portfolio-card__stat-value');
        
        setTimeout(() => {
          if (label) {
            label.style.opacity = '0';
            label.style.transform = 'translateX(-10px)';
            label.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            label.style.opacity = '1';
            label.style.transform = 'translateX(0)';
          }
        }, 2200 + (index * 150));

        setTimeout(() => {
          if (value) {
            value.style.opacity = '0';
            value.style.transform = 'translateY(5px)';
            value.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            value.style.opacity = '1';
            value.style.transform = 'translateY(0)';
          }
        }, 2400 + (index * 150));
      });

      // Step 3.5: Build contact info
      setTimeout(() => {
        if (contact) {
          contact.style.opacity = '0';
          contact.style.transform = 'translateY(5px)';
          contact.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          contact.style.opacity = '1';
          contact.style.transform = 'translateY(0)';
        }
      }, 2900);

      // Step 4: Build gallery
      const gallery = portfolioCard.querySelector('.portfolio-card__gallery');
      const galleryItems = portfolioCard.querySelectorAll('.portfolio-card__gallery-item');
      
      setTimeout(() => {
        if (gallery) {
          gallery.style.opacity = '0';
          gallery.style.transform = 'translateY(10px)';
          gallery.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          gallery.style.opacity = '1';
          gallery.style.transform = 'translateY(0)';
        }
      }, 3000);

      galleryItems.forEach((item, index) => {
        const img = item.querySelector('img');
        setTimeout(() => {
          item.style.opacity = '0';
          item.style.transform = 'scale(0.9)';
          item.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
          item.style.opacity = '1';
          item.style.transform = 'scale(1)';
          
          if (img) {
            img.style.filter = 'brightness(0.8) contrast(0.85) grayscale(0.2)';
            img.style.transition = 'filter 0.8s ease';
            img.style.filter = 'brightness(1.05) contrast(1.05) grayscale(0)';
          }
        }, 3200 + (index * 120));
      });

      // Step 5: Build bio
      const bio = portfolioCard.querySelector('.portfolio-card__bio');
      const bioText = portfolioCard.querySelector('.portfolio-card__bio-text');
      
      setTimeout(() => {
        if (bio) {
          bio.style.opacity = '0';
          bio.style.transform = 'translateY(10px)';
          bio.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
          bio.style.opacity = '1';
          bio.style.transform = 'translateY(0)';
        }
        if (bioText) {
          bioText.style.opacity = '0';
          bioText.style.transform = 'translateY(5px)';
          bioText.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
          bioText.style.opacity = '1';
          bioText.style.transform = 'translateY(0)';
        }
      }, 4000);

      // Fade out email draft while building
      setTimeout(() => {
        const emailFields = rawDocument.querySelectorAll('.email-draft__field-value, .email-draft__subject');
        const emailBody = rawDocument.querySelector('.email-draft__body-content');
        
        emailFields.forEach((el, index) => {
          setTimeout(() => {
            el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            el.style.opacity = '0.2';
            el.style.transform = 'translateX(-15px)';
          }, index * 50);
        });

        if (emailBody) {
          setTimeout(() => {
            emailBody.style.transition = 'opacity 0.6s ease';
            emailBody.style.opacity = '0.15';
          }, 500);
        }
      }, 1000);

      // Show replay button after build completes
      setTimeout(() => {
        transformationZone.classList.remove('animating');
        if (replayButton) {
          replayButton.classList.add('visible');
        }
        isAnimating = false;
      }, EMAIL_SHOW_DURATION + BUILD_DURATION);
    }

    // Reset transformation
    function resetTransformation() {
      isAnimating = false;
      transformationZone.classList.remove('animating');
      
      // Reset email draft
      const emailFields = rawDocument.querySelectorAll('.email-draft__field-value, .email-draft__subject');
      const emailBody = rawDocument.querySelector('.email-draft__body-content');
      
      emailFields.forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(0)';
        el.style.transition = 'none';
      });

      if (emailBody) {
        emailBody.style.opacity = '1';
        emailBody.style.transition = 'none';
      }

      // Reset portfolio card - hide all elements
      const portfolioSections = portfolioCard.querySelectorAll('.portfolio-card__header, .portfolio-card__hero-image, .portfolio-card__stats, .portfolio-card__gallery, .portfolio-card__bio');
      const portfolioElements = portfolioCard.querySelectorAll('.portfolio-card__name, .portfolio-card__location, .portfolio-card__stat-label, .portfolio-card__stat-value, .portfolio-card__bio-text, .portfolio-card__contact');
      const portfolioItems = portfolioCard.querySelectorAll('.portfolio-card__gallery-item');
      const portfolioImages = portfolioCard.querySelectorAll('.portfolio-card__hero-image img, .portfolio-card__gallery-item img');
      
      portfolioSections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = '';
        section.style.transition = 'none';
      });

      portfolioElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = '';
        el.style.transition = 'none';
      });

      portfolioItems.forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'scale(0.9)';
        item.style.transition = 'none';
      });

      portfolioImages.forEach(img => {
        img.style.filter = 'brightness(0.7) contrast(0.8) grayscale(0.3)';
        img.style.transition = 'none';
      });

      // Hide replay button
      if (replayButton) {
        replayButton.classList.remove('visible');
      }

      // Restore transitions and restart after brief delay
      setTimeout(() => {
        portfolioSections.forEach(section => {
          section.style.transition = '';
        });
        portfolioElements.forEach(el => {
          el.style.transition = '';
        });
        portfolioItems.forEach(item => {
          item.style.transition = '';
        });
        portfolioImages.forEach(img => {
          img.style.transition = '';
        });
        emailFields.forEach(el => {
          el.style.transition = '';
        });
        if (emailBody) {
          emailBody.style.transition = '';
        }
        
        // Start sequence: show email, then build portfolio
        setTimeout(() => {
          buildPortfolio();
        }, EMAIL_SHOW_DURATION);
      }, 300);
    }

    // Set up replay button handler
    if (replayButton) {
      replayButton.addEventListener('click', (e) => {
        e.preventDefault();
        resetTransformation();
      });
    }

    // Initial state: show email fully, hide portfolio completely
    const portfolioSections = portfolioCard.querySelectorAll('.portfolio-card__header, .portfolio-card__hero-image, .portfolio-card__stats, .portfolio-card__gallery, .portfolio-card__bio');
    const portfolioElements = portfolioCard.querySelectorAll('.portfolio-card__name, .portfolio-card__location, .portfolio-card__stat-label, .portfolio-card__stat-value, .portfolio-card__bio-text, .portfolio-card__contact');
    const portfolioItems = portfolioCard.querySelectorAll('.portfolio-card__gallery-item');
    const portfolioImages = portfolioCard.querySelectorAll('.portfolio-card__hero-image img, .portfolio-card__gallery-item img');
    
    portfolioSections.forEach(section => {
      section.style.opacity = '0';
      section.style.transform = '';
      section.style.transition = 'none';
    });

    portfolioElements.forEach(el => {
      el.style.opacity = '0';
      el.style.transform = '';
      el.style.transition = 'none';
    });

    portfolioItems.forEach(item => {
      item.style.opacity = '0';
      item.style.transform = 'scale(0.9)';
      item.style.transition = 'none';
    });

    portfolioImages.forEach(img => {
      img.style.filter = 'brightness(0.7) contrast(0.8) grayscale(0.3)';
      img.style.transition = 'none';
    });

    // Reset transitions after initial state
    setTimeout(() => {
      portfolioSections.forEach(section => {
        section.style.transition = '';
      });
      portfolioElements.forEach(el => {
        el.style.transition = '';
      });
      portfolioItems.forEach(item => {
        item.style.transition = '';
      });
      portfolioImages.forEach(img => {
        img.style.transition = '';
      });
    }, 100);

    // Start sequence: show email first, then build portfolio
    setTimeout(() => {
      buildPortfolio();
    }, EMAIL_SHOW_DURATION);
  }

  // Portfolio Showcase Grid Scroll Animations
  function initPortfolioShowcaseAnimations() {
    const showcaseSection = document.getElementById('homepage-portfolio-showcase');
    if (!showcaseSection) return;

    const cards = showcaseSection.querySelectorAll('.homepage-portfolio-showcase__card');
    if (cards.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // Stagger animation
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, index * 80);
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    cards.forEach(card => {
      observer.observe(card);
    });
  }

  // Scroll-triggered animations for other sections
  function initScrollAnimations() {
    const sections = document.querySelectorAll('.homepage-value-prop, .homepage-testimonials, .homepage-agency, .homepage-cta');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -100px 0px'
    });

    sections.forEach(section => {
      section.style.opacity = '0';
      section.style.transform = 'translateY(30px)';
      section.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
      observer.observe(section);
    });
  }

  // Reduced motion support
  function respectReducedMotion() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (prefersReducedMotion) {
      // Disable animations
      const style = document.createElement('style');
      style.textContent = `
        .transformation-zone__particles,
        .transformation-zone__flow,
        .homepage-value-prop__icon,
        .homepage-portfolio-showcase__card {
          animation: none !important;
          transition: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  function initUniversalHeaderUserMenu() {
    const userMenuButton = document.getElementById('universal-user-menu-button');
    const userMenu = document.getElementById('universal-user-menu');
    const userDropdown = userMenuButton?.closest('.universal-header__user-dropdown');
    
    if (!userMenuButton || !userMenu || !userDropdown) return;
    
    // Toggle dropdown on button click
    userMenuButton.addEventListener('click', function(e) {
      e.stopPropagation();
      const isExpanded = userDropdown.getAttribute('aria-expanded') === 'true';
      userDropdown.setAttribute('aria-expanded', !isExpanded);
      userMenuButton.setAttribute('aria-expanded', !isExpanded);
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
      if (!userDropdown.contains(e.target)) {
        userDropdown.setAttribute('aria-expanded', 'false');
        userMenuButton.setAttribute('aria-expanded', 'false');
      }
    });

    // Close dropdown on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && userDropdown.getAttribute('aria-expanded') === 'true') {
        userDropdown.setAttribute('aria-expanded', 'false');
        userMenuButton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Dashboard Showcase Interactive Features
  function initDashboardShowcase() {
    const showcase = document.getElementById('dashboard-showcase');
    if (!showcase) return;

    // Intersection Observer for scroll-triggered animations
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          
          // Animate profile completion progress bar
          const progressSection = entry.target.querySelector('#talent-profile-progress');
          if (progressSection) {
            const progressFill = progressSection.querySelector('#progress-fill');
            const progressPercentage = progressSection.querySelector('#progress-percentage');
            const completionItems = progressSection.querySelectorAll('.dashboard-showcase__completion-item');
            
            if (progressFill && progressPercentage) {
              // Reset to 0
              progressFill.style.width = '0%';
              progressPercentage.textContent = '0%';
              
              // Animate to 95%
              let currentProgress = 0;
              const targetProgress = 95;
              const duration = 2000; // 2 seconds
              const increment = targetProgress / (duration / 16); // 60fps
              
              const animateProgress = () => {
                currentProgress += increment;
                if (currentProgress < targetProgress) {
                  progressFill.style.width = currentProgress + '%';
                  progressPercentage.textContent = Math.round(currentProgress) + '%';
                  requestAnimationFrame(animateProgress);
                } else {
                  progressFill.style.width = targetProgress + '%';
                  progressPercentage.textContent = targetProgress + '%';
                }
              };
              
              setTimeout(() => {
                animateProgress();
              }, 300);
            }
            
            // Animate completion checklist items
            if (completionItems.length > 0) {
              completionItems.forEach((item, index) => {
                const icon = item.querySelector('.dashboard-showcase__completion-icon');
                const label = item.querySelector('.dashboard-showcase__completion-label');
                
                // Start hidden
                if (icon) icon.style.opacity = '0';
                if (label) label.style.opacity = '0';
                if (label) label.style.transform = 'translateX(-10px)';
                
                // Animate in with stagger
                setTimeout(() => {
                  if (icon) {
                    icon.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                    icon.style.opacity = '1';
                    icon.style.transform = 'scale(1.2)';
                    setTimeout(() => {
                      icon.style.transform = 'scale(1)';
                    }, 200);
                  }
                  if (label) {
                    label.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                    label.style.opacity = '1';
                    label.style.transform = 'translateX(0)';
                  }
                }, 800 + (index * 200));
              });
            }
          }
          
          // Animate other progress bars (if any)
          const otherProgressFills = entry.target.querySelectorAll('.dashboard-showcase__progress-fill:not(#progress-fill)');
          otherProgressFills.forEach(progressFill => {
            const width = progressFill.style.width || '0%';
            progressFill.style.width = '0%';
            setTimeout(() => {
              progressFill.style.width = width;
            }, 200);
          });
        }
      });
    }, observerOptions);

    observer.observe(showcase);

    // Enhanced hover effects for panels
    const panels = showcase.querySelectorAll('.dashboard-showcase__panel');
    panels.forEach(panel => {
      panel.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-8px)';
      });
      
      panel.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
      });
    });

    // Interactive media grid items
    const mediaItems = showcase.querySelectorAll('.dashboard-showcase__media-item');
    mediaItems.forEach((item, index) => {
      item.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-4px) scale(1.02)';
        this.style.zIndex = '10';
      });
      
      item.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) scale(1)';
        this.style.zIndex = '1';
      });
    });

    // Interactive talent cards
    const talentCards = showcase.querySelectorAll('.dashboard-showcase__talent-card');
    talentCards.forEach(card => {
      card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-4px)';
      });
      
      card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
      });
    });

    // Analytics cards pulse effect
    const analyticsCards = showcase.querySelectorAll('.dashboard-showcase__analytics-card');
    analyticsCards.forEach((card, index) => {
      card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-2px)';
      });
      
      card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
      });
    });

    // Button interactions
    const buttons = showcase.querySelectorAll('.dashboard-showcase__button');
    buttons.forEach(button => {
      button.addEventListener('mouseenter', function() {
        if (this.classList.contains('dashboard-showcase__button--primary')) {
          this.style.transform = 'translateY(-2px)';
        } else if (this.classList.contains('dashboard-showcase__button--accent')) {
          this.style.transform = 'translateY(-2px)';
        }
      });
      
      button.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
      });
    });

    // CTA link interactions
    const ctaLinks = showcase.querySelectorAll('.dashboard-showcase__cta-link');
    ctaLinks.forEach(link => {
      link.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-2px)';
        const svg = this.querySelector('svg');
        if (svg) {
          svg.style.transform = 'translateX(4px)';
        }
      });
      
      link.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
        const svg = this.querySelector('svg');
        if (svg) {
          svg.style.transform = 'translateX(0)';
        }
      });
    });

    // Filter inputs focus effects
    const filterInputs = showcase.querySelectorAll('.dashboard-showcase__filter-input, .dashboard-showcase__filter-select');
    filterInputs.forEach(input => {
      input.addEventListener('focus', function() {
        this.parentElement.style.transform = 'scale(1.02)';
      });
      
      input.addEventListener('blur', function() {
        this.parentElement.style.transform = 'scale(1)';
      });
    });
  }

  // Enhanced scroll animations for all sections
  function initEnhancedScrollAnimations() {
    const sections = document.querySelectorAll(
      '.homepage-value-prop, .homepage-portfolio-showcase, .homepage-agency, .homepage-testimonials, .metrics-banner, .pholio-difference, .launch-timeline, .pricing-spread'
    );
    
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          
          // Animate value prop benefits
          if (entry.target.classList.contains('homepage-value-prop')) {
            const benefits = entry.target.querySelectorAll('.homepage-value-prop__benefit');
            benefits.forEach((benefit, index) => {
              benefit.style.opacity = '0';
              benefit.style.transform = 'translateY(10px)';
              setTimeout(() => {
                benefit.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                benefit.style.opacity = '1';
                benefit.style.transform = 'translateY(0)';
              }, index * 100);
            });
          }

          // Animate Pholio Difference columns
          if (entry.target.classList.contains('pholio-difference')) {
            const columns = entry.target.querySelectorAll('.comparison-column');
            columns.forEach((col, index) => {
              col.style.opacity = '0';
              col.style.transform = index === 0 ? 'translateX(-30px)' : 'translateX(30px)';
              setTimeout(() => {
                col.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
                col.style.opacity = '1';
                col.style.transform = 'translateX(0)';
              }, index * 200);
            });
          }

          // Animate Launch Timeline steps
          if (entry.target.classList.contains('launch-timeline')) {
            const steps = entry.target.querySelectorAll('.timeline-step');
            steps.forEach((step, index) => {
              step.style.opacity = '0';
              step.style.transform = 'translateY(30px)';
              setTimeout(() => {
                step.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                step.style.opacity = '1';
                step.style.transform = 'translateY(0)';
              }, index * 200);
            });
          }

          // Animate Pricing cards (pricing-spread section)
          if (entry.target.classList.contains('pricing-spread')) {
            const cards = entry.target.querySelectorAll('.pricing-card');
            cards.forEach((card, index) => {
              setTimeout(() => {
                card.classList.add('is-visible');
              }, index * 150);
            });
          }
          
          // Animate portfolio showcase intro
          if (entry.target.classList.contains('homepage-portfolio-showcase')) {
            const intro = entry.target.querySelector('.homepage-portfolio-showcase__intro');
            if (intro) {
              intro.style.opacity = '0';
              intro.style.transform = 'translateY(20px)';
              setTimeout(() => {
                intro.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
                intro.style.opacity = '1';
                intro.style.transform = 'translateY(0)';
              }, 100);
            }
          }
          
          // Animate testimonials header
          if (entry.target.classList.contains('homepage-testimonials')) {
            const header = entry.target.querySelector('.homepage-testimonials__header');
            if (header) {
              header.style.opacity = '0';
              header.style.transform = 'translateY(20px)';
              setTimeout(() => {
                header.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
                header.style.opacity = '1';
                header.style.transform = 'translateY(0)';
              }, 100);
            }
          }
        }
      });
    }, observerOptions);

    sections.forEach(section => {
      observer.observe(section);
    });
  }

  // Metrics Banner Counter Animation
  function initMetricsBanner() {
    const banner = document.querySelector('.metrics-banner');
    if (!banner) return;

    const numbers = banner.querySelectorAll('.metrics-banner__number');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateNumbers();
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    function animateNumbers() {
      numbers.forEach(num => {
        const target = parseInt(num.getAttribute('data-target'));
        const duration = 2000; // 2 seconds
        const startTime = performance.now();
        
        function update(currentTime) {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          // Easing function (easeOutExpo)
          const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
          
          const currentCount = Math.floor(easeProgress * target);
          num.textContent = currentCount.toLocaleString();
          
          if (progress < 1) {
            requestAnimationFrame(update);
          } else {
            num.textContent = target.toLocaleString();
          }
        }
        
        requestAnimationFrame(update);
      });
    }

    observer.observe(banner);
  }

  // Testimonial Carousel Logic
  function initTestimonialCarousel() {
    const carouselWrapper = document.querySelector('.homepage-testimonials__carousel-wrapper');
    if (!carouselWrapper) return;

    const carousel = document.getElementById('testimonial-carousel');
    const slides = carousel.querySelectorAll('.testimonial-slide');
    const prevBtn = carouselWrapper.querySelector('.carousel-nav__btn--prev');
    const nextBtn = carouselWrapper.querySelector('.carousel-nav__btn--next');
    const indicators = carouselWrapper.querySelectorAll('.carousel-indicator');
    
    let currentIndex = 0;
    const totalSlides = slides.length;
    let autoplayInterval;

    function goToSlide(index) {
      if (index === currentIndex) return;
      
      // Update classes
      slides[currentIndex].classList.remove('active');
      indicators[currentIndex].classList.remove('active');
      
      currentIndex = (index + totalSlides) % totalSlides;
      
      slides[currentIndex].classList.add('active');
      indicators[currentIndex].classList.add('active');
      
      // Reset autoplay timer when user interacts
      resetAutoplay();
    }

    function nextSlide() {
      goToSlide(currentIndex + 1);
    }

    function prevSlide() {
      goToSlide(currentIndex - 1);
    }

    function startAutoplay() {
      autoplayInterval = setInterval(nextSlide, 6000);
    }

    function resetAutoplay() {
      clearInterval(autoplayInterval);
      startAutoplay();
    }

    // Event Listeners
    prevBtn?.addEventListener('click', prevSlide);
    nextBtn?.addEventListener('click', nextSlide);
    
    indicators.forEach((indicator, index) => {
      indicator.addEventListener('click', () => goToSlide(index));
    });

    // Touch support for mobile
    let touchStartX = 0;
    let touchEndX = 0;

    carousel.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    carousel.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      const swipeThreshold = 50;
      if (touchStartX - touchEndX > swipeThreshold) {
        nextSlide();
      } else if (touchEndX - touchStartX > swipeThreshold) {
        prevSlide();
      }
    }

    startAutoplay();
  }

  // Initialize everything when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initUniversalHeaderMenu();
    initUniversalHeaderUserMenu();
    initHeaderScroll();
    initTransformationHero();
    initPortfolioShowcaseAnimations();
    initScrollAnimations();
    initDashboardShowcase();
    initEnhancedScrollAnimations();
    initMetricsBanner();
    initTestimonialCarousel();
    respectReducedMotion();
  });
})();
