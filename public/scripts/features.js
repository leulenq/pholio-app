(function() {
  'use strict';

  // Initialize all features when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initScrollAnimations();
    initBioTransformation();
    initThemeGallery();
    initPortfolioToggle();
    initFilterDemo();
  });

  // Scroll-triggered animations for feature spreads
  function initScrollAnimations() {
    const headers = document.querySelectorAll('.feature-spread__header');
    const demos = document.querySelectorAll('.feature-demo');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    }, {
      threshold: 0.2,
      rootMargin: '0px 0px -100px 0px'
    });

    headers.forEach(header => observer.observe(header));
    demos.forEach(demo => observer.observe(demo));
  }

  // Feature 1: Bio Transformation Demo
  function initBioTransformation() {
    const input = document.getElementById('bio-input');
    const output = document.getElementById('bio-output-text');
    const heightOutput = document.getElementById('height-output');
    const measurementsOutput = document.getElementById('measurements-output');
    const sparkle = document.getElementById('transformation-sparkle');

    if (!input || !output) return;

    // Sample refined bio
    const refinedBio = "Elara Keats brings a refined editorial sensibility to every project. Based in Los Angeles, she seamlessly transitions between high-fashion editorials and commercial campaigns, delivering versatile performance with consistent professionalism.";

    // Auto-demo on load
    let autoDemoTimeout;
    function startAutoDemo() {
      let index = 0;
      output.textContent = '';
      
      function typeWriter() {
        if (index < refinedBio.length) {
          output.textContent += refinedBio.charAt(index);
          index++;
          autoDemoTimeout = setTimeout(typeWriter, 30);
        } else {
          // Update stats
          if (heightOutput) heightOutput.textContent = "5' 11\" / 180cm";
          if (measurementsOutput) measurementsOutput.textContent = "32-25-35";
          
          // Trigger sparkle animation
          if (sparkle) {
            sparkle.classList.add('is-active');
            setTimeout(() => sparkle.classList.remove('is-active'), 1000);
          }
        }
      }
      
      typeWriter();
    }

    // Start auto-demo after a short delay
    setTimeout(startAutoDemo, 1000);

    // Interactive transformation on input
    let transformTimeout;
    input.addEventListener('input', () => {
      clearTimeout(transformTimeout);
      clearTimeout(autoDemoTimeout);
      
      transformTimeout = setTimeout(() => {
        const rawText = input.value.trim();
        
        if (rawText.length === 0) {
          output.textContent = '';
          return;
        }

        // Simulate AI transformation (simplified)
        let transformed = rawText
          .replace(/i'm/gi, 'She is')
          .replace(/i /gi, 'She ')
          .replace(/i love/gi, 'specializes in')
          .replace(/i'm based/gi, 'Based')
          .replace(/available for bookings/gi, 'available for professional bookings')
          .replace(/\./g, '. ')
          .trim();

        // Capitalize first letter
        transformed = transformed.charAt(0).toUpperCase() + transformed.slice(1);

        // Typewriter effect
        output.textContent = '';
        let index = 0;
        function typeWriter() {
          if (index < transformed.length) {
            output.textContent += transformed.charAt(index);
            index++;
            setTimeout(typeWriter, 20);
          } else {
            // Trigger sparkle
            if (sparkle) {
              sparkle.classList.add('is-active');
              setTimeout(() => sparkle.classList.remove('is-active'), 1000);
            }
          }
        }
        typeWriter();
      }, 500);
    });
  }

  // Feature 2: Theme Gallery
  function initThemeGallery() {
    const themeCards = document.querySelectorAll('.theme-card');
    const previewFull = document.getElementById('theme-preview-full');
    const previewContent = document.getElementById('theme-preview-content');
    const closeFull = document.getElementById('theme-close-full');

    if (!themeCards.length) return;

    themeCards.forEach(card => {
      card.addEventListener('click', () => {
        const isPro = card.dataset.pro === 'true';
        
        if (isPro) {
          // Show upgrade prompt for Studio+ themes
          const upgradeMsg = 'This theme is available for Studio+ members. Upgrade to unlock all themes.';
          if (confirm(upgradeMsg)) {
            window.location.href = '/pro/upgrade';
          }
          return;
        }

        // Remove previous selection
        themeCards.forEach(c => c.classList.remove('is-selected'));
        card.classList.add('is-selected');

        // Show full preview (optional - can be enhanced)
        if (previewFull && previewContent) {
          const themeName = card.querySelector('.theme-card__name').textContent;
          previewContent.innerHTML = `
            <h2 style="font-family: var(--font-serif); font-size: 2rem; margin-bottom: 1rem;">${themeName} Theme</h2>
            <p style="font-family: var(--font-sans); color: #475569; line-height: 1.7;">
              The ${themeName} theme features an elegant, editorial layout perfect for professional comp cards.
              ${isPro ? 'Upgrade to Studio+ to unlock this theme.' : 'This theme is available for free users.'}
            </p>
          `;
          previewFull.hidden = false;
        }
      });
    });

    // Close full preview
    if (closeFull && previewFull) {
      closeFull.addEventListener('click', () => {
        previewFull.hidden = true;
      });

      previewFull.addEventListener('click', (e) => {
        if (e.target === previewFull) {
          previewFull.hidden = true;
        }
      });
    }
  }

  // Feature 3: Portfolio Toggle with Morphing Animations
  function initPortfolioToggle() {
    const toggleButtons = document.querySelectorAll('.feature-demo__toggle-btn');
    const portfolioFrame = document.getElementById('portfolio-frame');
    const brandPholio = document.getElementById('portfolio-brand-zipsite');
    const portfolioUrl = document.getElementById('portfolio-url');
    const portfolioBadge = document.getElementById('portfolio-badge');
    const portfolioFeatures = document.getElementById('portfolio-features');
    const proFeatures = portfolioFeatures?.querySelectorAll('.feature-demo__portfolio-feature--pro');
    const galleryPreview = document.getElementById('portfolio-gallery-preview');
    const proOverlay = document.getElementById('portfolio-pro-overlay');

    if (!toggleButtons.length || !portfolioFrame) return;

    // Initial state - trigger reveal animations
    setTimeout(() => {
      if (portfolioFrame) {
        portfolioFrame.classList.add('is-visible');
      }
      triggerRevealAnimations();
    }, 100);

    toggleButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        const isPro = view === 'pro';

        // Prevent rapid clicking
        if (portfolioFrame.dataset.state === view) return;

        // Update active state with smooth transition
        toggleButtons.forEach(b => {
          b.classList.remove('feature-demo__toggle-btn--active');
          b.style.pointerEvents = 'none';
        });
        
        setTimeout(() => {
          btn.classList.add('feature-demo__toggle-btn--active');
          toggleButtons.forEach(b => {
            b.style.pointerEvents = '';
          });
        }, 200);

        // Morph portfolio frame state
        portfolioFrame.dataset.state = view;

        // Animate Studio+ features reveal
        if (proFeatures && proFeatures.length > 0) {
          proFeatures.forEach((feature, index) => {
            if (isPro) {
              setTimeout(() => {
                feature.setAttribute('aria-hidden', 'false');
                feature.classList.add('is-visible');
              }, 300 + (index * 100));
            } else {
              feature.setAttribute('aria-hidden', 'true');
              feature.classList.remove('is-visible');
            }
          });
        }

        // Animate gallery preview
        if (galleryPreview) {
          if (isPro) {
            setTimeout(() => {
              galleryPreview.setAttribute('aria-hidden', 'false');
            }, 400);
          } else {
            galleryPreview.setAttribute('aria-hidden', 'true');
          }
        }

        // Animate pro overlay
        if (proOverlay) {
          if (isPro) {
            proOverlay.setAttribute('aria-hidden', 'false');
          } else {
            proOverlay.setAttribute('aria-hidden', 'true');
          }
        }
      });
    });

    // Trigger reveal animations for scroll-triggered elements
    function triggerRevealAnimations() {
      const revealElements = document.querySelectorAll('[data-reveal]');
      const revealItems = document.querySelectorAll('[data-reveal-item]');

      revealElements.forEach((el, index) => {
        setTimeout(() => {
          el.classList.add('is-visible');
        }, 200 + (index * 150));
      });

      // Stagger individual items
      revealItems.forEach((item, index) => {
        setTimeout(() => {
          item.classList.add('is-visible');
        }, 400 + (index * 100));
      });
    }

    // Intersection Observer for scroll-triggered reveals
    const portfolioSection = document.getElementById('feature-portfolio');
    if (portfolioSection) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const portfolioDemo = entry.target.querySelector('.feature-demo--portfolio');
            if (portfolioDemo) {
              portfolioDemo.classList.add('is-visible');
            }
            
            // Trigger reveal animations when section is visible
            if (!portfolioFrame.classList.contains('is-visible')) {
              setTimeout(() => {
                portfolioFrame.classList.add('is-visible');
                triggerRevealAnimations();
              }, 200);
            }
          }
        });
      }, {
        threshold: 0.2,
        rootMargin: '0px 0px -100px 0px'
      });

      observer.observe(portfolioSection);
    }

    // Add micro-interactions and hover effects
    addMicroInteractions();
  }

  // Micro-interactions for portfolio feature
  function addMicroInteractions() {
    const portfolioFrame = document.getElementById('portfolio-frame');
    const stats = document.querySelectorAll('.feature-demo__portfolio-stat');
    const features = document.querySelectorAll('.feature-demo__portfolio-feature');
    const galleryItems = document.querySelectorAll('.gallery-preview__item');

    // Add hover effects to stats
    stats.forEach(stat => {
      stat.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-4px) scale(1.02)';
      });
      stat.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) scale(1)';
      });
    });

    // Add click ripple effect to toggle buttons
    const toggleButtons = document.querySelectorAll('.feature-demo__toggle-btn');
    toggleButtons.forEach(btn => {
      btn.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple-effect');
        
        this.appendChild(ripple);
        
        setTimeout(() => {
          ripple.remove();
        }, 600);
      });
    });

    // Add parallax effect to hero image on scroll
    if (portfolioFrame) {
      const heroImg = portfolioFrame.querySelector('.feature-demo__portfolio-hero-img');
      if (heroImg) {
        let ticking = false;
        window.addEventListener('scroll', () => {
          if (!ticking) {
            window.requestAnimationFrame(() => {
              const rect = portfolioFrame.getBoundingClientRect();
              const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
              
              if (isVisible) {
                const scrollProgress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / window.innerHeight));
                const translateY = scrollProgress * 20;
                heroImg.style.transform = `translateY(${translateY}px) scale(1.02)`;
              }
              
              ticking = false;
            });
            ticking = true;
          }
        });
      }
    }

    // Add gallery item interactions
    galleryItems.forEach((item, index) => {
      item.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.15) translateY(-4px)';
        this.style.zIndex = '4';
      });
      item.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1) translateY(0)';
        this.style.zIndex = '3';
      });
    });
  }

  // Feature 4: Filter Demo
  function initFilterDemo() {
    const searchFilter = document.getElementById('filter-search');
    const locationFilter = document.getElementById('filter-location');
    const heightFilter = document.getElementById('filter-height');
    const heightValue = document.getElementById('height-value');
    const measurementsFilter = document.getElementById('filter-measurements');
    const specializationCheckboxes = document.querySelectorAll('.filter-specialization');
    const sortSelect = document.getElementById('sort-results');
    const clearFiltersBtn = document.getElementById('clear-filters');
    const resultsGrid = document.getElementById('results-grid');
    const resultsCount = document.getElementById('results-count');
    const resultsSubtitle = document.getElementById('results-subtitle');
    const resultsEmpty = document.getElementById('results-empty');

    if (!resultsGrid) return;

    // Sample talent data
    const talentData = [
      { name: 'Elara Keats', location: 'LA', height: 71, measurements: '32-25-35', specializations: ['editorial', 'commercial'], image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=400&q=80' },
      { name: 'Aiko Ren', location: 'NYC', height: 68, measurements: '34-26-36', specializations: ['runway', 'editorial'], image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80' },
      { name: 'Bianca Cole', location: 'LA', height: 70, measurements: '33-24-34', specializations: ['commercial'], image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Sofia Martinez', location: 'Miami', height: 69, measurements: '32-25-35', specializations: ['editorial', 'runway'], image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80' },
      { name: 'Isabella Chen', location: 'NYC', height: 67, measurements: '31-24-33', specializations: ['commercial', 'editorial'], image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=80' },
      { name: 'Maya Patel', location: 'Chicago', height: 72, measurements: '34-26-36', specializations: ['runway'], image: 'https://images.unsplash.com/photo-1503342452485-86b7f54527ef?auto=format&fit=crop&w=400&q=80' },
      { name: 'Luna Rodriguez', location: 'LA', height: 69, measurements: '33-25-35', specializations: ['editorial'], image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=400&q=80' },
      { name: 'Zoe Kim', location: 'NYC', height: 68, measurements: '32-24-34', specializations: ['commercial', 'runway'], image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80' },
      { name: 'Emma Wilson', location: 'Miami', height: 70, measurements: '33-25-35', specializations: ['editorial', 'commercial'], image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Olivia Brown', location: 'LA', height: 71, measurements: '34-26-36', specializations: ['runway'], image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80' },
      { name: 'Ava Davis', location: 'NYC', height: 67, measurements: '31-24-33', specializations: ['editorial'], image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=80' },
      { name: 'Sophia Taylor', location: 'Chicago', height: 69, measurements: '32-25-35', specializations: ['commercial', 'runway'], image: 'https://images.unsplash.com/photo-1503342452485-86b7f54527ef?auto=format&fit=crop&w=400&q=80' }
    ];

    // Convert height in inches to feet and inches
    function inchesToFeetInches(inches) {
      const feet = Math.floor(inches / 12);
      const remainingInches = inches % 12;
      return `${feet}' ${remainingInches}"`;
    }

    // Filter talent based on criteria
    function filterTalent() {
      const search = searchFilter?.value.trim().toLowerCase() || '';
      const location = locationFilter?.value || '';
      const minHeight = heightFilter ? parseInt(heightFilter.value) : 60;
      const measurements = measurementsFilter?.value.trim() || '';
      const selectedSpecializations = Array.from(specializationCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

      const filtered = talentData.filter(talent => {
        // Search filter
        if (search && !talent.name.toLowerCase().includes(search)) return false;

        // Location filter
        if (location && talent.location !== location) return false;

        // Height filter
        if (talent.height < minHeight) return false;

        // Measurements filter (simplified - just check if it matches)
        if (measurements && !talent.measurements.includes(measurements.replace(/\s/g, ''))) return false;

        // Specializations filter
        if (selectedSpecializations.length > 0) {
          const hasSpecialization = selectedSpecializations.some(spec => 
            talent.specializations.includes(spec)
          );
          if (!hasSpecialization) return false;
        }

        return true;
      });

      // Sort results
      const sorted = sortResults(filtered);
      renderResults(sorted);
    }

    // Sort results based on selected option
    function sortResults(results) {
      const sortBy = sortSelect?.value || 'name';
      const sorted = [...results];

      switch (sortBy) {
        case 'name':
          sorted.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'height':
          sorted.sort((a, b) => b.height - a.height);
          break;
        case 'location':
          sorted.sort((a, b) => a.location.localeCompare(b.location));
          break;
        default:
          break;
      }

      return sorted;
    }

    // Clear all filters
    function clearFilters() {
      if (searchFilter) searchFilter.value = '';
      if (locationFilter) locationFilter.value = '';
      if (heightFilter) heightFilter.value = '60';
      if (heightValue) heightValue.textContent = inchesToFeetInches(60);
      if (measurementsFilter) measurementsFilter.value = '';
      specializationCheckboxes.forEach(cb => cb.checked = false);
      if (sortSelect) sortSelect.value = 'name';
      filterTalent();
    }

    // Render filtered results
    function renderResults(results) {
      if (!resultsGrid) return;

      resultsGrid.innerHTML = '';

      if (results.length === 0) {
        if (resultsEmpty) resultsEmpty.hidden = false;
        if (resultsCount) resultsCount.textContent = '0 models';
        if (resultsSubtitle) resultsSubtitle.textContent = 'No matches found';
        return;
      }

      if (resultsEmpty) resultsEmpty.hidden = true;
      if (resultsCount) {
        resultsCount.textContent = `${results.length} ${results.length === 1 ? 'model' : 'models'}`;
      }
      if (resultsSubtitle) {
        resultsSubtitle.textContent = results.length === talentData.length 
          ? 'All talent' 
          : 'Matching your criteria';
      }

      results.forEach((talent, index) => {
        const card = document.createElement('div');
        card.className = 'feature-demo__talent-card';
        card.style.animationDelay = `${index * 0.03}s`;
        
        const heightFeetInches = inchesToFeetInches(talent.height);
        const specializationLabels = {
          editorial: 'Editorial',
          runway: 'Runway',
          commercial: 'Commercial'
        };
        const specializationsHtml = talent.specializations
          .map(spec => `<span class="feature-demo__talent-card-specialization">${specializationLabels[spec] || spec}</span>`)
          .join('');

        card.innerHTML = `
          <div class="feature-demo__talent-card-image-wrapper">
            <img src="${talent.image}" alt="${talent.name}" class="feature-demo__talent-card-image" loading="lazy">
          </div>
          <div class="feature-demo__talent-card-info">
            <div class="feature-demo__talent-card-name">${talent.name}</div>
            <div class="feature-demo__talent-card-details">
              <div class="feature-demo__talent-card-location">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>${talent.location === 'NYC' ? 'New York, NY' : talent.location === 'LA' ? 'Los Angeles, CA' : talent.location === 'Miami' ? 'Miami, FL' : talent.location === 'Chicago' ? 'Chicago, IL' : talent.location}</span>
              </div>
            </div>
            <div class="feature-demo__talent-card-stats">
              <div class="feature-demo__talent-card-stat">
                <span class="feature-demo__talent-card-stat-label">Height</span>
                <span class="feature-demo__talent-card-stat-value">${heightFeetInches}</span>
              </div>
              <div class="feature-demo__talent-card-stat">
                <span class="feature-demo__talent-card-stat-label">Measurements</span>
                <span class="feature-demo__talent-card-stat-value">${talent.measurements}</span>
              </div>
            </div>
            ${specializationsHtml ? `<div class="feature-demo__talent-card-specializations">${specializationsHtml}</div>` : ''}
          </div>
        `;
        resultsGrid.appendChild(card);
      });
    }

    // Update height display
    if (heightFilter && heightValue) {
      heightFilter.addEventListener('input', () => {
        const inches = parseInt(heightFilter.value);
        heightValue.textContent = inchesToFeetInches(inches);
        filterTalent();
      });
    }

    // Filter on change
    if (searchFilter) {
      searchFilter.addEventListener('input', () => {
        clearTimeout(searchFilter.searchTimeout);
        searchFilter.searchTimeout = setTimeout(filterTalent, 300);
      });
    }

    if (locationFilter) {
      locationFilter.addEventListener('change', filterTalent);
    }

    if (measurementsFilter) {
      measurementsFilter.addEventListener('input', () => {
        clearTimeout(measurementsFilter.filterTimeout);
        measurementsFilter.filterTimeout = setTimeout(filterTalent, 500);
      });
    }

    specializationCheckboxes.forEach(cb => {
      cb.addEventListener('change', filterTalent);
    });

    // Sort on change
    if (sortSelect) {
      sortSelect.addEventListener('change', filterTalent);
    }

    // Clear filters button
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', clearFilters);
    }

    // Initial render
    filterTalent();
  }
})();

