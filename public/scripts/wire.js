(function () {
  const Pholio = (window.Pholio = window.Pholio || {});

  function toast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const note = document.createElement('div');
    note.className = `toast toast-${type}`;
    note.textContent = message;
    container.appendChild(note);
    requestAnimationFrame(() => {
      note.classList.add('show');
    });
    setTimeout(() => {
      note.classList.remove('show');
      note.addEventListener(
        'transitionend',
        () => {
          note.remove();
          if (!container.childElementCount) {
            container.remove();
          }
        },
        { once: true }
      );
    }, 3600);
  }

  Pholio.toast = toast;

  function setLoading(button, loadingText) {
    if (!button) return () => {};
    const originalText = button.dataset.originalText || button.textContent;
    button.dataset.originalText = originalText;
    button.disabled = true;
    if (loadingText) {
      button.textContent = loadingText;
    }
    button.classList.add('is-loading');
    return () => {
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = originalText;
    };
  }

  Pholio.setLoading = setLoading;

  function hydrateFlash() {
    const flashes = document.querySelectorAll('[data-flash]');
    flashes.forEach((node) => {
      toast(node.textContent.trim(), node.dataset.flashType || 'info');
      node.remove();
    });
  }

  function handleAsyncForms() {
    document.querySelectorAll('form[data-async]').forEach((form) => {
      form.addEventListener('submit', () => {
        const submitButton = form.querySelector('[type="submit"]');
        const loadingText = submitButton?.dataset.loadingText;
        if (submitButton) {
          setLoading(submitButton, loadingText);
        }
      });
    });
  }

  // Handle dress size conditional visibility
  function setupDressSizeConditional() {
    const genderSelect = document.getElementById('gender');
    const dressSizeField = document.getElementById('dress-size-field');
    
    if (genderSelect && dressSizeField) {
      function toggleDressSize() {
        if (genderSelect.value === 'Male') {
          dressSizeField.style.display = 'none';
          // Clear value when hidden
          const dressSizeInput = document.getElementById('dress_size');
          if (dressSizeInput) dressSizeInput.value = '';
        } else {
          dressSizeField.style.display = '';
        }
      }
      
      // Initial check
      toggleDressSize();
      
      // Update on change
      genderSelect.addEventListener('change', toggleDressSize);
    }
  }

  // Handle experience details textboxes
  function setupExperienceDetails() {
    const experienceCheckboxes = document.querySelectorAll('[name="specialties"][data-experience]');
    const detailsContainer = document.getElementById('experience-details-container');
    const detailsHiddenInput = document.getElementById('experience_details');
    
    if (!detailsContainer || !detailsHiddenInput) return;
    
    const experienceDetails = {};
    
    // Load existing details from hidden input
    try {
      const existingDetails = detailsHiddenInput.value ? JSON.parse(detailsHiddenInput.value) : {};
      Object.assign(experienceDetails, existingDetails);
    } catch (e) {
      console.warn('Failed to parse existing experience details:', e);
    }
    
    function updateExperienceDetails() {
      // Clear container
      detailsContainer.innerHTML = '';
      
      // Show textbox for each checked experience
      experienceCheckboxes.forEach(checkbox => {
        if (checkbox.checked && checkbox.value !== 'Other') {
          const experienceKey = checkbox.value.toLowerCase().replace(/\s+/g, '-');
          const detailsValue = experienceDetails[experienceKey] || '';
          
          const wrapper = document.createElement('div');
          wrapper.className = 'form-field';
          wrapper.style.marginTop = '0.75rem';
          
          const label = document.createElement('label');
          label.textContent = `${checkbox.value} Details`;
          label.setAttribute('for', `experience_${experienceKey}_details`);
          label.style.fontSize = '0.9rem';
          label.style.fontWeight = '500';
          label.style.display = 'block';
          label.style.marginBottom = '0.25rem';
          
          const textarea = document.createElement('textarea');
          textarea.id = `experience_${experienceKey}_details`;
          textarea.name = `experience_${experienceKey}_details`;
          textarea.rows = 3;
          textarea.placeholder = `Tell us about your ${checkbox.value} experience...`;
          textarea.value = detailsValue;
          textarea.style.width = '100%';
          textarea.style.padding = '0.5rem';
          textarea.style.border = '1px solid #ddd';
          textarea.style.borderRadius = '4px';
          textarea.style.fontSize = '0.9rem';
          
          // Update hidden input when textarea changes
          textarea.addEventListener('input', () => {
            if (textarea.value.trim()) {
              experienceDetails[experienceKey] = textarea.value.trim();
            } else {
              delete experienceDetails[experienceKey];
            }
            detailsHiddenInput.value = JSON.stringify(experienceDetails);
          });
          
          // Handle initial load
          if (detailsValue) {
            experienceDetails[experienceKey] = detailsValue;
            detailsHiddenInput.value = JSON.stringify(experienceDetails);
          }
          
          wrapper.appendChild(label);
          wrapper.appendChild(textarea);
          detailsContainer.appendChild(wrapper);
        } else if (checkbox.checked && checkbox.value === 'Other') {
          // Handle "Other" experience
          const detailsValue = experienceDetails['other'] || '';
          
          const wrapper = document.createElement('div');
          wrapper.className = 'form-field';
          wrapper.style.marginTop = '0.75rem';
          
          const label = document.createElement('label');
          label.textContent = 'Other Experience Details';
          label.setAttribute('for', 'experience_other_details');
          label.style.fontSize = '0.9rem';
          label.style.fontWeight = '500';
          label.style.display = 'block';
          label.style.marginBottom = '0.25rem';
          
          const textarea = document.createElement('textarea');
          textarea.id = 'experience_other_details';
          textarea.name = 'experience_other_details';
          textarea.rows = 3;
          textarea.placeholder = 'Tell us about your other experience...';
          textarea.value = detailsValue;
          textarea.style.width = '100%';
          textarea.style.padding = '0.5rem';
          textarea.style.border = '1px solid #ddd';
          textarea.style.borderRadius = '4px';
          textarea.style.fontSize = '0.9rem';
          
          textarea.addEventListener('input', () => {
            if (textarea.value.trim()) {
              experienceDetails['other'] = textarea.value.trim();
            } else {
              delete experienceDetails['other'];
            }
            detailsHiddenInput.value = JSON.stringify(experienceDetails);
          });
          
          if (detailsValue) {
            experienceDetails['other'] = detailsValue;
            detailsHiddenInput.value = JSON.stringify(experienceDetails);
          }
          
          wrapper.appendChild(label);
          wrapper.appendChild(textarea);
          detailsContainer.appendChild(wrapper);
        } else {
          // Remove from details when unchecked
          const experienceKey = checkbox.value.toLowerCase().replace(/\s+/g, '-');
          delete experienceDetails[experienceKey];
          detailsHiddenInput.value = JSON.stringify(experienceDetails);
        }
      });
    }
    
    // Update on checkbox change
    experienceCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', updateExperienceDetails);
    });
    
    // Initial update
    updateExperienceDetails();
  }

  // Handle language dropdown with add/remove functionality
  function setupLanguageDropdown() {
    const addLanguageSelect = document.getElementById('add-language-select');
    const addLanguageBtn = document.getElementById('add-language-btn');
    const languageOtherInput = document.getElementById('language-other-input');
    const selectedLanguagesContainer = document.getElementById('selected-languages-container');
    const languagesHiddenInput = document.getElementById('languages');
    
    if (!addLanguageSelect || !addLanguageBtn || !selectedLanguagesContainer || !languagesHiddenInput) return;
    
    let selectedLanguages = [];
    
    // Load existing languages
    try {
      const existingLanguages = languagesHiddenInput.value ? JSON.parse(languagesHiddenInput.value) : [];
      selectedLanguages = Array.isArray(existingLanguages) ? existingLanguages : [];
      updateLanguagesDisplay();
    } catch (e) {
      console.warn('Failed to parse existing languages:', e);
    }
    
    function updateLanguagesDisplay() {
      // Clear container
      selectedLanguagesContainer.innerHTML = '';
      
      // Show tags for selected languages
      selectedLanguages.forEach(lang => {
        const tag = document.createElement('span');
        tag.className = 'language-tag';
        tag.setAttribute('data-language', lang);
        tag.style.cssText = 'display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; background: #f0f0f0; border-radius: 4px; font-size: 0.9rem;';
        
        const text = document.createTextNode(lang);
        tag.appendChild(text);
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-language';
        removeBtn.setAttribute('data-language', lang);
        removeBtn.textContent = '×';
        removeBtn.style.cssText = 'background: none; border: none; cursor: pointer; font-size: 1.2rem; line-height: 1; color: #666;';
        
        removeBtn.addEventListener('click', () => {
          selectedLanguages = selectedLanguages.filter(l => l !== lang);
          updateLanguagesDisplay();
          updateLanguagesHiddenInput();
        });
        
        tag.appendChild(removeBtn);
        selectedLanguagesContainer.appendChild(tag);
      });
      
      // Update dropdown to disable selected options
      Array.from(addLanguageSelect.options).forEach(option => {
        if (option.value && option.value !== 'Other' && selectedLanguages.includes(option.value)) {
          option.disabled = true;
        } else if (option.value && option.value !== 'Other') {
          option.disabled = false;
        }
      });
      
      updateLanguagesHiddenInput();
    }
    
    function updateLanguagesHiddenInput() {
      languagesHiddenInput.value = JSON.stringify(selectedLanguages);
    }
    
    // Handle "Other" option
    let isOtherSelected = false;
    
    addLanguageSelect.addEventListener('change', () => {
      if (addLanguageSelect.value === 'Other') {
        languageOtherInput.style.display = 'block';
        addLanguageBtn.textContent = 'Add';
        isOtherSelected = true;
      } else {
        languageOtherInput.style.display = 'none';
        languageOtherInput.value = '';
        addLanguageBtn.textContent = 'Add';
        isOtherSelected = false;
      }
    });
    
    // Handle add button
    addLanguageBtn.addEventListener('click', () => {
      if (isOtherSelected && addLanguageSelect.value === 'Other') {
        const customLang = languageOtherInput.value.trim();
        if (customLang && !selectedLanguages.includes(customLang)) {
          selectedLanguages.push(customLang);
          languageOtherInput.value = '';
          addLanguageSelect.value = '';
          languageOtherInput.style.display = 'none';
          isOtherSelected = false;
          updateLanguagesDisplay();
        }
      } else if (addLanguageSelect.value && !selectedLanguages.includes(addLanguageSelect.value)) {
        selectedLanguages.push(addLanguageSelect.value);
        addLanguageSelect.value = '';
        updateLanguagesDisplay();
      }
    });
    
    // Allow Enter key in "Other" input
    if (languageOtherInput) {
      languageOtherInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addLanguageBtn.click();
        }
      });
    }
  }

  // Handle previous representation section with multiple entries
  function setupPreviousRepresentation() {
    const container = document.getElementById('previous-representations-container');
    const addBtn = document.getElementById('add-previous-rep-btn');
    const hiddenInput = document.getElementById('previous_representations');
    
    if (!container || !addBtn || !hiddenInput) return;
    
    let repIndex = container.querySelectorAll('.previous-representation-entry').length;
    
    function updateHiddenInput() {
      const entries = [];
      container.querySelectorAll('.previous-representation-entry').forEach((entry, index) => {
        const hasManager = entry.querySelector(`[name="previous_rep_${index}_has_manager"]`)?.checked || false;
        const hasAgency = entry.querySelector(`[name="previous_rep_${index}_has_agency"]`)?.checked || false;
        const rep = {
          has_manager: hasManager,
          has_agency: hasAgency
        };
        if (hasManager) {
          rep.manager_name = entry.querySelector(`[name="previous_rep_${index}_manager_name"]`)?.value || '';
          rep.manager_contact = entry.querySelector(`[name="previous_rep_${index}_manager_contact"]`)?.value || '';
        }
        if (hasAgency) {
          rep.agency_name = entry.querySelector(`[name="previous_rep_${index}_agency_name"]`)?.value || '';
          rep.agent_name = entry.querySelector(`[name="previous_rep_${index}_agent_name"]`)?.value || '';
          rep.agency_contact = entry.querySelector(`[name="previous_rep_${index}_agency_contact"]`)?.value || '';
        }
        rep.reason_leaving = entry.querySelector(`[name="previous_rep_${index}_reason_leaving"]`)?.value || '';
        entries.push(rep);
      });
      hiddenInput.value = JSON.stringify(entries);
    }
    
    function setupEntryListeners(entry, index) {
      const hasManagerCheckbox = entry.querySelector(`[name="previous_rep_${index}_has_manager"]`);
      const hasAgencyCheckbox = entry.querySelector(`[name="previous_rep_${index}_has_agency"]`);
      const managerFields = entry.querySelector(`#manager-fields-${index}`);
      const agencyFields = entry.querySelector(`#agency-fields-${index}`);
      
      if (hasManagerCheckbox && managerFields) {
        hasManagerCheckbox.addEventListener('change', () => {
          managerFields.style.display = hasManagerCheckbox.checked ? 'flex' : 'none';
          updateHiddenInput();
        });
      }
      
      if (hasAgencyCheckbox && agencyFields) {
        hasAgencyCheckbox.addEventListener('change', () => {
          agencyFields.style.display = hasAgencyCheckbox.checked ? 'flex' : 'none';
          updateHiddenInput();
        });
      }
      
      entry.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('input', updateHiddenInput);
        input.addEventListener('change', updateHiddenInput);
      });
    }
    
    // Setup existing entries
    container.querySelectorAll('.previous-representation-entry').forEach((entry, index) => {
      setupEntryListeners(entry, index);
      const removeBtn = entry.querySelector('.remove-rep-entry');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          entry.remove();
          updateHiddenInput();
          // Re-index remaining entries
          container.querySelectorAll('.previous-representation-entry').forEach((e, idx) => {
            e.setAttribute('data-index', idx);
            e.querySelectorAll('[name]').forEach(input => {
              const name = input.getAttribute('name');
              if (name) {
                const newName = name.replace(/previous_rep_\d+_/, `previous_rep_${idx}_`);
                input.setAttribute('name', newName);
                if (input.id) {
                  const newId = input.id.replace(/-\d+/, `-${idx}`).replace(/manager-fields-\d+|agency-fields-\d+/, (m) => m.replace(/\d+/, idx));
                  input.setAttribute('id', newId);
                }
              }
            });
            setupEntryListeners(e, idx);
          });
        });
      }
    });
    
    addBtn.addEventListener('click', () => {
      const newEntry = document.createElement('div');
      newEntry.className = 'previous-representation-entry';
      newEntry.setAttribute('data-index', repIndex);
      newEntry.style.cssText = 'margin-bottom: 1.5rem; padding: 1rem; border: 1px solid #e0e0e0; border-radius: 4px;';
      
      newEntry.innerHTML = `
        <button type="button" class="remove-rep-entry" data-index="${repIndex}" style="float: right; background: #dc3545; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Remove</button>
        <div class="form-grid">
          <div class="form-field">
            <label>
              <input type="checkbox" name="previous_rep_${repIndex}_has_manager" value="true">
              <span>Had Manager</span>
            </label>
          </div>
          <div class="form-field">
            <label>
              <input type="checkbox" name="previous_rep_${repIndex}_has_agency" value="true">
              <span>Had Agency</span>
            </label>
          </div>
        </div>
        <div class="form-grid" id="manager-fields-${repIndex}" style="display: none;">
          <div class="form-field">
            <label>Manager Name</label>
            <input type="text" name="previous_rep_${repIndex}_manager_name" placeholder="Manager name">
          </div>
          <div class="form-field">
            <label>Manager Contact</label>
            <input type="text" name="previous_rep_${repIndex}_manager_contact" placeholder="Email or phone">
          </div>
        </div>
        <div class="form-grid" id="agency-fields-${repIndex}" style="display: none;">
          <div class="form-field">
            <label>Agency Name</label>
            <input type="text" name="previous_rep_${repIndex}_agency_name" placeholder="Agency name">
          </div>
          <div class="form-field">
            <label>Agent Name</label>
            <input type="text" name="previous_rep_${repIndex}_agent_name" placeholder="Agent name">
          </div>
          <div class="form-field">
            <label>Agency/Agent Contact</label>
            <input type="text" name="previous_rep_${repIndex}_agency_contact" placeholder="Email or phone">
          </div>
        </div>
        <div class="form-field" style="margin-top: 0.75rem;">
          <label>Reason for Leaving</label>
          <textarea name="previous_rep_${repIndex}_reason_leaving" rows="2" placeholder="Reason for leaving..."></textarea>
        </div>
      `;
      
      container.appendChild(newEntry);
      setupEntryListeners(newEntry, repIndex);
      
      const removeBtn = newEntry.querySelector('.remove-rep-entry');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          newEntry.remove();
          updateHiddenInput();
          // Re-index remaining entries
          container.querySelectorAll('.previous-representation-entry').forEach((e, idx) => {
            e.setAttribute('data-index', idx);
            e.querySelectorAll('[name]').forEach(input => {
              const name = input.getAttribute('name');
              if (name) {
                const newName = name.replace(/previous_rep_\d+_/, `previous_rep_${idx}_`);
                input.setAttribute('name', newName);
                if (input.id) {
                  const newId = input.id.replace(/-\d+/, `-${idx}`).replace(/manager-fields-\d+|agency-fields-\d+/, (m) => m.replace(/\d+/, idx));
                  input.setAttribute('id', newId);
                }
              }
            });
            setupEntryListeners(e, idx);
          });
        });
      }
      
      repIndex++;
      updateHiddenInput();
    });
    
    // Initial update
    updateHiddenInput();
  }

  // Handle "Other" option conditional logic for dropdowns
  function setupOtherOptionConditionals() {
    // Shoe size
    const shoeSizeSelect = document.getElementById('shoe_size');
    const shoeSizeOtherInput = document.getElementById('shoe_size_other');
    if (shoeSizeSelect && shoeSizeOtherInput) {
      function toggleShoeSizeOther() {
        shoeSizeOtherInput.style.display = shoeSizeSelect.value === 'Other' ? 'block' : 'none';
        if (shoeSizeSelect.value !== 'Other') {
          shoeSizeOtherInput.value = '';
        }
      }
      toggleShoeSizeOther();
      shoeSizeSelect.addEventListener('change', toggleShoeSizeOther);
    }
    
    // Eye color
    const eyeColorSelect = document.getElementById('eye_color');
    const eyeColorOtherInput = document.getElementById('eye_color_other');
    if (eyeColorSelect && eyeColorOtherInput) {
      function toggleEyeColorOther() {
        eyeColorOtherInput.style.display = eyeColorSelect.value === 'Other' ? 'block' : 'none';
        if (eyeColorSelect.value !== 'Other') {
          eyeColorOtherInput.value = '';
        }
      }
      toggleEyeColorOther();
      eyeColorSelect.addEventListener('change', toggleEyeColorOther);
    }
    
    // Hair color
    const hairColorSelect = document.getElementById('hair_color');
    const hairColorOtherInput = document.getElementById('hair_color_other');
    if (hairColorSelect && hairColorOtherInput) {
      function toggleHairColorOther() {
        hairColorOtherInput.style.display = hairColorSelect.value === 'Other' ? 'block' : 'none';
        if (hairColorSelect.value !== 'Other') {
          hairColorOtherInput.value = '';
        }
      }
      toggleHairColorOther();
      hairColorSelect.addEventListener('change', toggleHairColorOther);
    }
    
    // Skin tone
    const skinToneSelect = document.getElementById('skin_tone');
    const skinToneOtherInput = document.getElementById('skin_tone_other');
    if (skinToneSelect && skinToneOtherInput) {
      function toggleSkinToneOther() {
        skinToneOtherInput.style.display = skinToneSelect.value === 'Other' ? 'block' : 'none';
        if (skinToneSelect.value !== 'Other') {
          skinToneOtherInput.value = '';
        }
      }
      toggleSkinToneOther();
      skinToneSelect.addEventListener('change', toggleSkinToneOther);
    }
    
    // Work status
    const workStatusSelect = document.getElementById('work_status');
    const workStatusOtherInput = document.getElementById('work_status_other');
    if (workStatusSelect && workStatusOtherInput) {
      function toggleWorkStatusOther() {
        workStatusOtherInput.style.display = workStatusSelect.value === 'Other' ? 'block' : 'none';
        if (workStatusSelect.value !== 'Other') {
          workStatusOtherInput.value = '';
        }
      }
      toggleWorkStatusOther();
      workStatusSelect.addEventListener('change', toggleWorkStatusOther);
    }
  }

  // Handle weight conversion between units
  function setupWeightConversion() {
    const weightInput = document.getElementById('weight');
    const weightUnitSelect = document.getElementById('weight_unit');
    const weightKgHidden = document.getElementById('weight_kg');
    const weightLbsHidden = document.getElementById('weight_lbs');
    
    if (weightInput && weightUnitSelect && weightKgHidden && weightLbsHidden) {
      function convertWeight() {
        const weight = parseFloat(weightInput.value);
        if (!weight || isNaN(weight)) {
          weightKgHidden.value = '';
          weightLbsHidden.value = '';
          return;
        }
        
        const unit = weightUnitSelect.value;
        if (unit === 'kg') {
          weightKgHidden.value = weight.toFixed(1);
          // Convert kg to lbs: 1 kg = 2.20462 lbs
          weightLbsHidden.value = (weight * 2.20462).toFixed(1);
        } else {
          weightLbsHidden.value = weight.toFixed(1);
          // Convert lbs to kg: 1 lb = 0.453592 kg
          weightKgHidden.value = (weight / 2.20462).toFixed(1);
        }
      }
      
      // Update hidden fields when weight or unit changes
      weightInput.addEventListener('input', convertWeight);
      weightInput.addEventListener('change', convertWeight);
      weightUnitSelect.addEventListener('change', () => {
        // When unit changes, we need to convert the displayed value
        const currentWeight = parseFloat(weightInput.value);
        if (currentWeight && !isNaN(currentWeight)) {
          const currentUnit = weightUnitSelect.value === 'kg' ? 'lbs' : 'kg';
          if (currentUnit === 'kg') {
            // Was kg, now lbs - convert
            weightInput.value = (currentWeight * 2.20462).toFixed(1);
          } else {
            // Was lbs, now kg - convert
            weightInput.value = (currentWeight / 2.20462).toFixed(1);
          }
        }
        convertWeight();
      });
      
      // Initial conversion
      convertWeight();
    }
  }

  // Validate video duration (10 seconds max)
  function validateVideoDuration(file, maxSeconds = 10) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        const duration = video.duration;
        resolve(duration <= maxSeconds);
      };
      video.onerror = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(false);
      };
      video.src = URL.createObjectURL(file);
    });
  }

  // Handle file previews for experience uploads
  function setupExperienceUploadHandlers(experienceKey) {
    // Setup video upload handler
    const videoInput = document.getElementById(`experience_${experienceKey}_video`);
    const videoPreview = document.getElementById(`experience_${experienceKey}_video_preview`);
    const videoDropzone = videoInput?.closest('.file-upload-area')?.querySelector('.file-upload-dropzone');
    const videoUploadLink = videoDropzone?.querySelector('.file-upload-link');
    
    if (videoInput && videoPreview && videoDropzone) {
      let selectedVideo = null;
      
      // Click on dropzone to trigger file input
      videoDropzone.addEventListener('click', () => videoInput.click());
      if (videoUploadLink) {
        videoUploadLink.addEventListener('click', (e) => {
          e.stopPropagation();
          videoInput.click();
        });
      }

      // Video input change handler
      videoInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('video/')) {
          toast('Please select a video file', 'error');
          videoInput.value = '';
          return;
        }
        
        // Check file size (50MB max)
        if (file.size > 50 * 1024 * 1024) {
          toast('Video file size must be 50MB or less', 'error');
          videoInput.value = '';
          return;
        }
        
        // Validate duration
        const isValidDuration = await validateVideoDuration(file, 10);
        if (!isValidDuration) {
          toast('Video must be 10 seconds or less', 'error');
          videoInput.value = '';
          selectedVideo = null;
          videoPreview.innerHTML = '';
          return;
        }
        
        selectedVideo = file;
        updateVideoPreview(file, videoPreview);
      });

      // Drag and drop handlers for video
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        videoDropzone.addEventListener(eventName, preventDefaults, false);
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        videoDropzone.addEventListener(eventName, () => {
          videoDropzone.classList.add('drag-over');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        videoDropzone.addEventListener(eventName, () => {
          videoDropzone.classList.remove('drag-over');
        }, false);
      });

      videoDropzone.addEventListener('drop', async function(e) {
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('video/'));
        if (files.length > 0) {
          const file = files[0];
          if (file.size > 50 * 1024 * 1024) {
            toast('Video file size must be 50MB or less', 'error');
            return;
          }
          const isValidDuration = await validateVideoDuration(file, 10);
          if (!isValidDuration) {
            toast('Video must be 10 seconds or less', 'error');
            return;
          }
          selectedVideo = file;
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          videoInput.files = dataTransfer.files;
          updateVideoPreview(file, videoPreview);
        }
      });
      
      function updateVideoPreview(file, previewGrid) {
        previewGrid.innerHTML = '';
        const reader = new FileReader();
        reader.onload = function(e) {
          const video = document.createElement('video');
          video.src = e.target.result;
          video.controls = true;
          video.style.cssText = 'width: 100%; max-width: 300px; border-radius: 8px;';
          
          const item = document.createElement('div');
          item.className = 'file-preview-item';
          item.style.cssText = 'position: relative;';
          
          const removeBtn = document.createElement('button');
          removeBtn.className = 'file-preview-item__remove';
          removeBtn.type = 'button';
          removeBtn.innerHTML = '×';
          removeBtn.addEventListener('click', () => {
            selectedVideo = null;
            videoInput.value = '';
            previewGrid.innerHTML = '';
          });
          
          item.appendChild(video);
          item.appendChild(removeBtn);
          previewGrid.appendChild(item);
        };
        reader.readAsDataURL(file);
      }
    }

    // Setup photos upload handler
    const photosInput = document.getElementById(`experience_${experienceKey}_photos`);
    const photosPreview = document.getElementById(`experience_${experienceKey}_photos_preview`);
    const photosDropzone = photosInput?.closest('.file-upload-area')?.querySelector('.file-upload-dropzone');
    const photosUploadLink = photosDropzone?.querySelector('.file-upload-link');
    
    if (photosInput && photosPreview && photosDropzone) {
      const selectedPhotos = [];
      
      // Click on dropzone to trigger file input
      photosDropzone.addEventListener('click', () => photosInput.click());
      if (photosUploadLink) {
        photosUploadLink.addEventListener('click', (e) => {
          e.stopPropagation();
          photosInput.click();
        });
      }

      // Photos input change handler
      photosInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        
        // Limit to 3 photos total
        const remainingSlots = 3 - selectedPhotos.length;
        const filesToAdd = imageFiles.slice(0, remainingSlots);
        
        if (imageFiles.length > remainingSlots) {
          toast(`You can upload up to 3 photos. Only ${remainingSlots} will be added.`, 'warning');
        }
        
        selectedPhotos.push(...filesToAdd);
        updatePhotosInput();
        updatePhotosPreview();
      });

      // Drag and drop handlers for photos
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        photosDropzone.addEventListener(eventName, preventDefaults, false);
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        photosDropzone.addEventListener(eventName, () => {
          photosDropzone.classList.add('drag-over');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        photosDropzone.addEventListener(eventName, () => {
          photosDropzone.classList.remove('drag-over');
        }, false);
      });

      photosDropzone.addEventListener('drop', function(e) {
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        if (files.length > 0) {
          const remainingSlots = 3 - selectedPhotos.length;
          const filesToAdd = files.slice(0, remainingSlots);
          
          if (files.length > remainingSlots) {
            toast(`You can upload up to 3 photos. Only ${remainingSlots} will be added.`, 'warning');
          }
          
          selectedPhotos.push(...filesToAdd);
          updatePhotosInput();
          updatePhotosPreview();
        }
      });
      
      function updatePhotosInput() {
        const dataTransfer = new DataTransfer();
        selectedPhotos.forEach(file => dataTransfer.items.add(file));
        photosInput.files = dataTransfer.files;
      }
      
      function updatePhotosPreview() {
        photosPreview.innerHTML = '';
        selectedPhotos.forEach((file, index) => {
          const reader = new FileReader();
          reader.onload = function(e) {
            const item = document.createElement('div');
            item.className = 'file-preview-item';
            
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = file.name;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'file-preview-item__remove';
            removeBtn.type = 'button';
            removeBtn.innerHTML = '×';
            removeBtn.addEventListener('click', () => {
              selectedPhotos.splice(index, 1);
              updatePhotosInput();
              updatePhotosPreview();
            });
            
            item.appendChild(img);
            item.appendChild(removeBtn);
            photosPreview.appendChild(item);
          };
          reader.readAsDataURL(file);
        });
      }
    }

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Handle experience-based upload blocks
  function setupExperienceUploads() {
    const experienceCheckboxes = document.querySelectorAll('[name="specialties"][data-experience]');
    const uploadsContainer = document.getElementById('experience-uploads-container');
    
    if (!uploadsContainer || !experienceCheckboxes.length) return;
    
    function updateExperienceUploads() {
      // Clear existing upload blocks
      uploadsContainer.innerHTML = '';
      
      // Create upload blocks for each checked experience
      experienceCheckboxes.forEach(checkbox => {
        if (checkbox.checked && checkbox.value !== 'Other') {
          const experienceKey = checkbox.value.toLowerCase().replace(/\s+/g, '-');
          const experienceName = checkbox.value;
          
          const uploadBlock = document.createElement('div');
          uploadBlock.className = 'experience-upload-block';
          uploadBlock.style.cssText = 'margin-top: 2rem; padding: 1.5rem; border: 1px solid #e0e0e0; border-radius: 4px;';
          uploadBlock.setAttribute('data-experience', experienceKey);
          
          uploadBlock.innerHTML = `
            <h4 style="margin-bottom: 1rem; font-size: 1.1rem; font-weight: 600;">${experienceName} Media</h4>
            
            <div class="form-field" style="margin-bottom: 1.5rem;">
              <label>Video (10 seconds max)</label>
              <p class="form-field__help">Upload a short video showcasing your ${experienceName} work</p>
              <div class="file-upload-area">
                <input type="file" id="experience_${experienceKey}_video" name="experience_${experienceKey}_video" accept="video/*">
                <div class="file-upload-dropzone">
                  <p class="file-upload-text">Drag and drop video here, or <span class="file-upload-link">browse</span></p>
                  <p class="file-upload-hint">Maximum 10 seconds, 50MB</p>
                </div>
                <div class="file-preview-grid" id="experience_${experienceKey}_video_preview"></div>
              </div>
            </div>
            
            <div class="form-field">
              <label>Photos (up to 3)</label>
              <p class="form-field__help">Upload photos showcasing your ${experienceName} work</p>
              <div class="file-upload-area">
                <input type="file" id="experience_${experienceKey}_photos" name="experience_${experienceKey}_photos" accept="image/jpeg,image/png,image/webp" multiple>
                <div class="file-upload-dropzone">
                  <p class="file-upload-text">Drag and drop images here, or <span class="file-upload-link">browse</span></p>
                  <p class="file-upload-hint">Up to 3 images, 10MB each</p>
                </div>
                <div class="file-preview-grid" id="experience_${experienceKey}_photos_preview"></div>
              </div>
            </div>
          `;
          
          uploadsContainer.appendChild(uploadBlock);
          
          // Setup handlers after DOM is inserted
          setTimeout(() => {
            setupExperienceUploadHandlers(experienceKey);
          }, 0);
        } else if (checkbox.checked && checkbox.value === 'Other') {
          const experienceKey = 'other';
          const experienceName = 'Other Experience';
          
          const uploadBlock = document.createElement('div');
          uploadBlock.className = 'experience-upload-block';
          uploadBlock.style.cssText = 'margin-top: 2rem; padding: 1.5rem; border: 1px solid #e0e0e0; border-radius: 4px;';
          uploadBlock.setAttribute('data-experience', experienceKey);
          
          uploadBlock.innerHTML = `
            <h4 style="margin-bottom: 1rem; font-size: 1.1rem; font-weight: 600;">${experienceName} Media</h4>
            
            <div class="form-field" style="margin-bottom: 1.5rem;">
              <label>Video (10 seconds max)</label>
              <p class="form-field__help">Upload a short video showcasing your other work</p>
              <div class="file-upload-area">
                <input type="file" id="experience_${experienceKey}_video" name="experience_${experienceKey}_video" accept="video/*">
                <div class="file-upload-dropzone">
                  <p class="file-upload-text">Drag and drop video here, or <span class="file-upload-link">browse</span></p>
                  <p class="file-upload-hint">Maximum 10 seconds, 50MB</p>
                </div>
                <div class="file-preview-grid" id="experience_${experienceKey}_video_preview"></div>
              </div>
            </div>
            
            <div class="form-field">
              <label>Photos (up to 3)</label>
              <p class="form-field__help">Upload photos showcasing your other work</p>
              <div class="file-upload-area">
                <input type="file" id="experience_${experienceKey}_photos" name="experience_${experienceKey}_photos" accept="image/jpeg,image/png,image/webp" multiple>
                <div class="file-upload-dropzone">
                  <p class="file-upload-text">Drag and drop images here, or <span class="file-upload-link">browse</span></p>
                  <p class="file-upload-hint">Up to 3 images, 10MB each</p>
                </div>
                <div class="file-preview-grid" id="experience_${experienceKey}_photos_preview"></div>
              </div>
            </div>
          `;
          
          uploadsContainer.appendChild(uploadBlock);
          
          // Setup handlers after DOM is inserted
          setTimeout(() => {
            setupExperienceUploadHandlers(experienceKey);
          }, 0);
        }
      });
    }
    
    // Update uploads when experience checkboxes change
    experienceCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', updateExperienceUploads);
    });
    
    // Initial update
    updateExperienceUploads();
  }

  // Setup file upload handlers for digitals and additional images
  function setupFileUploadHandlers() {
    // Setup digitals upload handler
    const digitalsInput = document.getElementById('digitals');
    const digitalsPreview = document.getElementById('digitals-preview-grid');
    const digitalsArea = document.getElementById('digitals-upload-area');
    const digitalsDropzone = digitalsArea?.querySelector('.file-upload-dropzone');
    const digitalsUploadLink = digitalsDropzone?.querySelector('.file-upload-link');
    
    if (digitalsInput && digitalsPreview && digitalsDropzone) {
      const selectedDigitals = [];
      
      // Click on dropzone to trigger file input
      digitalsDropzone.addEventListener('click', () => digitalsInput.click());
      if (digitalsUploadLink) {
        digitalsUploadLink.addEventListener('click', (e) => {
          e.stopPropagation();
          digitalsInput.click();
        });
      }

      // Digitals input change handler
      digitalsInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        selectedDigitals.push(...imageFiles);
        updateDigitalsInput();
        updateDigitalsPreview();
      });

      // Drag and drop handlers for digitals
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        digitalsDropzone.addEventListener(eventName, preventDefaults, false);
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        digitalsDropzone.addEventListener(eventName, () => {
          digitalsDropzone.classList.add('drag-over');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        digitalsDropzone.addEventListener(eventName, () => {
          digitalsDropzone.classList.remove('drag-over');
        }, false);
      });

      digitalsDropzone.addEventListener('drop', function(e) {
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        if (files.length > 0) {
          selectedDigitals.push(...files);
          updateDigitalsInput();
          updateDigitalsPreview();
        }
      });
      
      function updateDigitalsInput() {
        const dataTransfer = new DataTransfer();
        selectedDigitals.forEach(file => dataTransfer.items.add(file));
        digitalsInput.files = dataTransfer.files;
      }
      
      function updateDigitalsPreview() {
        digitalsPreview.innerHTML = '';
        selectedDigitals.forEach((file, index) => {
          const reader = new FileReader();
          reader.onload = function(e) {
            const item = document.createElement('div');
            item.className = 'file-preview-item';
            
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = file.name;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'file-preview-item__remove';
            removeBtn.type = 'button';
            removeBtn.innerHTML = '×';
            removeBtn.addEventListener('click', () => {
              selectedDigitals.splice(index, 1);
              updateDigitalsInput();
              updateDigitalsPreview();
            });
            
            item.appendChild(img);
            item.appendChild(removeBtn);
            digitalsPreview.appendChild(item);
          };
          reader.readAsDataURL(file);
        });
      }
    }

    // Setup additional images upload handler
    const additionalImagesInput = document.getElementById('additional_images');
    const additionalImagesPreview = document.getElementById('additional-images-preview-grid');
    const additionalImagesArea = document.getElementById('additional-images-upload-area');
    const additionalImagesDropzone = additionalImagesArea?.querySelector('.file-upload-dropzone');
    const additionalImagesUploadLink = additionalImagesDropzone?.querySelector('.file-upload-link');
    
    if (additionalImagesInput && additionalImagesPreview && additionalImagesDropzone) {
      const selectedAdditionalImages = [];
      
      // Click on dropzone to trigger file input
      additionalImagesDropzone.addEventListener('click', () => additionalImagesInput.click());
      if (additionalImagesUploadLink) {
        additionalImagesUploadLink.addEventListener('click', (e) => {
          e.stopPropagation();
          additionalImagesInput.click();
        });
      }

      // Additional images input change handler
      additionalImagesInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        selectedAdditionalImages.push(...imageFiles);
        updateAdditionalImagesInput();
        updateAdditionalImagesPreview();
      });

      // Drag and drop handlers for additional images
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        additionalImagesDropzone.addEventListener(eventName, preventDefaults, false);
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        additionalImagesDropzone.addEventListener(eventName, () => {
          additionalImagesDropzone.classList.add('drag-over');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        additionalImagesDropzone.addEventListener(eventName, () => {
          additionalImagesDropzone.classList.remove('drag-over');
        }, false);
      });

      additionalImagesDropzone.addEventListener('drop', function(e) {
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        if (files.length > 0) {
          selectedAdditionalImages.push(...files);
          updateAdditionalImagesInput();
          updateAdditionalImagesPreview();
        }
      });
      
      function updateAdditionalImagesInput() {
        const dataTransfer = new DataTransfer();
        selectedAdditionalImages.forEach(file => dataTransfer.items.add(file));
        additionalImagesInput.files = dataTransfer.files;
      }
      
      function updateAdditionalImagesPreview() {
        additionalImagesPreview.innerHTML = '';
        selectedAdditionalImages.forEach((file, index) => {
          const reader = new FileReader();
          reader.onload = function(e) {
            const item = document.createElement('div');
            item.className = 'file-preview-item';
            
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = file.name;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'file-preview-item__remove';
            removeBtn.type = 'button';
            removeBtn.innerHTML = '×';
            removeBtn.addEventListener('click', () => {
              selectedAdditionalImages.splice(index, 1);
              updateAdditionalImagesInput();
              updateAdditionalImagesPreview();
            });
            
            item.appendChild(img);
            item.appendChild(removeBtn);
            additionalImagesPreview.appendChild(item);
          };
          reader.readAsDataURL(file);
        });
      }
    }

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Handle multi-step apply form
  function handleApplyForm() {
    const applyForm = document.getElementById('apply-form');
    if (!applyForm) return;
    
    // Setup dress size conditional
    setupDressSizeConditional();
    
    // Setup weight conversion
    setupWeightConversion();
    
    // Setup "Other" option conditionals
    setupOtherOptionConditionals();
    
    // Setup experience details textboxes
    setupExperienceDetails();
    
    // Setup language dropdown functionality
    setupLanguageDropdown();
    
    // Setup previous representation section
    setupPreviousRepresentation();
    
    // Setup experience-based upload blocks
    setupExperienceUploads();
    
    // Setup file upload handlers for digitals and additional images
    setupFileUploadHandlers();
    
    // Function to merge "Other" text inputs into main fields before submission
    function mergeOtherFields() {
      // Shoe size
      const shoeSizeSelect = document.getElementById('shoe_size');
      const shoeSizeOther = document.getElementById('shoe_size_other');
      if (shoeSizeSelect && shoeSizeSelect.value === 'Other' && shoeSizeOther && shoeSizeOther.value) {
        shoeSizeSelect.value = shoeSizeOther.value;
      }
      
      // Eye color
      const eyeColorSelect = document.getElementById('eye_color');
      const eyeColorOther = document.getElementById('eye_color_other');
      if (eyeColorSelect && eyeColorSelect.value === 'Other' && eyeColorOther && eyeColorOther.value) {
        eyeColorSelect.value = eyeColorOther.value;
      }
      
      // Hair color
      const hairColorSelect = document.getElementById('hair_color');
      const hairColorOther = document.getElementById('hair_color_other');
      if (hairColorSelect && hairColorSelect.value === 'Other' && hairColorOther && hairColorOther.value) {
        hairColorSelect.value = hairColorOther.value;
      }
      
      // Skin tone
      const skinToneSelect = document.getElementById('skin_tone');
      const skinToneOther = document.getElementById('skin_tone_other');
      if (skinToneSelect && skinToneSelect.value === 'Other' && skinToneOther && skinToneOther.value) {
        skinToneSelect.value = skinToneOther.value;
      }
      
      // Work status
      const workStatusSelect = document.getElementById('work_status');
      const workStatusOther = document.getElementById('work_status_other');
      if (workStatusSelect && workStatusSelect.value === 'Other' && workStatusOther && workStatusOther.value) {
        workStatusSelect.value = workStatusOther.value;
      }
      
      // Merge previous representation fields
      const prevRepsContainer = document.getElementById('previous-representations-container');
      const prevRepsHidden = document.getElementById('previous_representations');
      if (prevRepsContainer && prevRepsHidden) {
        const entries = [];
        prevRepsContainer.querySelectorAll('.previous-representation-entry').forEach((entry, index) => {
          const hasManager = entry.querySelector(`[name*="previous_rep_${index}_has_manager"]`)?.checked || false;
          const hasAgency = entry.querySelector(`[name*="previous_rep_${index}_has_agency"]`)?.checked || false;
          const rep = {
            has_manager: hasManager,
            has_agency: hasAgency
          };
          if (hasManager) {
            rep.manager_name = entry.querySelector(`[name*="previous_rep_${index}_manager_name"]`)?.value || '';
            rep.manager_contact = entry.querySelector(`[name*="previous_rep_${index}_manager_contact"]`)?.value || '';
          }
          if (hasAgency) {
            rep.agency_name = entry.querySelector(`[name*="previous_rep_${index}_agency_name"]`)?.value || '';
            rep.agent_name = entry.querySelector(`[name*="previous_rep_${index}_agent_name"]`)?.value || '';
            rep.agency_contact = entry.querySelector(`[name*="previous_rep_${index}_agency_contact"]`)?.value || '';
          }
          rep.reason_leaving = entry.querySelector(`[name*="previous_rep_${index}_reason_leaving"]`)?.value || '';
          entries.push(rep);
        });
        prevRepsHidden.value = JSON.stringify(entries);
      }
    }

    const stepIndicators = applyForm.closest('.apply-form-card')?.querySelectorAll('.apply-steps li');
    const nextButton = document.getElementById('next-button');
    const prevButton = document.getElementById('prev-button');
    
    if (!stepIndicators || stepIndicators.length === 0) {
      // Fallback: if no step indicators, submit normally
      applyForm.addEventListener('submit', function(e) {
        // Merge "Other" fields before submission
        mergeOtherFields();
        const submitButton = applyForm.querySelector('[type="submit"]');
        if (submitButton) {
          const loadingText = submitButton?.dataset.loadingText;
          if (loadingText) {
            submitButton.disabled = true;
            submitButton.textContent = loadingText;
          }
        }
      });
      return;
    }

    // Multi-step form logic
    let currentStep = 0;
    const totalSteps = stepIndicators.length;
    
    // Defensive check: ensure we have the expected number of steps
    if (totalSteps !== 4) {
      console.warn('[Apply Form] Expected 4 steps, found:', totalSteps);
    }
    
    // Group form steps by data-step attribute
    const formSteps = Array.from(applyForm.querySelectorAll('.form-step[data-step]'));
    
    // Sort steps by data-step attribute to ensure correct order
    formSteps.sort((a, b) => {
      const stepA = parseInt(a.getAttribute('data-step'), 10);
      const stepB = parseInt(b.getAttribute('data-step'), 10);
      return stepA - stepB;
    });
    
    // Defensive check: ensure formSteps matches totalSteps
    if (formSteps.length !== totalSteps) {
      console.warn('[Apply Form] Mismatch: formSteps.length =', formSteps.length, 'totalSteps =', totalSteps);
    }

    function showStep(stepIndex) {
      // Validate step index
      if (stepIndex < 0 || stepIndex >= totalSteps) {
        console.warn('[Apply Form] Invalid step index:', stepIndex);
        return;
      }

      // Hide/show form steps (0-indexed, but data-step is 1-indexed)
      formSteps.forEach((step, index) => {
        if (index === stepIndex) {
          step.style.display = '';
        } else {
          step.style.display = 'none';
        }
      });

      // Update step indicators
      stepIndicators.forEach((indicator, index) => {
        indicator.classList.toggle('is-active', index === stepIndex);
      });

      // Update buttons - ALWAYS explicitly set type
      prevButton.disabled = stepIndex === 0;
      
      // Only on the LAST step (index totalSteps - 1) should button be submit
      const isLastStep = stepIndex === totalSteps - 1;
      if (isLastStep) {
        nextButton.textContent = 'Submit Application';
        nextButton.type = 'submit';
      } else {
        nextButton.textContent = 'Next';
        nextButton.type = 'button'; // Explicitly set to button for all non-final steps
      }

      currentStep = stepIndex;
    }

    function validateCurrentStep() {
      const currentStepElement = formSteps[currentStep];
      if (!currentStepElement) return true;
      
      let isValid = true;
      const inputs = currentStepElement.querySelectorAll('input[required], textarea[required], select[required]');
      
      inputs.forEach(input => {
        if (!input.checkValidity()) {
          input.reportValidity();
          isValid = false;
        }
      });
      
      return isValid;
    }

    // Initialize: hide all steps except the first
    formSteps.forEach((step, index) => {
      if (index !== 0) {
        step.style.display = 'none';
      }
    });
    showStep(0);

    // Google Sign-In handlers
    function handleGoogleSignIn(buttonId, isStep1) {
      const googleBtn = document.getElementById(buttonId);
      if (!googleBtn) return;

      googleBtn.addEventListener('click', async function() {
        if (!window.FirebaseAuth || typeof window.FirebaseAuth.signInWithGoogle !== 'function') {
          console.error('[Apply Form] Firebase Auth not initialized');
          alert('Authentication system not ready. Please refresh the page and try again.');
          return;
        }

        // Store original button text
        const originalText = googleBtn.innerHTML;

        try {
          // Show loading state
          googleBtn.disabled = true;
          googleBtn.innerHTML = '<span>' + (googleBtn.dataset.loadingText || 'Signing in…') + '</span>';

          // Sign in with Google
          const userCredential = await window.FirebaseAuth.signInWithGoogle();
          
          // Get user info from Google
          const user = userCredential.user;
          const email = user.email;
          const displayName = user.displayName || '';
          
          // Get ID token
          const idToken = await user.getIdToken();
          
          // Store Firebase token in hidden input field
          const firebaseTokenInput = applyForm.querySelector('#firebase_token');
          if (!firebaseTokenInput) {
            console.error('[Apply Form] ❌ Firebase token input field not found!');
            alert('Error: Firebase token input field not found. Please refresh the page and try again.');
            return;
          }
          
          // Store token in both value and data attribute for redundancy
          firebaseTokenInput.value = idToken;
          firebaseTokenInput.setAttribute('data-token', idToken);
          firebaseTokenInput.setAttribute('data-stored-at', Date.now().toString());
          
          // Verify token was stored
          if (!firebaseTokenInput.value || firebaseTokenInput.value !== idToken) {
            console.error('[Apply Form] ❌ Failed to store Firebase token in input field!');
            alert('Error: Failed to store authentication token. Please refresh the page and try again.');
            return;
          }
          
          console.log('[Apply Form] ✅ Firebase token stored in form:', {
            hasToken: !!idToken,
            tokenLength: idToken.length,
            tokenPreview: idToken.substring(0, 30) + '...',
            inputValue: firebaseTokenInput.value ? 'set' : 'not set',
            inputValueLength: firebaseTokenInput.value ? firebaseTokenInput.value.length : 0,
            inputName: firebaseTokenInput.name,
            inputId: firebaseTokenInput.id,
            formAction: applyForm.action,
            formMethod: applyForm.method
          });
          
          // Double-check the form action is correct
          if (applyForm.action !== '/apply' && !applyForm.action.includes('/apply')) {
            console.warn('[Apply Form] ⚠️ Form action is not /apply:', applyForm.action);
            applyForm.action = '/apply';
          }
          
          // Auto-fill email field if it exists (name is now handled server-side)
          const emailInput = applyForm.querySelector('#email');
          if (emailInput && email) {
            emailInput.value = email;
          }
          
          // Update UI to show authenticated state
          updateAuthenticatedUI(email);
          
          // Reset button
          googleBtn.disabled = false;
          googleBtn.innerHTML = originalText;
          
          console.log('[Apply Form] Google Sign-In successful:', email);
        } catch (error) {
          console.error('[Apply Form] Google Sign-In error:', error);
          
          // Reset button
          googleBtn.disabled = false;
          googleBtn.innerHTML = originalText;
          
          // Only show error if not user cancellation
          if (error.code !== 'auth/popup-closed-by-user') {
            const errorMessage = window.getFirebaseErrorMessage ? window.getFirebaseErrorMessage(error) : error.message || 'Google Sign-In failed. Please try again.';
            alert(errorMessage);
          }
        }
      });
    }

    // Function to update UI when authenticated
    function updateAuthenticatedUI(email) {
      // Hide Google Sign-In buttons
      const googleBtnStep1 = document.getElementById('google-signin-step1');
      const googleBtnStep4 = document.getElementById('google-signin-step4');
      const googleContainerStep1 = googleBtnStep1?.closest('div');
      const googleContainerStep4 = document.getElementById('google-signin-step4-container');
      
      if (googleContainerStep1) {
        googleContainerStep1.style.display = 'none';
      }
      if (googleContainerStep4) {
        googleContainerStep4.style.display = 'none';
      }
      
      // Hide email/password fields
      const emailPasswordFields = document.getElementById('email-password-fields');
      if (emailPasswordFields) {
        emailPasswordFields.style.display = 'none';
        
        // Remove required attributes from email/password fields since authenticated
        const emailInput = emailPasswordFields.querySelector('#email');
        const passwordInput = emailPasswordFields.querySelector('#password');
        const passwordConfirmInput = emailPasswordFields.querySelector('#password_confirm');
        
        if (emailInput) emailInput.removeAttribute('required');
        if (passwordInput) passwordInput.removeAttribute('required');
        if (passwordConfirmInput) passwordConfirmInput.removeAttribute('required');
      }
      
      // Show authenticated message
      const authenticatedMessage = document.getElementById('authenticated-message');
      const authenticatedEmail = document.getElementById('authenticated-email');
      if (authenticatedMessage && authenticatedEmail) {
        authenticatedMessage.style.display = 'block';
        authenticatedEmail.textContent = email;
      }
      
      // Update email field value if it exists
      const emailInput = applyForm.querySelector('#email');
      if (emailInput && email) {
        emailInput.value = email;
      }
    }

    // Initialize Google Sign-In handlers
    handleGoogleSignIn('google-signin-step1', true); // Step 1 handler
    handleGoogleSignIn('google-signin-step4', false); // Step 4 handler
    
    // Check if already authenticated on page load
    const firebaseTokenInput = applyForm.querySelector('#firebase_token');
    const emailInput = applyForm.querySelector('#email');
    if (firebaseTokenInput && firebaseTokenInput.value && emailInput && emailInput.value) {
      updateAuthenticatedUI(emailInput.value);
    }

    // File upload handler for step 3
    const fileInput = document.getElementById('photos');
    const dropzone = document.querySelector('.file-upload-dropzone');
    const previewGrid = document.getElementById('file-preview-grid');
    const fileUploadLink = document.querySelector('.file-upload-link');
    const selectedFiles = [];

    if (fileInput && dropzone && previewGrid) {
      // Click on dropzone to trigger file input
      dropzone.addEventListener('click', () => fileInput.click());
      if (fileUploadLink) {
        fileUploadLink.addEventListener('click', (e) => {
          e.stopPropagation();
          fileInput.click();
        });
      }

      // File input change handler
      fileInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        selectedFiles.length = 0;
        selectedFiles.push(...files);
        updatePreview();
        updateReviewPhotos();
      });

      // Drag and drop handlers
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
      });

      function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
      }

      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => {
          dropzone.classList.add('drag-over');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => {
          dropzone.classList.remove('drag-over');
        }, false);
      });

      dropzone.addEventListener('drop', function(e) {
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        if (files.length > 0) {
          selectedFiles.push(...files);
          const dataTransfer = new DataTransfer();
          selectedFiles.forEach(file => dataTransfer.items.add(file));
          fileInput.files = dataTransfer.files;
          updatePreview();
          updateReviewPhotos();
        }
      });
    }

    function updatePreview() {
      previewGrid.innerHTML = '';
      selectedFiles.forEach((file, index) => {
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = function(e) {
          const item = document.createElement('div');
          item.className = 'file-preview-item';
          
          const img = document.createElement('img');
          img.src = e.target.result;
          img.alt = file.name;
          
          const removeBtn = document.createElement('button');
          removeBtn.className = 'file-preview-item__remove';
          removeBtn.type = 'button';
          removeBtn.innerHTML = '×';
          removeBtn.addEventListener('click', () => {
            selectedFiles.splice(index, 1);
            const dataTransfer = new DataTransfer();
            selectedFiles.forEach(f => dataTransfer.items.add(f));
            fileInput.files = dataTransfer.files;
            updatePreview();
            updateReviewPhotos();
          });
          
          item.appendChild(img);
          item.appendChild(removeBtn);
          previewGrid.appendChild(item);
        };
        reader.readAsDataURL(file);
      });
    }

    // Review step population
    function populateReview() {
      const form = applyForm;
      const nameEl = document.getElementById('review-name');
      const phoneEl = document.getElementById('review-phone');
      const cityEl = document.getElementById('review-city');
      
      // Update authenticated UI when showing review step
      const firebaseTokenInput = applyForm.querySelector('#firebase_token');
      const emailInput = applyForm.querySelector('#email');
      if (firebaseTokenInput && firebaseTokenInput.value && emailInput && emailInput.value) {
        updateAuthenticatedUI(emailInput.value);
      }
      const genderEl = document.getElementById('review-gender');
      const dateOfBirthEl = document.getElementById('review-date-of-birth');
      const ageEl = document.getElementById('review-age');
      const heightEl = document.getElementById('review-height');
      const weightEl = document.getElementById('review-weight');
      const dressSizeEl = document.getElementById('review-dress-size');
      const bustEl = document.getElementById('review-bust');
      const waistEl = document.getElementById('review-waist');
      const hipsEl = document.getElementById('review-hips');
      const shoeSizeEl = document.getElementById('review-shoe-size');
      const eyeColorEl = document.getElementById('review-eye-color');
      const hairColorEl = document.getElementById('review-hair-color');
      const hairLengthEl = document.getElementById('review-hair-length');
      const skinToneEl = document.getElementById('review-skin-tone');
      const bioEl = document.getElementById('review-bio');
      const specialtiesEl = document.getElementById('review-specialties');
      const languagesEl = document.getElementById('review-languages');
      const availabilityEl = document.getElementById('review-availability');
      const experienceLevelEl = document.getElementById('review-experience-level');
      const trainingEl = document.getElementById('review-training');
      const portfolioUrlEl = document.getElementById('review-portfolio-url');
      const socialMediaEl = document.getElementById('review-social-media');
      const nationalityEl = document.getElementById('review-nationality');
      const unionMembershipEl = document.getElementById('review-union-membership');
      const ethnicityEl = document.getElementById('review-ethnicity');
      const tattoosEl = document.getElementById('review-tattoos');
      const piercingsEl = document.getElementById('review-piercings');
      const photosCountEl = document.getElementById('review-photos-count');

      if (nameEl) {
        const firstName = form.querySelector('[name="first_name"]')?.value || '';
        const lastName = form.querySelector('[name="last_name"]')?.value || '';
        nameEl.textContent = `${firstName} ${lastName}`.trim() || '—';
      }
      const emailEl = document.getElementById('review-email');
      if (emailEl) {
        const email = form.querySelector('[name="email"]')?.value || '';
        emailEl.textContent = email || '—';
      }
      if (phoneEl) phoneEl.textContent = form.querySelector('[name="phone"]')?.value || '—';
      if (cityEl) {
        const city = form.querySelector('[name="city"]')?.value || '';
        const citySecondary = form.querySelector('[name="city_secondary"]')?.value || '';
        if (citySecondary) {
          cityEl.textContent = `${city} / ${citySecondary}`;
        } else {
          cityEl.textContent = city || '—';
        }
      }
      if (genderEl) genderEl.textContent = form.querySelector('[name="gender"]')?.value || '—';
      if (dateOfBirthEl) {
        const dob = form.querySelector('[name="date_of_birth"]')?.value || '';
        if (dob) {
          const date = new Date(dob);
          dateOfBirthEl.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        } else {
          dateOfBirthEl.textContent = '—';
        }
      }
      if (ageEl) {
        const dob = form.querySelector('[name="date_of_birth"]')?.value || '';
        if (dob) {
          const birthDate = new Date(dob);
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          ageEl.textContent = age > 0 ? `${age} years` : '—';
        } else {
          ageEl.textContent = '—';
        }
      }
      if (heightEl) heightEl.textContent = form.querySelector('[name="height_cm"]')?.value || '—';
      if (weightEl) {
        const weight = form.querySelector('[name="weight"]')?.value || '';
        const weightUnit = form.querySelector('[name="weight_unit"]')?.value || '';
        if (weight && weightUnit) {
          weightEl.textContent = `${weight} ${weightUnit}`;
        } else {
          // Fallback to hidden fields if main weight field not available
          const weightKg = form.querySelector('[name="weight_kg"]')?.value || '';
          const weightLbs = form.querySelector('[name="weight_lbs"]')?.value || '';
          if (weightKg && weightLbs) {
            weightEl.textContent = `${weightKg} kg (${weightLbs} lbs)`;
          } else if (weightKg) {
            weightEl.textContent = `${weightKg} kg`;
          } else if (weightLbs) {
            weightEl.textContent = `${weightLbs} lbs`;
          } else {
            weightEl.textContent = '—';
          }
        }
      }
      if (dressSizeEl) dressSizeEl.textContent = form.querySelector('[name="dress_size"]')?.value || '—';
      if (bustEl) bustEl.textContent = form.querySelector('[name="bust"]')?.value ? `${form.querySelector('[name="bust"]').value}"` : '—';
      if (waistEl) waistEl.textContent = form.querySelector('[name="waist"]')?.value ? `${form.querySelector('[name="waist"]').value}"` : '—';
      if (hipsEl) hipsEl.textContent = form.querySelector('[name="hips"]')?.value ? `${form.querySelector('[name="hips"]').value}"` : '—';
      if (shoeSizeEl) shoeSizeEl.textContent = form.querySelector('[name="shoe_size"]')?.value || '—';
      if (eyeColorEl) eyeColorEl.textContent = form.querySelector('[name="eye_color"]')?.value || '—';
      if (hairColorEl) hairColorEl.textContent = form.querySelector('[name="hair_color"]')?.value || '—';
      if (hairLengthEl) hairLengthEl.textContent = form.querySelector('[name="hair_length"]')?.value || '—';
      if (skinToneEl) skinToneEl.textContent = form.querySelector('[name="skin_tone"]')?.value || '—';
      if (bioEl) {
        const bio = form.querySelector('[name="bio"]')?.value || '';
        bioEl.textContent = bio || '—';
      }
      if (specialtiesEl) {
        const checkboxes = form.querySelectorAll('[name="specialties"]:checked');
        const specialties = Array.from(checkboxes).map(cb => cb.value);
        specialtiesEl.textContent = specialties.length > 0 ? specialties.join(', ') : '—';
      }
      if (languagesEl) {
        const languagesHidden = form.querySelector('[name="languages"]');
        if (languagesHidden && languagesHidden.value) {
          try {
            const languages = JSON.parse(languagesHidden.value);
            languagesEl.textContent = Array.isArray(languages) && languages.length > 0 ? languages.join(', ') : '—';
          } catch {
            languagesEl.textContent = '—';
          }
        } else {
          languagesEl.textContent = '—';
        }
      }
      if (availabilityEl) {
        const travel = form.querySelector('[name="availability_travel"]')?.checked || false;
        const schedule = form.querySelector('[name="availability_schedule"]')?.value || '';
        const parts = [];
        if (schedule) parts.push(schedule);
        if (travel) parts.push('Willing to travel');
        availabilityEl.textContent = parts.length > 0 ? parts.join(' • ') : '—';
      }
      if (experienceLevelEl) experienceLevelEl.textContent = form.querySelector('[name="experience_level"]')?.value || '—';
      if (trainingEl) {
        const training = form.querySelector('[name="training"]')?.value || '';
        trainingEl.textContent = training || '—';
      }
      if (portfolioUrlEl) {
        const portfolioUrl = form.querySelector('[name="portfolio_url"]')?.value || '';
        if (portfolioUrl) {
          portfolioUrlEl.innerHTML = `<a href="${portfolioUrl}" target="_blank" rel="noopener">${portfolioUrl}</a>`;
        } else {
          portfolioUrlEl.textContent = '—';
        }
      }
      if (socialMediaEl) {
        const instagram = form.querySelector('[name="instagram_handle"]')?.value || '';
        const twitter = form.querySelector('[name="twitter_handle"]')?.value || '';
        const tiktok = form.querySelector('[name="tiktok_handle"]')?.value || '';
        const parts = [];
        if (instagram) parts.push(`Instagram: ${instagram}`);
        if (twitter) parts.push(`Twitter: ${twitter}`);
        if (tiktok) parts.push(`TikTok: ${tiktok}`);
        socialMediaEl.textContent = parts.length > 0 ? parts.join(', ') : '—';
      }
      if (nationalityEl) nationalityEl.textContent = form.querySelector('[name="nationality"]')?.value || '—';
      if (unionMembershipEl) unionMembershipEl.textContent = form.querySelector('[name="union_membership"]')?.value || '—';
      if (ethnicityEl) ethnicityEl.textContent = form.querySelector('[name="ethnicity"]')?.value || '—';
      if (tattoosEl) {
        const tattoos = form.querySelector('[name="tattoos"]')?.checked || false;
        tattoosEl.textContent = tattoos ? 'Yes' : 'No';
      }
      if (piercingsEl) {
        const piercings = form.querySelector('[name="piercings"]')?.checked || false;
        piercingsEl.textContent = piercings ? 'Yes' : 'No';
      }
      updateReviewPhotos();
    }

    function updateReviewPhotos() {
      const photosCountEl = document.getElementById('review-photos-count');
      if (photosCountEl) {
        const count = selectedFiles.length;
        photosCountEl.textContent = `${count} image${count !== 1 ? 's' : ''} selected`;
      }
    }

    // Update review when moving to step 4
    const originalShowStep = showStep;
    showStep = function(stepIndex) {
      originalShowStep(stepIndex);
      if (stepIndex === 3) { // Step 4 is index 3 (0-indexed)
        populateReview();
      }
    };

    // Next button handler
    nextButton.addEventListener('click', async function(e) {
      // Always prevent default to avoid accidental form submission
      e.preventDefault();
      e.stopPropagation();
      
      // Defensive check: ensure we're not on the last step before advancing
      if (currentStep < totalSteps - 1) {
        // Validate current step
        if (!validateCurrentStep()) {
          return;
        }
        // Move to next step
        showStep(currentStep + 1);
      } else {
        // Last step: submit form
        // Only submit if we're actually on the last step
        if (currentStep === totalSteps - 1 && validateCurrentStep()) {
          // Check if user needs to create Firebase account (not logged in)
          const emailInput = applyForm.querySelector('#email');
          const passwordInput = applyForm.querySelector('#password');
          const firebaseTokenInput = applyForm.querySelector('#firebase_token');
          
          const submitButton = applyForm.querySelector('[type="submit"]');
          const originalText = submitButton ? submitButton.textContent : '';
          
          // If email/password fields exist and no token, create Firebase user first
          if (emailInput && passwordInput && (!firebaseTokenInput || !firebaseTokenInput.value)) {
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            
            if (email && password && window.FirebaseAuth && typeof window.FirebaseAuth.signUp === 'function') {
              // Show loading state
              if (submitButton) {
                submitButton.disabled = true;
                const loadingText = submitButton?.dataset.loadingText || 'Creating account…';
                submitButton.textContent = loadingText;
              }
              
              try {
                // Create Firebase user
                const userCredential = await window.FirebaseAuth.signUp(email, password);
                
                // Get ID token
                const idToken = await userCredential.user.getIdToken();
                
                // Set token in hidden input
                if (firebaseTokenInput) {
                  firebaseTokenInput.value = idToken;
                }
                
                // Continue with form submission
                if (applyForm._formSubmitHandler) {
                  applyForm.removeEventListener('submit', applyForm._formSubmitHandler);
                }
                mergeOtherFields();
                applyForm.submit();
              } catch (error) {
                console.error('[Apply Form] Firebase signup error:', error);
                
                // Reset button state
                if (submitButton) {
                  submitButton.disabled = false;
                  submitButton.textContent = originalText;
                }
                
                // Show error
                const errorMessage = window.getFirebaseErrorMessage ? window.getFirebaseErrorMessage(error) : error.message || 'Account creation failed. Please try again.';
                alert(errorMessage);
                return;
              }
            } else {
              // No Firebase Auth available, submit normally (will fail on backend)
              if (submitButton) {
                const loadingText = submitButton?.dataset.loadingText;
                if (loadingText) {
                  submitButton.disabled = true;
                  submitButton.textContent = loadingText;
                }
              }
              if (applyForm._formSubmitHandler) {
                applyForm.removeEventListener('submit', applyForm._formSubmitHandler);
              }
              mergeOtherFields();
              applyForm.submit();
            }
          } else {
            // User already logged in or token exists, submit normally
            // Double-check that Firebase token is still present
            const tokenValue = firebaseTokenInput?.value;
            if (tokenValue) {
              console.log('[Apply Form] Submitting with Firebase token:', {
                hasToken: !!tokenValue,
                tokenLength: tokenValue.length,
                tokenPreview: tokenValue.substring(0, 20) + '...'
              });
            } else {
              console.warn('[Apply Form] No Firebase token found before submission');
            }
            
            if (submitButton) {
              const loadingText = submitButton?.dataset.loadingText;
              if (loadingText) {
                submitButton.disabled = true;
                submitButton.textContent = loadingText;
              }
            }
            // Remove the submit handler temporarily to allow submission
            if (applyForm._formSubmitHandler) {
              applyForm.removeEventListener('submit', applyForm._formSubmitHandler);
            }
            // Merge "Other" fields before submission
            mergeOtherFields();
            
            // Ensure firebase_token is still in the form before submission
            if (!firebaseTokenInput) {
              console.error('[Apply Form] Firebase token input not found!');
              alert('Authentication error. Please refresh the page and sign in again with Google.');
              return;
            }
            
            // Restore token from data attribute if value was cleared
            if (!firebaseTokenInput.value && firebaseTokenInput.getAttribute('data-token')) {
              console.warn('[Apply Form] Firebase token was cleared, restoring from data attribute...');
              firebaseTokenInput.value = firebaseTokenInput.getAttribute('data-token');
            }
            
            // Final check before submission
            if (!firebaseTokenInput.value) {
              console.error('[Apply Form] Firebase token is missing before form submission!');
              alert('Authentication error. Please sign in again with Google.');
              return;
            }
            
            // Log final token state
            console.log('[Apply Form] Submitting form with Firebase token:', {
              hasToken: !!firebaseTokenInput.value,
              tokenLength: firebaseTokenInput.value.length,
              tokenPreview: firebaseTokenInput.value.substring(0, 30) + '...',
              formAction: applyForm.action,
              formMethod: applyForm.method,
              formEnctype: applyForm.enctype
            });
            
            applyForm.submit();
          }
        }
      }
    });

    // Previous button handler
    prevButton.addEventListener('click', function() {
      if (currentStep > 0) {
        showStep(currentStep - 1);
      }
    });

    // Prevent form submission unless on last step
    const formSubmitHandler = async function(e) {
      // Defensive check: prevent submission if not on last step
      if (currentStep < totalSteps - 1) {
        e.preventDefault();
        e.stopPropagation();
        // Validate and move to next step
        if (validateCurrentStep()) {
          showStep(currentStep + 1);
        }
        return false;
      }
      
      // On last step, handle Firebase signup if needed
      const emailInput = applyForm.querySelector('#email');
      const passwordInput = applyForm.querySelector('#password');
      const firebaseTokenInput = applyForm.querySelector('#firebase_token');
      
      // Check if already authenticated with Google (has Firebase token)
      if (firebaseTokenInput && firebaseTokenInput.value) {
        // User is authenticated with Google, proceed with form submission
        console.log('[Apply Form] Submitting with Firebase token from form handler:', {
          hasToken: !!firebaseTokenInput.value,
          tokenLength: firebaseTokenInput.value.length,
          tokenPreview: firebaseTokenInput.value.substring(0, 20) + '...'
        });
        
        mergeOtherFields();
        
        // Ensure token is still in the form (check value and data attribute)
        if (!firebaseTokenInput.value) {
          // Try to restore from data attribute
          const backupToken = firebaseTokenInput.getAttribute('data-token');
          if (backupToken) {
            console.warn('[Apply Form] Firebase token was cleared, restoring from data attribute...');
            firebaseTokenInput.value = backupToken;
          } else {
            console.error('[Apply Form] Firebase token was cleared and no backup found!');
            e.preventDefault();
            alert('Authentication error. Please sign in again with Google.');
            return false;
          }
        }
        
        // Log final token state before submission
        console.log('[Apply Form] Submitting form via submit handler with Firebase token:', {
          hasToken: !!firebaseTokenInput.value,
          tokenLength: firebaseTokenInput.value.length,
          tokenPreview: firebaseTokenInput.value.substring(0, 30) + '...',
          formAction: applyForm.action,
          formMethod: applyForm.method,
          formEnctype: applyForm.enctype
        });
        
        // Remove the submit handler temporarily to allow submission
        applyForm.removeEventListener('submit', formSubmitHandler);
        
        // Submit form
        applyForm.submit();
        return;
      }
      
      // If email/password fields exist and no token, create Firebase user first
      if (emailInput && passwordInput && (!firebaseTokenInput || !firebaseTokenInput.value)) {
        e.preventDefault();
        e.stopPropagation();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if (email && password && window.FirebaseAuth && typeof window.FirebaseAuth.signUp === 'function') {
          const submitButton = applyForm.querySelector('[type="submit"]');
          const originalText = submitButton ? submitButton.textContent : '';
          
          // Show loading state
          if (submitButton) {
            submitButton.disabled = true;
            const loadingText = submitButton?.dataset.loadingText || 'Creating account…';
            submitButton.textContent = loadingText;
          }
          
          try {
            // Create Firebase user
            const userCredential = await window.FirebaseAuth.signUp(email, password);
            
            // Get ID token
            const idToken = await userCredential.user.getIdToken();
            
            // Set token in hidden input
            if (firebaseTokenInput) {
              firebaseTokenInput.value = idToken;
            }
            
            // Remove the submit handler temporarily to allow submission
            applyForm.removeEventListener('submit', formSubmitHandler);
            
            // Merge "Other" fields before submission
            mergeOtherFields();
            
            // Submit form
            applyForm.submit();
          } catch (error) {
            console.error('[Apply Form] Firebase signup error:', error);
            
            // Reset button state
            if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = originalText;
            }
            
            // Show error
            const errorMessage = window.getFirebaseErrorMessage ? window.getFirebaseErrorMessage(error) : error.message || 'Account creation failed. Please try again.';
            alert(errorMessage);
            return false;
          }
        } else {
          // No Firebase Auth available, allow submission (will fail on backend)
          if (nextButton.type !== 'submit') {
            nextButton.type = 'submit';
          }
        }
      } else {
        // User already logged in or token exists, allow submission to proceed
        if (nextButton.type !== 'submit') {
          nextButton.type = 'submit';
        }
      }
    };
    
    applyForm.addEventListener('submit', formSubmitHandler);
    
    // Store reference for potential removal
    applyForm._formSubmitHandler = formSubmitHandler;
  }

  function handleCopyLinks() {
    document.querySelectorAll('[data-copy-link]').forEach((button) => {
      button.addEventListener('click', async () => {
        const value = button.getAttribute('data-copy-value');
        try {
          await navigator.clipboard.writeText(value);
          toast('Link copied to clipboard', 'success');
        } catch (error) {
          toast('Unable to copy link', 'error');
        }
      });
    });
  }

  function handlePdfButtons() {
    document.querySelectorAll('[data-action="download-pdf"]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        const slug = button.getAttribute('data-slug');
        if (!slug) return;
        const done = setLoading(button, 'Generating…');
        try {
          const response = await fetch(`/pdf/${slug}?download=1`);
          if (!response.ok) {
            throw new Error('Unable to generate PDF');
          }
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Pholio-${slug}-compcard.pdf`;
          link.click();
          window.URL.revokeObjectURL(url);
          toast('PDF downloaded', 'success');
        } catch (error) {
          toast(error.message, 'error');
        } finally {
          done();
        }
      });
    });
  }

  function wireMobileNav() {
    const toggle = document.querySelector('.mobile-nav-toggle');
    const panel = document.querySelector('#mobileNav');
    if (!toggle || !panel) return;
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
    });
  }

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
      if (!isOpen() || event.key !== 'Tab') return;
      const focusableElements = navPanel.querySelectorAll(focusableSelectors);
      if (!focusableElements.length) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    const openNav = () => {
      if (isOpen()) return;
      lastFocusedElement = document.activeElement;
      navPanel.removeAttribute('hidden');
      navPanel.setAttribute('aria-hidden', 'false');
      navPanel.classList.add('is-open');
      navOverlay.hidden = false;
      navOverlay.classList.add('is-visible');
      document.body.classList.add('nav-open');
      menuToggle.setAttribute('aria-expanded', 'true');

      const focusable = navPanel.querySelectorAll(focusableSelectors);
      if (focusable.length) {
        focusable[0].focus();
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
      }, 250);

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
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

  function initFooterAnimations() {
    const footer = document.querySelector('.universal-footer');
    if (!footer) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          footer.classList.add('is-visible');
          
          // Stagger animation for footer sections
          const brandSection = footer.querySelector('.universal-footer__brand-section');
          const navSections = footer.querySelector('.universal-footer__nav-sections');
          const newsletterSection = footer.querySelector('.universal-footer__newsletter-section');

          if (brandSection) {
            setTimeout(() => brandSection.classList.add('is-visible'), 100);
          }
          if (navSections) {
            setTimeout(() => navSections.classList.add('is-visible'), 200);
          }
          if (newsletterSection) {
            setTimeout(() => newsletterSection.classList.add('is-visible'), 300);
          }

          // Initialize animated counters when footer is visible
          initFooterCounters();
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -100px 0px'
    });

    observer.observe(footer);
  }

  function initFooterCounters() {
    const counters = document.querySelectorAll('.footer-metrics__value[data-target]');
    
    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-target'));
      if (isNaN(target) || counter.classList.contains('animated')) return;
      
      counter.classList.add('animated');
      let current = 0;
      const increment = target / 60; // 60 frames for smooth animation
      const duration = 2000; // 2 seconds
      const stepTime = duration / 60;

      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          current = target;
          clearInterval(timer);
        }
        
        // Format number with commas
        const formatted = Math.floor(current).toLocaleString('en-US');
        counter.textContent = formatted;
      }, stepTime);
    });
  }


  document.addEventListener('DOMContentLoaded', () => {
    hydrateFlash();
    handleAsyncForms();
    handleApplyForm();
    handleCopyLinks();
    handlePdfButtons();
    wireMobileNav();
    initUniversalHeaderMenu();
    initUniversalHeaderUserMenu();
    initFooterAnimations();
    initFooterNewsletter();
  });
})();

// Footer Newsletter Form Handler
function initFooterNewsletter() {
  const form = document.getElementById('footer-newsletter-form');
  if (!form) return;

  const emailInput = document.getElementById('footer-newsletter-email');
  const submitButton = document.getElementById('footer-newsletter-submit');
  const messageDiv = document.getElementById('footer-newsletter-message');
  const inputWrapper = form.querySelector('.footer-newsletter__input-wrapper');

  if (!emailInput || !submitButton || !messageDiv || !inputWrapper) return;

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    
    // Validate email
    if (!email) {
      showNewsletterMessage('Please enter your email address.', 'error');
      emailInput.focus();
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showNewsletterMessage('Please enter a valid email address.', 'error');
      emailInput.focus();
      return;
    }

    // Set loading state
    setNewsletterLoading(true);
    showNewsletterMessage('', ''); // Clear previous messages
    inputWrapper.classList.remove('footer-newsletter__input-wrapper--error', 'footer-newsletter__input-wrapper--success');

    try {
      // For now, we'll use a simple success message
      // In the future, this can be connected to an actual newsletter API
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate API call
      
      // Success
      showNewsletterMessage('Thank you! You\'ve been subscribed.', 'success');
      inputWrapper.classList.add('footer-newsletter__input-wrapper--success');
      emailInput.value = '';
      
      // Reset after 3 seconds
      setTimeout(() => {
        inputWrapper.classList.remove('footer-newsletter__input-wrapper--success');
        showNewsletterMessage('', '');
      }, 3000);
      
    } catch (error) {
      console.error('[Newsletter] Subscription error:', error);
      showNewsletterMessage('Something went wrong. Please try again later.', 'error');
      inputWrapper.classList.add('footer-newsletter__input-wrapper--error');
    } finally {
      setNewsletterLoading(false);
    }
  });

  function setNewsletterLoading(loading) {
    if (loading) {
      submitButton.disabled = true;
      submitButton.classList.add('footer-newsletter__button--loading');
      inputWrapper.style.pointerEvents = 'none';
    } else {
      submitButton.disabled = false;
      submitButton.classList.remove('footer-newsletter__button--loading');
      inputWrapper.style.pointerEvents = '';
    }
  }

  function showNewsletterMessage(message, type) {
    messageDiv.textContent = message;
    messageDiv.className = 'footer-newsletter__message';
    if (type) {
      messageDiv.classList.add(`footer-newsletter__message--${type}`);
    }
    
    if (message) {
      messageDiv.style.opacity = '1';
      messageDiv.style.transform = 'translateY(0)';
    } else {
      messageDiv.style.opacity = '0';
      messageDiv.style.transform = 'translateY(-4px)';
    }
  }

  // Clear error state on input
  emailInput.addEventListener('input', function() {
    if (inputWrapper.classList.contains('footer-newsletter__input-wrapper--error')) {
      inputWrapper.classList.remove('footer-newsletter__input-wrapper--error');
      showNewsletterMessage('', '');
    }
  });
}
