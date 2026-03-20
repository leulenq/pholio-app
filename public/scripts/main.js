(function() {
  const navToggle = document.querySelector('.mobile-nav-toggle');
  const mobileNav = document.getElementById('mobileNav');
  if (navToggle && mobileNav) {
    const toggleMenu = () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      mobileNav.classList.toggle('active', !expanded);
      mobileNav.hidden = expanded;
    };
    navToggle.addEventListener('click', toggleMenu);
    mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      if (!mobileNav.hidden) toggleMenu();
    }));
  }

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReduced) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.motion-reveal').forEach((el) => {
      const delay = Number(el.dataset.delay || 0);
      if (delay) {
        el.style.transitionDelay = `${delay}ms`;
      }
      observer.observe(el);
    });
  } else {
    document.querySelectorAll('.motion-reveal').forEach(el => el.classList.add('is-visible'));
  }
})();
