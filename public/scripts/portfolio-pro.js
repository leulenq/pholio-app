// Portfolio Pro - Interactive Enhancements

(function() {
  'use strict';

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Initialize all features
    setupParallax();
    setupIntersectionObserver();
    setupGalleryInteractions();
    setupSmoothScroll();
    setupParticleAnimation();
  }

  // ============================================
  // Parallax Scroll Effects
  // ============================================

  function setupParallax() {
    const heroImage = document.querySelector('.portfolio-pro-hero__image');
    if (!heroImage) return;

    let ticking = false;

    function updateParallax() {
      const scrolled = window.pageYOffset;
      const heroSection = document.querySelector('.portfolio-pro-hero');
      if (!heroSection) return;

      const heroHeight = heroSection.offsetHeight;
      const heroTop = heroSection.offsetTop;
      const scrollPosition = scrolled - heroTop;

      if (scrollPosition >= 0 && scrollPosition <= heroHeight) {
        // Parallax effect for hero image
        const parallaxSpeed = 0.5;
        const translateY = scrollPosition * parallaxSpeed;
        heroImage.style.transform = `translateY(${translateY}px) scale(${1 + scrollPosition / heroHeight * 0.1})`;
      }

      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    updateParallax(); // Initial call
  }

  // ============================================
  // Intersection Observer for Fade-in Animations
  // ============================================

  function setupIntersectionObserver() {
    // Check if IntersectionObserver is supported
    if (!('IntersectionObserver' in window)) {
      // Fallback: add visible class to all elements immediately
      const elements = document.querySelectorAll('[class*="portfolio-pro"]');
      elements.forEach(el => el.classList.add('visible'));
      return;
    }

    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -50px 0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target); // Stop observing once visible
        }
      });
    }, observerOptions);

    // Observe elements that should fade in
    const animateElements = document.querySelectorAll(
      '.portfolio-pro-card, ' +
      '.portfolio-pro-gallery__item, ' +
      '.portfolio-pro-section-title, ' +
      '.portfolio-pro-stat'
    );

    animateElements.forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
      observer.observe(el);
    });

    // Add visible class style
    const style = document.createElement('style');
    style.textContent = `
      .visible {
        opacity: 1 !important;
        transform: translateY(0) !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================
  // Gallery Lightbox/Modal
  // ============================================

  function setupGalleryInteractions() {
    const galleryItems = document.querySelectorAll('.portfolio-pro-gallery__item');
    if (galleryItems.length === 0) return;

    galleryItems.forEach((item, index) => {
      item.addEventListener('click', () => openLightbox(item, index));
      item.style.cursor = 'pointer';
    });

    // Add keyboard navigation
    document.addEventListener('keydown', handleLightboxKeyboard);
  }

  let currentLightboxIndex = 0;
  let lightboxImages = [];

  function openLightbox(item, index) {
    // Collect all images
    const galleryItems = Array.from(document.querySelectorAll('.portfolio-pro-gallery__item'));
    lightboxImages = galleryItems.map(item => {
      const img = item.querySelector('.portfolio-pro-gallery__image');
      const caption = item.querySelector('.portfolio-pro-gallery__caption');
      return {
        src: img ? img.src : '',
        alt: img ? img.alt : '',
        caption: caption ? caption.textContent : ''
      };
    }).filter(img => img.src);

    if (lightboxImages.length === 0) return;

    currentLightboxIndex = index;

    // Create lightbox
    const lightbox = document.createElement('div');
    lightbox.className = 'portfolio-pro-lightbox';
    lightbox.innerHTML = `
      <div class="portfolio-pro-lightbox__overlay"></div>
      <div class="portfolio-pro-lightbox__content">
        <button class="portfolio-pro-lightbox__close" aria-label="Close lightbox">&times;</button>
        <button class="portfolio-pro-lightbox__prev" aria-label="Previous image">‹</button>
        <button class="portfolio-pro-lightbox__next" aria-label="Next image">›</button>
        <img src="${lightboxImages[currentLightboxIndex].src}" alt="${lightboxImages[currentLightboxIndex].alt}" class="portfolio-pro-lightbox__image">
        ${lightboxImages[currentLightboxIndex].caption ? `<div class="portfolio-pro-lightbox__caption">${lightboxImages[currentLightboxIndex].caption}</div>` : ''}
        <div class="portfolio-pro-lightbox__counter">${currentLightboxIndex + 1} / ${lightboxImages.length}</div>
      </div>
    `;

    // Add styles
    const lightboxStyles = document.createElement('style');
    lightboxStyles.textContent = `
      .portfolio-pro-lightbox {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease-out;
      }

      .portfolio-pro-lightbox__overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(10px);
      }

      .portfolio-pro-lightbox__content {
        position: relative;
        z-index: 1;
        max-width: 90vw;
        max-height: 90vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .portfolio-pro-lightbox__image {
        max-width: 100%;
        max-height: 90vh;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      }

      .portfolio-pro-lightbox__close,
      .portfolio-pro-lightbox__prev,
      .portfolio-pro-lightbox__next {
        position: absolute;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
        font-size: 2rem;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        z-index: 2;
      }

      .portfolio-pro-lightbox__close:hover,
      .portfolio-pro-lightbox__prev:hover,
      .portfolio-pro-lightbox__next:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: scale(1.1);
      }

      .portfolio-pro-lightbox__close {
        top: 20px;
        right: 20px;
        font-size: 2.5rem;
        line-height: 1;
      }

      .portfolio-pro-lightbox__prev {
        left: 20px;
        font-size: 3rem;
      }

      .portfolio-pro-lightbox__next {
        right: 20px;
        font-size: 3rem;
      }

      .portfolio-pro-lightbox__caption {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        color: #ffffff;
        font-size: 1rem;
        text-align: center;
        padding: 0.75rem 1.5rem;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(10px);
        border-radius: 20px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .portfolio-pro-lightbox__counter {
        position: absolute;
        top: 20px;
        left: 20px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.875rem;
        padding: 0.5rem 1rem;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
        border-radius: 20px;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @media (max-width: 768px) {
        .portfolio-pro-lightbox__prev,
        .portfolio-pro-lightbox__next {
          width: 40px;
          height: 40px;
          font-size: 2rem;
        }

        .portfolio-pro-lightbox__close {
          width: 40px;
          height: 40px;
          font-size: 2rem;
        }
      }
    `;

    if (!document.getElementById('portfolio-pro-lightbox-styles')) {
      lightboxStyles.id = 'portfolio-pro-lightbox-styles';
      document.head.appendChild(lightboxStyles);
    }

    document.body.appendChild(lightbox);
    document.body.style.overflow = 'hidden'; // Prevent background scrolling

    // Event listeners
    lightbox.querySelector('.portfolio-pro-lightbox__close').addEventListener('click', closeLightbox);
    lightbox.querySelector('.portfolio-pro-lightbox__prev').addEventListener('click', () => navigateLightbox(-1));
    lightbox.querySelector('.portfolio-pro-lightbox__next').addEventListener('click', () => navigateLightbox(1));
    lightbox.querySelector('.portfolio-pro-lightbox__overlay').addEventListener('click', closeLightbox);

    function navigateLightbox(direction) {
      currentLightboxIndex += direction;
      if (currentLightboxIndex < 0) currentLightboxIndex = lightboxImages.length - 1;
      if (currentLightboxIndex >= lightboxImages.length) currentLightboxIndex = 0;

      const image = lightbox.querySelector('.portfolio-pro-lightbox__image');
      const caption = lightbox.querySelector('.portfolio-pro-lightbox__caption');
      const counter = lightbox.querySelector('.portfolio-pro-lightbox__counter');

      image.style.opacity = '0';
      setTimeout(() => {
        image.src = lightboxImages[currentLightboxIndex].src;
        image.alt = lightboxImages[currentLightboxIndex].alt;
        if (caption) {
          caption.textContent = lightboxImages[currentLightboxIndex].caption || '';
          caption.style.display = lightboxImages[currentLightboxIndex].caption ? 'block' : 'none';
        }
        if (counter) {
          counter.textContent = `${currentLightboxIndex + 1} / ${lightboxImages.length}`;
        }
        image.style.opacity = '1';
      }, 150);
    }

    function closeLightbox() {
      const lightbox = document.querySelector('.portfolio-pro-lightbox');
      if (lightbox) {
        lightbox.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
          document.body.removeChild(lightbox);
          document.body.style.overflow = '';
        }, 300);
      }
    }

    // Store close function globally for keyboard handler
    window.closeLightbox = closeLightbox;
    window.navigateLightbox = navigateLightbox;
  }

  function handleLightboxKeyboard(e) {
    const lightbox = document.querySelector('.portfolio-pro-lightbox');
    if (!lightbox) return;

    switch(e.key) {
      case 'Escape':
        if (window.closeLightbox) window.closeLightbox();
        break;
      case 'ArrowLeft':
        if (window.navigateLightbox) window.navigateLightbox(-1);
        break;
      case 'ArrowRight':
        if (window.navigateLightbox) window.navigateLightbox(1);
        break;
    }
  }

  // ============================================
  // Smooth Scroll Behavior
  // ============================================

  function setupSmoothScroll() {
    // Apply smooth scroll to the page
    if (CSS.supports('scroll-behavior', 'smooth')) {
      document.documentElement.style.scrollBehavior = 'smooth';
    } else {
      // Fallback for older browsers
      document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
          const href = this.getAttribute('href');
          if (href !== '#' && href.startsWith('#')) {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        });
      });
    }
  }

  // ============================================
  // Particle Animation Background
  // ============================================

  function setupParticleAnimation() {
    const particlesContainer = document.querySelector('.portfolio-pro-bg__particles');
    if (!particlesContainer) return;

    // Check if user prefers reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return; // Skip animation if user prefers reduced motion
    }

    // Add subtle animation class for enhanced particles
    particlesContainer.style.animation = 'particlesFloat 30s ease-in-out infinite';
  }

})();

