const talentBoard = [
  { name: 'Aiko Ren', letter: 'a', image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80', location: 'Tokyo / New York' },
  { name: 'Bianca Cole', letter: 'b', image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80', location: 'Los Angeles' },
  { name: 'Cruz Vega', letter: 'c', image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80', location: 'Mexico City' },
  { name: 'Daphne Noor', letter: 'd', image: 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=80', location: 'Amsterdam' },
  { name: 'Elio Hart', letter: 'e', image: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=900&q=80', location: 'Berlin' },
  { name: 'Farrah Wilde', letter: 'f', image: 'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=900&q=80', location: 'Paris' },
  { name: 'Gianni Cruz', letter: 'g', image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=900&q=80', location: 'Milan' },
  { name: 'Hana Sol', letter: 'h', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80', location: 'Seoul' },
  { name: 'Imani Brooks', letter: 'i', image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80', location: 'London' },
  { name: 'Jules Armand', letter: 'j', image: 'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=900&q=80', location: 'Paris' },
  { name: 'Natan Barrera', letter: 'n', image: 'https://images.unsplash.com/photo-1517430816045-df4b7de11d1d?auto=format&fit=crop&w=900&q=80', location: 'New York' }
];

function renderBoard(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  talentBoard.forEach(talent => {
    const card = document.createElement('a');
    card.className = 'board-card';
    card.href = `/portfolio/?name=${encodeURIComponent(talent.name)}&tier=${talent.name === 'Natan Barrera' ? 'pro' : 'free'}`;
    card.setAttribute('data-letter', talent.letter);
    card.innerHTML = `
      <div class="skeleton" aria-hidden="true"></div>
      <img src="${talent.image}" alt="${talent.name} portrait" loading="lazy" decoding="async">
      <div class="overlay">
        <div>
          <div>${talent.name}</div>
          <div style="font-family:var(--font-sans); font-size:0.75rem; letter-spacing:0.05em; opacity:0.8;">${talent.location}</div>
        </div>
      </div>
    `;
    const img = card.querySelector('img');
    img.addEventListener('load', () => {
      const skeleton = card.querySelector('.skeleton');
      if (skeleton) skeleton.remove();
    });
    container.appendChild(card);
  });

  const index = container.parentElement.querySelector('.board-index');
  if (index) {
    index.querySelectorAll('button').forEach((btn, idx) => {
      if (!btn.hasAttribute('aria-selected')) {
        btn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
      }
    });
    index.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const letter = button.dataset.letter;
      index.querySelectorAll('button').forEach(btn => {
        const isActive = btn === button;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      if (letter === 'all') {
        container.querySelectorAll('.board-card').forEach(card => card.style.display = 'block');
      } else {
        container.querySelectorAll('.board-card').forEach(card => {
          card.style.display = card.dataset.letter === letter ? 'block' : 'none';
        });
      }
    });
  }
}

renderBoard('boardGrid');
renderBoard('demoBoard');
