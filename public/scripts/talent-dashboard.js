/**
 * Talent Dashboard Specific Logic
 * Handles Accordions, Profile Form Conditionals, and Dynamic Sections
 */

(function () {
    'use strict';
  
    // Talent Dashboard Accordion
    function initTalentAccordion() {
      const accordionItems = document.querySelectorAll('.talent-accordion__item');
      
      accordionItems.forEach(item => {
        const header = item.querySelector('.talent-accordion__header');
        const content = item.querySelector('.talent-accordion__content');
        
        if (!header || !content) return;
        
        // Set initial state (collapsed)
        const isInitiallyExpanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', isInitiallyExpanded);
        content.setAttribute('aria-hidden', !isInitiallyExpanded);
        if (!isInitiallyExpanded) {
          content.style.display = 'none';
        }
        
        header.addEventListener('click', () => {
          const isExpanded = header.getAttribute('aria-expanded') === 'true';
          
          // Toggle this item
          const newState = !isExpanded;
          header.setAttribute('aria-expanded', newState);
          content.setAttribute('aria-hidden', !newState);
          content.style.display = newState ? 'block' : 'none';
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
  
    // Handle "Other" option conditional logic for dropdowns
    function setupOtherOptionConditionals() {
      const otherConditionals = [
          { selectId: 'shoe_size', inputId: 'shoe_size_other' },
          { selectId: 'eye_color', inputId: 'eye_color_other' },
          { selectId: 'hair_color', inputId: 'hair_color_other' },
          { selectId: 'skin_tone', inputId: 'skin_tone_other' },
          { selectId: 'work_status', inputId: 'work_status_other' }
      ];
  
      otherConditionals.forEach(({ selectId, inputId }) => {
          const select = document.getElementById(selectId);
          const input = document.getElementById(inputId);
  
          if (select && input) {
              function toggleOther() {
                  input.style.display = select.value === 'Other' ? 'block' : 'none';
                  if (select.value !== 'Other') {
                      input.value = '';
                  }
              }
              toggleOther();
              select.addEventListener('change', toggleOther);
          }
      });
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
          tag.className = 'language-tag'; // Rely on CSS class
          tag.setAttribute('data-language', lang);
          
          const text = document.createTextNode(lang);
          tag.appendChild(text);
          
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'remove-language'; // Rely on CSS class
          removeBtn.setAttribute('data-language', lang);
          removeBtn.textContent = '×';
          
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
          const hasManager = entry.querySelector(`[name*="has_manager"]`)?.checked || false;
          const hasAgency = entry.querySelector(`[name*="has_agency"]`)?.checked || false;
          // Simple serializing for audit robustness (simplified from original complex Regex logic)
          // In a real refactor, use FormData per entry or similar. 
          // Keeping original structure logic but cleaned up.
          
          const rep = {
            has_manager: hasManager,
            has_agency: hasAgency
          };
          if (hasManager) {
            rep.manager_name = entry.querySelector(`[name$="_manager_name"]`)?.value || '';
            rep.manager_contact = entry.querySelector(`[name$="_manager_contact"]`)?.value || '';
          }
          if (hasAgency) {
            rep.agency_name = entry.querySelector(`[name$="_agency_name"]`)?.value || '';
            rep.agent_name = entry.querySelector(`[name$="_agent_name"]`)?.value || '';
            rep.agency_contact = entry.querySelector(`[name$="_agency_contact"]`)?.value || '';
          }
          rep.reason_leaving = entry.querySelector(`[name$="_reason_leaving"]`)?.value || '';
          entries.push(rep);
        });
        hiddenInput.value = JSON.stringify(entries);
      }
      
      function setupEntryListeners(entry, index) {
        // Find inputs relatively to ensure isolation
        const hasManagerCheckbox = entry.querySelector(`input[name*="has_manager"]`);
        const hasAgencyCheckbox = entry.querySelector(`input[name*="has_agency"]`);
        const managerFields = entry.querySelector('.manager-fields');
        const agencyFields = entry.querySelector('.agency-fields');
        
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
            });
        }
      });
      
      addBtn.addEventListener('click', () => {
        const newEntry = document.createElement('div');
        newEntry.className = 'previous-representation-entry';
        newEntry.setAttribute('data-index', repIndex);
        
        // Use CSS class for styling instead of inline styles
        // Ensure names are unique for form submission (though we use hiddenInput for actual data)
        const newIndex = repIndex; 
        
        newEntry.innerHTML = `
          <button type="button" class="remove-rep-entry">Remove</button>
          <div class="form-grid">
            <div class="form-field">
              <label>
                <input type="checkbox" name="previous_rep_${newIndex}_has_manager" value="true">
                <span>Had Manager</span>
              </label>
            </div>
            <div class="form-field">
              <label>
                <input type="checkbox" name="previous_rep_${newIndex}_has_agency" value="true">
                <span>Had Agency</span>
              </label>
            </div>
          </div>
          <div class="form-grid manager-fields" style="display: none;">
            <div class="form-field">
              <label>Manager Name</label>
              <input type="text" name="previous_rep_${newIndex}_manager_name" placeholder="Manager name">
            </div>
            <div class="form-field">
              <label>Manager Contact</label>
              <input type="text" name="previous_rep_${newIndex}_manager_contact" placeholder="Email or phone">
            </div>
          </div>
          <div class="form-grid agency-fields" style="display: none;">
            <div class="form-field">
              <label>Agency Name</label>
              <input type="text" name="previous_rep_${newIndex}_agency_name" placeholder="Agency name">
            </div>
            <div class="form-field">
              <label>Agent Name</label>
              <input type="text" name="previous_rep_${newIndex}_agent_name" placeholder="Agent name">
            </div>
            <div class="form-field">
              <label>Agency/Agent Contact</label>
              <input type="text" name="previous_rep_${newIndex}_agency_contact" placeholder="Email or phone">
            </div>
          </div>
          <div class="form-field" style="margin-top: 0.75rem;">
            <label>Reason for Leaving</label>
            <textarea name="previous_rep_${newIndex}_reason_leaving" rows="2" placeholder="Reason for leaving..."></textarea>
          </div>
        `;
        
        container.appendChild(newEntry);
        setupEntryListeners(newEntry, repIndex);
        
        const removeBtn = newEntry.querySelector('.remove-rep-entry');
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            newEntry.remove();
            updateHiddenInput();
          });
        }
        
        repIndex++;
        updateHiddenInput();
      });
      
      // Initial update
      updateHiddenInput();
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
            if (checkbox.checked) {
              const isOther = checkbox.value === 'Other';
              const experienceKey = isOther ? 'other' : checkbox.value.toLowerCase().replace(/\s+/g, '-');
              const detailsValue = experienceDetails[experienceKey] || '';
              
              const wrapper = document.createElement('div');
              wrapper.className = 'form-field';
              wrapper.style.marginTop = '0.75rem';
              
              const label = document.createElement('label');
              label.textContent = isOther ? 'Other Experience Details' : `${checkbox.value} Details`;
              label.setAttribute('for', `experience_${experienceKey}_details`);
              label.style.fontSize = '0.9rem';
              label.style.fontWeight = '500';
              label.style.display = 'block';
              label.style.marginBottom = '0.25rem';
              
              const textarea = document.createElement('textarea');
              textarea.id = `experience_${experienceKey}_details`;
              textarea.name = `experience_${experienceKey}_details`;
              textarea.rows = 3;
              textarea.placeholder = `Tell us about your ${isOther ? 'other' : checkbox.value} experience...`;
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
            } else {
                // Remove from details when unchecked
                const experienceKey = checkbox.value === 'Other' ? 'other' : checkbox.value.toLowerCase().replace(/\s+/g, '-');
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
  
    // Handle Discoverability Toggle in Console HUD
    function setupDiscoverabilityToggle() {
      const toggle = document.getElementById('discoverability-toggle');
      if (!toggle) return;
      
      const statusDot = document.querySelector('.status-dot');
      const statusText = document.querySelector('.status-text');
      
      toggle.addEventListener('change', () => {
        const isChecked = toggle.checked;
        
        // Optimistic UI update
        if (statusDot) {
           if (isChecked) {
             statusDot.classList.add('status-active');
           } else {
             statusDot.classList.remove('status-active');
           }
        }
        if (statusText) {
          statusText.textContent = isChecked ? 'Discoverable' : 'Private';
        }
        
        // Sync with backend
        fetch('/dashboard/talent/visibility', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ discoverable: isChecked })
        })
        .then(res => res.json())
        .then(data => {
          if (!data.success) throw new Error(data.message);
        })
        .catch(err => {
          console.error('Toggle failed:', err);
          // Revert UI on failure
          toggle.checked = !isChecked;
          if (statusDot) {
             if (!isChecked) statusDot.classList.add('status-active');
             else statusDot.classList.remove('status-active');
          }
           if (statusText) {
            statusText.textContent = !isChecked ? 'Discoverable' : 'Private';
          }
          alert('Failed to update status. Please try again.');
        });
      });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTalentFeatures);
    } else {
      initTalentFeatures();
    }
  
    function initTalentFeatures() {
      // Only run on Talent Dashboard
      if (!window.location.pathname.includes('/dashboard/talent')) return;
      
      initTalentAccordion();
      setupDiscoverabilityToggle();
      setupDressSizeConditional();
      setupWeightConversion();
      setupOtherOptionConditionals();
      setupLanguageDropdown();
      setupPreviousRepresentation();
      setupExperienceDetails();
      setupAnalytics();
    }

    // Fetch and display analyics data
    function setupAnalytics() {
      // Summary/HUD Elements
      const hudViewsEl = document.getElementById('hud-views-total');
      const hudDownloadsEl = document.getElementById('hud-downloads-total');
      // Legacy/Fallback elements just in case
      const summaryViewsEl = document.getElementById('analytics-total-views'); 
      const summaryTextEl = document.getElementById('analytics-summary');
      
      // Detailed Section Elements
      const detailViewsTotalEl = document.getElementById('analytics-views-total');
      const detailViewsWeekEl = document.getElementById('analytics-views-week');
      const detailDownloadsTotalEl = document.getElementById('analytics-downloads-total');
      const detailDownloadsWeekEl = document.getElementById('analytics-downloads-week');
      const detailMonthlyTotalEl = document.getElementById('analytics-monthly-total');
      const detailMonthlySubEl = document.getElementById('analytics-monthly-breakdown');
      const themesListEl = document.getElementById('analytics-themes-list');
      
      // Sections to toggle
      const analyticsLoading = document.querySelector('.analytics-loading');
      const analyticsContent = document.querySelector('.analytics-content');
      const analyticsError = document.querySelector('.analytics-error');

      fetch('/dashboard/talent/analytics')
        .then(response => {
          if (!response.ok) throw new Error('Failed to load analytics');
          return response.json();
        })
        .then(data => {
          if (data.success && data.data) {
            const { views, downloads } = data.data;
            
            // 1. Update HUD / Summary
            if (hudViewsEl) hudViewsEl.textContent = views.total || '0';
            if (hudDownloadsEl) hudDownloadsEl.textContent = downloads.total || '0';
            
            // Legacy / hidden summary update (if element exists)
            if (summaryViewsEl) summaryViewsEl.textContent = views.total || '0';
            if (summaryTextEl) {
              const viewsWeek = views.thisWeek || 0;
              summaryTextEl.setAttribute('data-views-week', viewsWeek);
            }
          }
        })
        .catch(error => {
          console.error('Analytics error:', error);
          if (hudViewsEl) hudViewsEl.textContent = '-';
          if (hudDownloadsEl) hudDownloadsEl.textContent = '-';
        });
    }
  
  })();
