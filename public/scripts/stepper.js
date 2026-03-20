(function() {
  const form = document.getElementById('applicationForm');
  if (!form) return;

  const steps = Array.from(form.querySelectorAll('.form-step'));
  const stepButtons = Array.from(document.querySelectorAll('.stepper .step'));
  const nextButton = document.getElementById('nextStep');
  const prevButton = document.getElementById('prevStep');
  let currentStep = 0;

  function showStep(index) {
    steps.forEach((section, idx) => {
      section.hidden = idx !== index;
    });
    stepButtons.forEach((button, idx) => {
      button.setAttribute('aria-current', idx === index ? 'step' : 'false');
    });
    prevButton.disabled = index === 0;
    nextButton.textContent = index === steps.length - 1 ? 'Submit application' : 'Next';
    currentStep = index;
    if (index === steps.length - 1) {
      populateReview();
    }
  }

  function validateStep(index) {
    const inputs = Array.from(steps[index].querySelectorAll('input, textarea, select'));
    let valid = true;
    inputs.forEach(input => {
      if (!input.checkValidity()) {
        input.reportValidity();
        valid = false;
      }
    });
    return valid;
  }

  function populateReview() {
    const profileReview = document.getElementById('reviewProfile');
    const experienceReview = document.getElementById('reviewExperience');
    if (!profileReview || !experienceReview) return;
    const formData = new FormData(form);
    profileReview.innerHTML = '';
    experienceReview.innerHTML = '';

    const profileFields = ['firstName', 'lastName', 'email', 'phone', 'location', 'height'];
    profileFields.forEach(field => {
      const value = formData.get(field);
      if (!value) return;
      const dt = document.createElement('span');
      dt.textContent = `${field.replace(/([A-Z])/g, ' $1')}: ${value}`;
      profileReview.appendChild(dt);
    });

    const bio = formData.get('bio');
    if (bio) {
      const bioItem = document.createElement('span');
      bioItem.textContent = `Bio: ${bio}`;
      experienceReview.appendChild(bioItem);
    }
    const agencyStatus = formData.get('agencyStatus');
    if (agencyStatus) {
      const agencyItem = document.createElement('span');
      agencyItem.textContent = `Agency: ${agencyStatus}`;
      experienceReview.appendChild(agencyItem);
    }
    const experienceYears = formData.get('experienceYears');
    if (experienceYears) {
      const yearsItem = document.createElement('span');
      yearsItem.textContent = `Experience: ${experienceYears}`;
      experienceReview.appendChild(yearsItem);
    }
    const credits = formData.get('credits');
    if (credits) {
      const creditsItem = document.createElement('span');
      creditsItem.textContent = `Credits: ${credits}`;
      experienceReview.appendChild(creditsItem);
    }
  }

  nextButton.addEventListener('click', () => {
    if (currentStep === steps.length - 1) {
      alert('Application submitted. We will send you the curated portfolio shortly.');
      form.reset();
      showStep(0);
      return;
    }
    if (!validateStep(currentStep)) return;
    showStep(Math.min(currentStep + 1, steps.length - 1));
  });

  prevButton.addEventListener('click', () => {
    showStep(Math.max(currentStep - 1, 0));
  });

  stepButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      if (index <= currentStep || validateStep(currentStep)) {
        showStep(index);
      }
    });
  });

  // Drag & drop
  const dragZone = document.getElementById('dragZone');
  const photoInput = document.getElementById('photoUpload');
  const countElement = document.getElementById('photoCount');
  const preview = document.getElementById('photoPreview');

  function updatePhotoCount(files) {
    if (!countElement) return;
    if (!files.length) {
      countElement.textContent = 'No files selected.';
    } else {
      countElement.textContent = `${files.length} file${files.length > 1 ? 's' : ''} ready for upload.`;
    }
  }

  function renderPreview(files) {
    if (!preview) return;
    preview.innerHTML = '';
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const figure = document.createElement('figure');
        figure.className = 'gallery-item';
        const img = document.createElement('img');
        img.src = reader.result;
        img.alt = file.name;
        figure.appendChild(img);
        const caption = document.createElement('figcaption');
        caption.className = 'caption';
        caption.textContent = 'Untitled';
        figure.appendChild(caption);
        preview.appendChild(figure);
      });
      reader.readAsDataURL(file);
    });
  }

  if (dragZone && photoInput) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dragZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dragZone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(eventName => {
      dragZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dragZone.classList.remove('dragover');
      });
    });
    dragZone.addEventListener('drop', (event) => {
      const files = event.dataTransfer.files;
      const transfer = new DataTransfer();
      Array.from(files).forEach(file => transfer.items.add(file));
      photoInput.files = transfer.files;
      updatePhotoCount(transfer.files);
      renderPreview(transfer.files);
    });
    dragZone.addEventListener('click', () => photoInput.click());
    dragZone.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        photoInput.click();
      }
    });
    photoInput.addEventListener('change', () => {
      updatePhotoCount(photoInput.files);
      renderPreview(photoInput.files);
    });
  }

  showStep(0);
})();
