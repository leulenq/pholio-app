/**
 * PDF Customizer JavaScript
 * Handles theme selection, font picker, color picker, layout controls, agency logo upload, and real-time iframe preview updates
 */

(function() {
  'use strict';

  // Get data from window
  const data = window.PDF_CUSTOMIZER_DATA || {};
  const profileSlug = data.profileSlug || '';
  const baseUrl = data.baseUrl || '';
  const currentTheme = data.currentTheme || 'classic-serif';
  const customizations = data.customizations || {};
  const theme = data.theme || {};

  // State
  let state = {
    theme: currentTheme,
    customizations: { ...customizations },
    hasChanges: false
  };

  // Initialize
  function init() {
    initTabs();
    initThemeSelection();
    initFontPicker();
    initColorPicker();
    initLayoutControls();
    initBrandingControls();
    initPreview();
    initSaveReset();
    initLogoUpload();
  }

  // Initialize tabs
  function initTabs() {
    const tabs = document.querySelectorAll('.pdf-customizer__tab');
    const panels = document.querySelectorAll('.pdf-customizer__tab-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('pdf-customizer__tab--active'));
        tab.classList.add('pdf-customizer__tab--active');
        
        // Update active panel
        panels.forEach(p => {
          p.classList.remove('pdf-customizer__tab-panel--active');
          if (p.getAttribute('data-panel') === tabName) {
            p.classList.add('pdf-customizer__tab-panel--active');
          }
        });
      });
    });
  }

  // Initialize theme selection
  function initThemeSelection() {
    const themeCards = document.querySelectorAll('.pdf-customizer__theme-card');
    
    themeCards.forEach(card => {
      card.addEventListener('click', () => {
        const themeKey = card.getAttribute('data-theme');
        
        // Update active card
        themeCards.forEach(c => c.classList.remove('pdf-customizer__theme-card--active'));
        card.classList.add('pdf-customizer__theme-card--active');
        
        // Update state
        state.theme = themeKey;
        state.hasChanges = true;
        
        // Update preview
        updatePreview();
      });
    });
  }

  // Initialize font picker
  function initFontPicker() {
    const fontSelects = ['font-name', 'font-bio', 'font-stats'];
    
    fontSelects.forEach(id => {
      const select = document.getElementById(id);
      if (select) {
        select.addEventListener('change', () => {
          if (!state.customizations.fonts) {
            state.customizations.fonts = {};
          }
          
          const fontType = id.replace('font-', '');
          state.customizations.fonts[fontType] = select.value;
          state.hasChanges = true;
          
          // Update preview
          updatePreview();
        });
      }
    });
  }

  // Initialize color picker
  function initColorPicker() {
    const colorInputs = ['color-background', 'color-text', 'color-accent'];
    
    colorInputs.forEach(id => {
      const colorInput = document.getElementById(id);
      const textInput = document.getElementById(id + '-text');
      
      if (colorInput && textInput) {
        // Sync color picker with text input
        colorInput.addEventListener('input', () => {
          textInput.value = colorInput.value.toUpperCase();
          updateColor(id.replace('color-', ''), colorInput.value);
        });
        
        textInput.addEventListener('input', () => {
          const value = textInput.value.trim();
          if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
            colorInput.value = value;
            updateColor(id.replace('color-', ''), value);
          }
        });
      }
    });
  }

  // Update color
  function updateColor(type, value) {
    if (!state.customizations.colors) {
      state.customizations.colors = {};
    }
    
    state.customizations.colors[type] = value;
    state.hasChanges = true;
    
    // Update preview
    updatePreview();
  }

  // Initialize layout controls
  function initLayoutControls() {
    const layoutInputs = ['layout-header', 'layout-grid-cols', 'layout-grid-rows', 'layout-bio', 'layout-stats'];
    
    layoutInputs.forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('change', () => {
          if (!state.customizations.layout) {
            state.customizations.layout = {};
          }
          
          if (id === 'layout-header') {
            state.customizations.layout.headerPosition = input.value;
          } else if (id === 'layout-grid-cols') {
            if (!state.customizations.layout.imageGrid) {
              state.customizations.layout.imageGrid = {};
            }
            state.customizations.layout.imageGrid.cols = parseInt(input.value, 10);
          } else if (id === 'layout-grid-rows') {
            if (!state.customizations.layout.imageGrid) {
              state.customizations.layout.imageGrid = {};
            }
            state.customizations.layout.imageGrid.rows = parseInt(input.value, 10);
          } else if (id === 'layout-bio') {
            state.customizations.layout.bioPosition = input.value;
          } else if (id === 'layout-stats') {
            state.customizations.layout.statsPosition = input.value;
          }
          
          state.hasChanges = true;
          
          // Update preview
          updatePreview();
        });
      }
    });
  }

  // Initialize branding controls
  function initBrandingControls() {
    const logoSourceRadios = document.querySelectorAll('input[name="logo-source"]');
    const logoUploadGroup = document.getElementById('logo-upload-group');
    const logoUrlGroup = document.getElementById('logo-url-group');
    
    logoSourceRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.value === 'upload') {
          logoUploadGroup.style.display = 'block';
          logoUrlGroup.style.display = 'none';
        } else {
          logoUploadGroup.style.display = 'none';
          logoUrlGroup.style.display = 'block';
        }
      });
    });
    
    // Logo position and size
    const logoPosition = document.getElementById('logo-position');
    const logoSize = document.getElementById('logo-size');
    
    if (logoPosition) {
      logoPosition.addEventListener('change', () => {
        if (!state.customizations.agencyLogo) {
          state.customizations.agencyLogo = {};
        }
        state.customizations.agencyLogo.position = logoPosition.value;
        state.hasChanges = true;
        updatePreview();
      });
    }
    
    if (logoSize) {
      logoSize.addEventListener('change', () => {
        if (!state.customizations.agencyLogo) {
          state.customizations.agencyLogo = {};
        }
        state.customizations.agencyLogo.size = logoSize.value;
        state.hasChanges = true;
        updatePreview();
      });
    }
  }

  // Initialize logo upload
  function initLogoUpload() {
    const uploadBtn = document.getElementById('upload-logo-btn');
    const logoInput = document.getElementById('logo-upload');
    const saveUrlBtn = document.getElementById('save-logo-url-btn');
    const logoUrlInput = document.getElementById('logo-url');
    const removeLogoBtn = document.getElementById('remove-logo-btn');
    
    if (uploadBtn && logoInput) {
      uploadBtn.addEventListener('click', async () => {
        const file = logoInput.files[0];
        if (!file) {
          alert('Please select a logo file');
          return;
        }
        
        const formData = new FormData();
        formData.append('logo', file);
        
        try {
          uploadBtn.disabled = true;
          uploadBtn.textContent = 'Uploading...';
          
          const response = await fetch(`/api/pdf/agency-logo/${profileSlug}`, {
            method: 'POST',
            body: formData
          });
          
          const result = await response.json();
          
          if (result.ok) {
            if (!state.customizations.agencyLogo) {
              state.customizations.agencyLogo = {};
            }
            state.customizations.agencyLogo.type = 'upload';
            state.customizations.agencyLogo.path = result.logoUrl;
            state.hasChanges = true;
            
            // Reload page to show new logo
            window.location.reload();
          } else {
            alert('Error uploading logo: ' + (result.error || 'Unknown error'));
          }
        } catch (error) {
          console.error('Error uploading logo:', error);
          alert('Error uploading logo');
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.textContent = 'Upload';
        }
      });
    }
    
    if (saveUrlBtn && logoUrlInput) {
      saveUrlBtn.addEventListener('click', async () => {
        const url = logoUrlInput.value.trim();
        if (!url) {
          alert('Please enter a logo URL');
          return;
        }
        
        try {
          saveUrlBtn.disabled = true;
          saveUrlBtn.textContent = 'Saving...';
          
          const response = await fetch(`/api/pdf/agency-logo-url/${profileSlug}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url,
              position: document.getElementById('logo-position').value,
              size: document.getElementById('logo-size').value
            })
          });
          
          const result = await response.json();
          
          if (result.ok) {
            if (!state.customizations.agencyLogo) {
              state.customizations.agencyLogo = {};
            }
            state.customizations.agencyLogo.type = 'url';
            state.customizations.agencyLogo.path = url;
            state.hasChanges = true;
            
            // Update preview
            updatePreview();
          } else {
            alert('Error saving logo URL: ' + (result.error || 'Unknown error'));
          }
        } catch (error) {
          console.error('Error saving logo URL:', error);
          alert('Error saving logo URL');
        } finally {
          saveUrlBtn.disabled = false;
          saveUrlBtn.textContent = 'Save URL';
        }
      });
    }
    
    if (removeLogoBtn) {
      removeLogoBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to remove the logo?')) {
          return;
        }
        
        try {
          removeLogoBtn.disabled = true;
          removeLogoBtn.textContent = 'Removing...';
          
          const response = await fetch(`/api/pdf/agency-logo/${profileSlug}`, {
            method: 'DELETE'
          });
          
          const result = await response.json();
          
          if (result.ok) {
            delete state.customizations.agencyLogo;
            state.hasChanges = true;
            
            // Reload page to remove logo
            window.location.reload();
          } else {
            alert('Error removing logo: ' + (result.error || 'Unknown error'));
          }
        } catch (error) {
          console.error('Error removing logo:', error);
          alert('Error removing logo');
        } finally {
          removeLogoBtn.disabled = false;
          removeLogoBtn.textContent = 'Remove Logo';
        }
      });
    }
  }

  // Initialize preview
  function initPreview() {
    const iframe = document.getElementById('pdf-preview-iframe');
    const refreshBtn = document.getElementById('refresh-preview');
    
    if (iframe) {
      iframe.addEventListener('load', () => {
        const loading = document.getElementById('preview-loading');
        const error = document.getElementById('preview-error');
        if (loading) loading.style.display = 'none';
        if (error) error.style.display = 'none';
      });
      
      iframe.addEventListener('error', () => {
        const loading = document.getElementById('preview-loading');
        const error = document.getElementById('preview-error');
        if (loading) loading.style.display = 'none';
        if (error) error.style.display = 'block';
      });
    }
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        updatePreview();
      });
    }
  }

  // Update preview
  function updatePreview() {
    const iframe = document.getElementById('pdf-preview-iframe');
    if (!iframe) return;
    
    const loading = document.getElementById('preview-loading');
    const error = document.getElementById('preview-error');
    
    if (loading) loading.style.display = 'block';
    if (error) error.style.display = 'none';
    
    // Build URL with theme and timestamp for cache busting
    const url = new URL(`${baseUrl}/pdf/view/${profileSlug}`);
    url.searchParams.set('theme', state.theme);
    url.searchParams.set('_', Date.now());
    
    iframe.src = url.toString();
  }

  // Initialize save/reset
  function initSaveReset() {
    const saveBtn = document.getElementById('save-customizations');
    const resetBtn = document.getElementById('reset-customizations');
    
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        try {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
          
          const response = await fetch(`/api/pdf/customize/${profileSlug}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              theme: state.theme,
              customizations: state.customizations
            })
          });
          
          const result = await response.json();
          
          if (result.ok) {
            state.hasChanges = false;
            alert('Customizations saved successfully');
            // Reload page to show saved customizations
            window.location.reload();
          } else {
            alert('Error saving customizations: ' + (result.error || 'Unknown error'));
          }
        } catch (error) {
          console.error('Error saving customizations:', error);
          alert('Error saving customizations');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      });
    }
    
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!confirm('Are you sure you want to reset all customizations?')) {
          return;
        }
        
        // Reset state
        state.customizations = {};
        state.theme = currentTheme;
        state.hasChanges = false;
        
        // Reload page
        window.location.reload();
      });
    }
  }

  // Initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

