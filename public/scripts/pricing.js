(function() {
  'use strict';

  // Initialize scroll animations when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initScrollAnimations();
  });

  // Scroll-triggered animations for pricing cards
  function initScrollAnimations() {
    const cards = document.querySelectorAll('.pricing-card');
    const comparisonItems = document.querySelectorAll('.comparison-item');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // Stagger animation for cards
          setTimeout(() => {
            entry.target.classList.add('is-visible');
          }, index * 100);
        }
      });
    }, {
      threshold: 0.2,
      rootMargin: '0px 0px -100px 0px'
    });

    cards.forEach(card => observer.observe(card));
    comparisonItems.forEach(item => observer.observe(item));
  }
})();

