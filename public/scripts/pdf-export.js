(function() {
  const card = document.getElementById('compCard');
  if (!card) return;

  const params = new URLSearchParams(window.location.search);
  const name = decodeURIComponent(params.get('name') || 'Natan Barrera');
  const role = params.get('role') || 'Editorial / Runway · New York';
  const tier = params.get('tier') || 'free';
  const image = params.get('image');
  const statsParam = params.getAll('stat');
  const bio = params.get('bio');
  const contact = params.get('contact') || 'bookings@zipsite.com · @zipsite';

  document.getElementById('cardName').textContent = name;
  document.getElementById('cardRole').textContent = role;
  document.getElementById('cardContact').textContent = contact;
  if (bio) document.getElementById('cardBio').textContent = bio;
  if (image) document.getElementById('cardImage').src = image;

  if (statsParam.length) {
    const statsContainer = document.getElementById('cardStats');
    statsContainer.innerHTML = '';
    statsParam.forEach(stat => {
      const [label, value] = stat.split(':');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `<dt>${(label || '').trim()}</dt><dd>${(value || '').trim()}</dd>`;
      statsContainer.appendChild(wrapper);
    });
  }

  function setTier(nextTier) {
    card.dataset.tier = nextTier;
    if (nextTier === 'pro') {
      card.dataset.watermark = '';
    } else {
      card.dataset.watermark = 'Refined by ZipSite';
    }
  }

  setTier(tier);

  const toggleTier = document.getElementById('toggleTier');
  if (toggleTier) {
    toggleTier.addEventListener('click', () => {
      const current = card.dataset.tier === 'pro' ? 'pro' : 'free';
      const next = current === 'pro' ? 'free' : 'pro';
      setTier(next);
      toggleTier.textContent = next === 'pro' ? 'Switch to Free tier' : 'Switch to Pro tier';
    });
  }

  const downloadButton = document.getElementById('downloadPdf');
  if (downloadButton) {
    downloadButton.addEventListener('click', async () => {
      downloadButton.disabled = true;
      downloadButton.textContent = 'Rendering…';
      const canvas = await html2canvas(card, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: [5.5, 8.5]
      });
      pdf.setProperties({
        title: `ZipSite Comp Card — ${name}`,
        author: 'ZipSite',
        subject: 'AI-refined comp card export'
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, 5.5, 8.5, undefined, 'FAST');
      const filename = `ZipSite_CompCard_${name.replace(/\s+/g, '')}.pdf`;
      pdf.save(filename);
      downloadButton.disabled = false;
      downloadButton.textContent = 'Download PDF';
    });
  }
})();
