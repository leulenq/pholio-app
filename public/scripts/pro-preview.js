(function() {
  'use strict';

  // Get theme data from server
  const themeData = window.PRO_PREVIEW_THEME_DATA || {};
  const allThemes = themeData.allThemes || {};
  const freeThemes = themeData.freeThemes || [];
  const proThemes = themeData.proThemes || [];
  const demoSlug = themeData.demoSlug || 'elara-k';
  const baseUrl = themeData.baseUrl || '';

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initPortfolioPreview();
    initPdfThemeGallery(); // Initialize first so themeGalleryInstance is set
    initThemeFilter(); // Initialize after theme gallery
    initCopyUrl();
    initScrollAnimations();
  });

  // Portfolio Preview - Responsive View Toggle with Loading States
  function initPortfolioPreview() {
    const frame = document.getElementById('portfolio-preview-frame');
    const controlBtns = document.querySelectorAll('.demo-portfolio-preview__control-btn');
    const iframe = document.querySelector('.demo-portfolio-preview__iframe');
    const iframeWrapper = document.querySelector('.demo-portfolio-preview__iframe-wrapper');
    const errorDiv = document.getElementById('portfolio-iframe-error');

    if (!frame || !controlBtns.length) return;

    // Set default view to desktop
    frame.setAttribute('data-view', 'desktop');
    controlBtns[0]?.classList.add('is-active');

    // Add loading state to wrapper
    if (iframeWrapper) {
      iframeWrapper.classList.add('loading');
    }

    // Handle iframe load events
    if (iframe) {
      // When iframe starts loading, show loading state
      iframe.addEventListener('load', () => {
        // Remove loading state
        if (iframeWrapper) {
          iframeWrapper.classList.remove('loading');
        }
        
        // Add loaded class for fade-in animation
        iframe.classList.add('loaded');
        
        // Hide error if it was showing
        if (errorDiv) {
          errorDiv.style.display = 'none';
        }
        
        console.log('[Demo] Portfolio iframe loaded successfully');
      });

      // Handle iframe load errors
      iframe.addEventListener('error', () => {
        console.warn('[Demo] Portfolio iframe failed to load');
        
        // Remove loading state
        if (iframeWrapper) {
          iframeWrapper.classList.remove('loading');
        }
        
        // Hide iframe and show error
        if (iframe) {
          iframe.style.display = 'none';
        }
        if (errorDiv) {
          errorDiv.style.display = 'block';
        }
      });

      // Fallback: remove loading state after timeout (even if load event doesn't fire)
      const loadingTimeout = setTimeout(() => {
        if (iframeWrapper && iframeWrapper.classList.contains('loading')) {
          iframeWrapper.classList.remove('loading');
          
          // Check if iframe actually loaded
          try {
            // Try to access iframe content - if it fails, it might still be loading
            if (iframe.contentWindow && iframe.contentWindow.document) {
              // Iframe loaded successfully
              iframe.classList.add('loaded');
              if (errorDiv) errorDiv.style.display = 'none';
            }
          } catch (e) {
            // Cross-origin - this is expected for portfolio content
            // Assume it's working unless we get an explicit error
            iframe.classList.add('loaded');
            if (errorDiv) errorDiv.style.display = 'none';
          }
        }
      }, 5000);

      // Clear timeout if iframe loads before timeout
      iframe.addEventListener('load', () => {
        clearTimeout(loadingTimeout);
      }, { once: true });
    }

    controlBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        
        // Update active state
        controlBtns.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        
        // Update frame view
        frame.setAttribute('data-view', view);
        
        // Add smooth transition effect
        if (iframe) {
          iframe.classList.remove('loaded');
          if (iframeWrapper) {
            iframeWrapper.classList.add('loading');
          }
        }
        
        // Reload iframe to ensure proper sizing (with delay for smooth transition)
        if (iframe && iframe.src) {
          const currentSrc = iframe.src;
          iframe.src = '';
          setTimeout(() => {
            iframe.src = currentSrc;
          }, 200);
        }
      });
    });
  }

  // Theme Filter Tabs
  let currentThemeFilter = 'all';
  let themeGalleryInstance = null;

  function initThemeFilter() {
    // Themes filter is now optional - only if tabs exist
    const tabs = document.querySelectorAll('.demo-pdf-themes__tab');
    if (!tabs.length) return; // No tabs on new page layout
    
    const gallery = document.getElementById('pdf-themes-gallery') || 
                    document.querySelector('.demo-pdf-themes-section__gallery');
    
    if (!tabs.length || !gallery) return;

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const filter = tab.dataset.themeFilter;
        currentThemeFilter = filter;
        
        // Update active state
        tabs.forEach(t => t.classList.remove('demo-pdf-themes__tab--active'));
        tab.classList.add('demo-pdf-themes__tab--active');
        
        // Reset preview when switching filters
        if (themeGalleryInstance && themeGalleryInstance.resetPdfPreview) {
          themeGalleryInstance.resetPdfPreview();
        }
        
        // Re-render themes with filter
        if (themeGalleryInstance && themeGalleryInstance.renderThemeCards) {
          themeGalleryInstance.renderThemeCards(filter);
        }
      });
    });
  }

  // PDF Theme Gallery
  function initPdfThemeGallery() {
    // Try new section first, fall back to old selector
    const gallery = document.getElementById('pdf-themes-gallery') || 
                    document.querySelector('.demo-pdf-themes-section__gallery');
    // Support both new and old selectors for preview elements
    const previewContent = document.getElementById('pdf-preview-content') ||
                          document.querySelector('.demo-pdf-themes-section__preview-content');
    const previewTitle = document.getElementById('preview-theme-name') ||
                        document.querySelector('.demo-pdf-themes-section__preview-title');
    const previewDescription = document.getElementById('preview-theme-description') ||
                              document.querySelector('.demo-pdf-themes-section__preview-subtitle');
    const previewActions = document.getElementById('pdf-preview-actions') ||
                          document.querySelector('.demo-pdf-themes-section__preview-actions');
    const previewBadge = document.getElementById('preview-theme-badge') ||
                        document.querySelector('.demo-pdf-themes-section__preview-badge');
    const downloadBtn = document.getElementById('download-pdf-btn') ||
                       document.querySelector('.demo-pdf-themes-section__download-btn');
    const closeBtn = document.getElementById('close-pdf-preview') ||
                    document.querySelector('.demo-pdf-themes-section__preview-close');

    if (!gallery) return;

    // Render theme cards initially
    renderThemeCards('all');

    // Theme card click handler
    if (gallery) {
      gallery.addEventListener('click', (e) => {
        const card = e.target.closest('.demo-pdf-theme-card');
        if (!card) return;

        const themeKey = card.dataset.theme;
        const theme = allThemes[themeKey];
        if (!theme) return;

        // Update selected state
        document.querySelectorAll('.demo-pdf-theme-card').forEach(c => {
          c.classList.remove('is-selected');
        });
        card.classList.add('is-selected');

        // Update preview - try new section first, fall back to old
        const previewContainer = document.querySelector('#pdf-theme-preview') ||
                                 document.querySelector('.demo-pdf-themes-section__preview') ||
                                 document.querySelector('.demo-pdf-themes__preview');
        if (previewContainer) {
          updatePdfPreview(themeKey, theme);
        }
      });
    }

    // Close preview handler
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        resetPdfPreview();
      });
    }

    function renderThemeCards(filter = 'all') {
      if (!gallery) return;
      
      // Clear gallery
      gallery.innerHTML = '';
      
      // Reset preview when re-rendering (only if preview is shown)
      if (previewActions && !previewActions.hidden) {
        resetPdfPreview();
      }
      
      // Get themes to render based on filter
      let themesToRender = [];
      if (filter === 'free') {
        themesToRender = freeThemes;
      } else if (filter === 'pro') {
        themesToRender = proThemes;
      } else {
        themesToRender = Object.values(allThemes);
      }

      // Sort: Free themes first, then Studio+ themes
      themesToRender.sort((a, b) => {
        if (a.isPro === b.isPro) return 0;
        return a.isPro ? 1 : -1;
      });

      // Render theme cards
      themesToRender.forEach((theme, index) => {
        if (!theme || !theme.key) return;
        const card = createThemeCard(theme, index);
        if (card) {
          gallery.appendChild(card);
        }
      });
    }

    function createThemeCard(theme, index) {
      const card = document.createElement('div');
      card.className = `demo-pdf-theme-card ${theme.isPro ? 'demo-pdf-theme-card--pro' : 'demo-pdf-theme-card--free'}`;
      card.dataset.theme = theme.key;
      
      // Create preview with theme colors
      const previewBg = theme.colors.background;
      const previewText = theme.colors.text;
      const previewAccent = theme.colors.accent;
      
      // Get font family for preview (use name font)
      const nameFont = theme.fonts.name || 'serif';
      
      card.innerHTML = `
        <div class="demo-pdf-theme-card__preview" style="background: ${previewBg}; color: ${previewText};">
          <div class="demo-pdf-theme-card__preview-content">
            <div class="demo-pdf-theme-card__preview-name" style="font-family: '${nameFont}', ${nameFont.includes('Sans') || nameFont === 'Inter' ? 'sans-serif' : 'serif'}; color: ${previewText};">
              ELARA KEATS
            </div>
            <div class="demo-pdf-theme-card__preview-stats" style="color: ${previewAccent};">
              5'11" • 32-25-35
            </div>
            <div class="demo-pdf-theme-card__preview-colors">
              <div class="demo-pdf-theme-card__swatch" style="background: ${previewBg}; border: 1px solid ${previewText}20;"></div>
              <div class="demo-pdf-theme-card__swatch" style="background: ${previewText};"></div>
              <div class="demo-pdf-theme-card__swatch" style="background: ${previewAccent};"></div>
            </div>
          </div>
          ${theme.isPro ? '<div class="demo-pdf-theme-card__pro-badge">Studio+</div>' : ''}
        </div>
        <div class="demo-pdf-theme-card__info">
          <div class="demo-pdf-theme-card__name">
            ${theme.name}
            <span class="demo-pdf-theme-card__badge ${theme.isPro ? 'demo-pdf-theme-card__badge--pro' : 'demo-pdf-theme-card__badge--free'}">
              ${theme.isPro ? 'Studio+' : 'Free'}
            </span>
          </div>
          <div class="demo-pdf-theme-card__personality">${theme.personality || theme.description || ''}</div>
          ${theme.isPro ? '<div class="demo-pdf-theme-card__features">Full customization</div>' : '<div class="demo-pdf-theme-card__features">Pholio watermark</div>'}
        </div>
      `;

      // Stagger animation
      setTimeout(() => {
        card.classList.add('is-visible');
      }, index * 100);

      return card;
    }

    function updatePdfPreview(themeKey, theme) {
      if (!previewContent || !previewTitle) return;

      // Update title and description
      previewTitle.textContent = `${theme.name} Theme`;
      if (previewDescription) {
        previewDescription.textContent = theme.description || theme.personality || '';
      }

      // Update badge (support both old and new class names)
      if (previewBadge) {
        previewBadge.textContent = theme.isPro ? 'Studio+ Theme' : 'Free Theme';
        const isNewSection = previewBadge.closest('.demo-pdf-themes-section__preview');
        const badgeClass = isNewSection ? 
          `demo-pdf-themes-section__preview-badge ${theme.isPro ? 'demo-pdf-themes-section__preview-badge--pro' : 'demo-pdf-themes-section__preview-badge--free'}` :
          `demo-pdf-themes__preview-badge ${theme.isPro ? 'demo-pdf-themes__preview-badge--pro' : 'demo-pdf-themes__preview-badge--free'}`;
        previewBadge.className = badgeClass;
      }

      // Show preview actions
      if (previewActions) {
        previewActions.hidden = false;
      }

      if (closeBtn) {
        closeBtn.hidden = false;
      }

      // Create iframe preview with error handling
      // Use relative URL if baseUrl is empty (for same-origin requests)
      const previewUrl = baseUrl 
        ? `${baseUrl}/pdf/view/${demoSlug}?theme=${themeKey}&_=${Date.now()}`
        : `/pdf/view/${demoSlug}?theme=${themeKey}&_=${Date.now()}`;
      
      console.log('[Demo] Loading PDF preview:', previewUrl);
      
      previewContent.innerHTML = `
        <div class="demo-pdf-themes__preview-loading" style="padding: 2rem; text-align: center; color: #666;">
          <p>Loading preview...</p>
        </div>
        <iframe 
          src="${previewUrl}" 
          class="demo-pdf-themes__preview-iframe"
          title="PDF ${theme.name} Theme Preview"
          loading="lazy"
          style="display: none; width: 100%; min-height: 600px; border: none; background: white;">
        </iframe>
        <div class="demo-pdf-themes__preview-error" style="display: none; padding: 2rem; text-align: center; color: #666;">
          <p>PDF preview unavailable</p>
          <p style="font-size: 0.9rem; margin-top: 0.5rem;">The demo PDF is not available at this time.</p>
        </div>
      `;

      const iframe = previewContent.querySelector('.demo-pdf-themes__preview-iframe');
      const loadingDiv = previewContent.querySelector('.demo-pdf-themes__preview-loading');
      const errorDiv = previewContent.querySelector('.demo-pdf-themes__preview-error');

      if (iframe) {
        let hasLoaded = false;
        let loadTimeout = null;
        let errorCheckAttempts = 0;
        const maxErrorCheckAttempts = 3;

        // Check if iframe content has explicit error (returns false only if explicit error found)
        const checkIframeContent = () => {
          errorCheckAttempts++;
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc && iframeDoc.body) {
              const bodyText = iframeDoc.body.textContent || '';
              const bodyHTML = iframeDoc.body.innerHTML || '';
              
              console.log('[Demo] PDF iframe content check (attempt', errorCheckAttempts, '):', {
                bodyLength: bodyHTML.length,
                bodyTextPreview: bodyText.substring(0, 100),
                hasBody: !!iframeDoc.body
              });
              
              // Check for explicit error messages (very specific - must match error page structure)
              const hasExplicitError = (
                (bodyText.includes('PDF preview unavailable') && bodyText.includes('not available at this time')) ||
                (bodyText.includes('Database Error') && bodyText.includes('Unable to connect')) ||
                (bodyText.includes('Profile not found') && bodyHTML.length < 1000 && !bodyHTML.includes('comp-card')) ||
                (bodyText.includes('Demo Error') && bodyHTML.length < 1000) ||
                (bodyHTML.includes('<div class="error">') && bodyHTML.length < 1000 && !bodyHTML.includes('comp-card'))
              );
              
              // Check for PDF comp card (positive indicator)
              const hasCompCard = bodyHTML.includes('comp-card') || 
                                 bodyHTML.includes('comp-card__') ||
                                 iframeDoc.querySelector('.comp-card') !== null ||
                                 iframeDoc.querySelector('[class*="comp-card"]') !== null;
              
              if (hasExplicitError && !hasCompCard) {
                console.error('[Demo] PDF iframe: Explicit error detected (no comp-card found)');
                return false;
              } else if (hasCompCard) {
                console.log('[Demo] PDF iframe: Content valid (comp-card found, length:', bodyHTML.length, ')');
                return true;
              } else if (bodyHTML.length > 1000) {
                // Substantial content but no comp-card detected - might still be loading or valid
                console.log('[Demo] PDF iframe: Substantial content found (length:', bodyHTML.length, '), assuming valid');
                return true;
              } else {
                // Unknown state - might be loading or valid but small
                console.log('[Demo] PDF iframe: Unknown state (length:', bodyHTML.length, ', comp-card:', hasCompCard, ')');
                return null;
              }
            } else {
              console.log('[Demo] PDF iframe: No body element yet');
              return null;
            }
          } catch (e) {
            // Can't access content - return null (unknown)
            console.log('[Demo] PDF iframe: Cannot access content (attempt', errorCheckAttempts, '):', e.message);
          }
          return null; // Unknown state
        };

        // Handle iframe load event - show iframe by default after load, only hide if explicit error
        iframe.addEventListener('load', () => {
          console.log('[Demo] PDF iframe load event fired for:', previewUrl);
          
          // First, wait a moment for content to render
          setTimeout(() => {
            const contentCheck = checkIframeContent();
            
            if (contentCheck === true) {
              // Successfully loaded PDF view - show iframe immediately
              console.log('[Demo] PDF iframe: Successfully loaded, showing iframe');
              hasLoaded = true;
              if (loadingDiv) loadingDiv.style.display = 'none';
              if (errorDiv) errorDiv.style.display = 'none';
              iframe.style.display = 'block';
              if (loadTimeout) clearTimeout(loadTimeout);
            } else if (contentCheck === false) {
              // Explicit error detected - check one more time to confirm
              console.warn('[Demo] PDF iframe: Error detected, checking again to confirm...');
              setTimeout(() => {
                const retryCheck = checkIframeContent();
                if (retryCheck === false) {
                  // Error confirmed - show error message
                  console.error('[Demo] PDF iframe: Error confirmed');
                  if (loadingDiv) loadingDiv.style.display = 'none';
                  if (iframe) iframe.style.display = 'none';
                  if (errorDiv) errorDiv.style.display = 'block';
                  if (loadTimeout) clearTimeout(loadTimeout);
                } else {
                  // Actually loaded on retry - show iframe
                  console.log('[Demo] PDF iframe: Loaded successfully on retry');
                  hasLoaded = true;
                  if (loadingDiv) loadingDiv.style.display = 'none';
                  if (errorDiv) errorDiv.style.display = 'none';
                  iframe.style.display = 'block';
                  if (loadTimeout) clearTimeout(loadTimeout);
                }
              }, 2000);
            } else {
              // Unknown state (contentCheck === null) - can't verify content
              // For same-origin iframes, if load event fired, show iframe by default
              // This is the default behavior - assume success unless we can prove otherwise
              console.log('[Demo] PDF iframe: Cannot verify content, showing iframe by default (load event fired)');
              
              // Show iframe immediately - don't wait for verification
              hasLoaded = true;
              if (loadingDiv) loadingDiv.style.display = 'none';
              if (errorDiv) errorDiv.style.display = 'none';
              iframe.style.display = 'block';
              
              // Still check for errors in the background (but don't hide iframe unless explicit error)
              setTimeout(() => {
                const backgroundCheck = checkIframeContent();
                if (backgroundCheck === false) {
                  // Error detected in background - but only hide if we're really sure
                  console.error('[Demo] PDF iframe: Error detected in background check');
                  // Don't hide iframe immediately - let user see what's there
                  // But log for debugging
                }
              }, 3000);
              
              if (loadTimeout) clearTimeout(loadTimeout);
            }
          }, 1500); // Wait 1.5 seconds for initial content render
        });

        // Handle iframe error event
        iframe.addEventListener('error', () => {
          console.error('[Demo] PDF iframe error event fired for:', previewUrl);
          if (loadingDiv) loadingDiv.style.display = 'none';
          if (iframe) iframe.style.display = 'none';
          if (errorDiv) errorDiv.style.display = 'block';
          if (loadTimeout) clearTimeout(loadTimeout);
        });

        // Fallback: if iframe doesn't load within 20 seconds, check content or show error
        loadTimeout = setTimeout(() => {
          if (!hasLoaded) {
            console.warn('[Demo] PDF iframe load timeout for:', previewUrl);
            
            // Check if iframe document is accessible
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (iframeDoc) {
                // Document exists - check if it has content
                if (iframeDoc.body && iframeDoc.body.innerHTML) {
                  const bodyHTML = iframeDoc.body.innerHTML || '';
                  const bodyText = iframeDoc.body.textContent || '';
                  
                  console.log('[Demo] PDF iframe timeout: Document exists, checking content:', {
                    bodyLength: bodyHTML.length,
                    bodyTextPreview: bodyText.substring(0, 100),
                    hasBody: !!iframeDoc.body
                  });
                  
                  // Check for explicit errors
                  const hasExplicitError = (
                    bodyText.includes('PDF preview unavailable') && bodyText.includes('not available at this time') ||
                    (bodyText.includes('Database Error') && bodyText.includes('Unable to connect')) ||
                    (bodyText.includes('Profile not found') && bodyHTML.length < 1000) ||
                    (bodyText.includes('Demo Error') && bodyHTML.length < 1000) ||
                    (bodyHTML.includes('<div class="error">') && bodyHTML.length < 1000)
                  );
                  
                  // Check for comp-card
                  const hasCompCard = bodyHTML.includes('comp-card') || 
                                     iframeDoc.querySelector('.comp-card') !== null;
                  
                  if (hasExplicitError && !hasCompCard) {
                    // Explicit error - show error message
                    console.error('[Demo] PDF iframe timeout: Explicit error detected');
                    if (loadingDiv) loadingDiv.style.display = 'none';
                    if (iframe) iframe.style.display = 'none';
                    if (errorDiv) errorDiv.style.display = 'block';
                  } else if (hasCompCard || bodyHTML.length > 500) {
                    // Has content - show iframe
                    console.log('[Demo] PDF iframe timeout: Content found, showing iframe');
                    hasLoaded = true;
                    if (loadingDiv) loadingDiv.style.display = 'none';
                    if (errorDiv) errorDiv.style.display = 'none';
                    iframe.style.display = 'block';
                  } else if (bodyHTML.length === 0) {
                    // Empty body - might be loading or route error
                    console.error('[Demo] PDF iframe timeout: Empty body detected - route may have failed');
                    if (loadingDiv) loadingDiv.style.display = 'none';
                    if (iframe) iframe.style.display = 'none';
                    if (errorDiv) errorDiv.style.display = 'block';
                  } else {
                    // Small content - might be loading or valid
                    console.warn('[Demo] PDF iframe timeout: Small content detected, showing iframe anyway');
                    hasLoaded = true;
                    if (loadingDiv) loadingDiv.style.display = 'none';
                    if (errorDiv) errorDiv.style.display = 'none';
                    iframe.style.display = 'block';
                  }
                } else {
                  // No body element - route might have failed
                  console.error('[Demo] PDF iframe timeout: No body element - route may have failed');
                  if (loadingDiv) loadingDiv.style.display = 'none';
                  if (iframe) iframe.style.display = 'none';
                  if (errorDiv) errorDiv.style.display = 'block';
                }
              } else {
                // Can't access document - might be CORS or route error
                console.error('[Demo] PDF iframe timeout: Cannot access document - route may have failed or CORS issue');
                if (loadingDiv) loadingDiv.style.display = 'none';
                if (iframe) iframe.style.display = 'none';
                if (errorDiv) errorDiv.style.display = 'block';
              }
            } catch (e) {
              // Error accessing iframe - route likely failed
              console.error('[Demo] PDF iframe timeout: Error accessing iframe:', e.message);
              if (loadingDiv) loadingDiv.style.display = 'none';
              if (iframe) iframe.style.display = 'none';
              if (errorDiv) errorDiv.style.display = 'block';
            }
          }
        }, 20000); // Increased timeout to 20 seconds
      }

      // Update download button
      if (downloadBtn) {
        const downloadUrl = baseUrl 
          ? `${baseUrl}/pdf/${demoSlug}?theme=${themeKey}&download=1`
          : `/pdf/${demoSlug}?theme=${themeKey}&download=1`;
        downloadBtn.href = downloadUrl;
        downloadBtn.textContent = `Download ${theme.name} PDF`;
      }
    }

    function resetPdfPreview() {
      if (!previewContent || !previewTitle) return;

      previewTitle.textContent = 'Select a theme';
      if (previewDescription) {
        previewDescription.textContent = '';
      }
      previewContent.innerHTML = `
        <div class="demo-pdf-themes__preview-placeholder">
          <div class="demo-pdf-themes__preview-placeholder-icon">📄</div>
          <p class="demo-pdf-themes__preview-placeholder-text">Click a theme above to preview</p>
        </div>
      `;

      if (previewActions) {
        previewActions.hidden = true;
      }

      if (closeBtn) {
        closeBtn.hidden = true;
      }

      if (previewBadge) {
        previewBadge.textContent = '';
      }

      // Remove selected state
      document.querySelectorAll('.demo-pdf-theme-card').forEach(c => {
        c.classList.remove('is-selected');
      });
    }

    // Store instance for filter tabs
    themeGalleryInstance = {
      renderThemeCards: renderThemeCards,
      updatePdfPreview: updatePdfPreview,
      resetPdfPreview: resetPdfPreview
    };
  }

  // Copy Portfolio URL with Toast Notification
  function initCopyUrl() {
    const copyBtn = document.getElementById('copy-portfolio-url');
    const urlElement = document.getElementById('portfolio-url');

    if (!copyBtn || !urlElement) return;

    // Create toast notification element
    const toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: #0f172a;
      color: #ffffff;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      font-family: var(--font-sans);
      font-size: 0.9375rem;
      font-weight: 500;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.3);
      z-index: 10000;
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
    `;
    toast.textContent = 'URL copied to clipboard!';
    document.body.appendChild(toast);

    copyBtn.addEventListener('click', async () => {
      const url = urlElement.textContent;
      const fullUrl = `${window.location.origin}/portfolio/${demoSlug}`;

      try {
        await navigator.clipboard.writeText(fullUrl);
        
        // Visual feedback on button
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        copyBtn.style.color = 'rgba(201, 165, 90, 1)';
        copyBtn.style.backgroundColor = 'rgba(201, 165, 90, 0.15)';

        // Show toast
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        toast.style.pointerEvents = 'auto';

        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.style.color = '';
          copyBtn.style.backgroundColor = '';
          
          // Hide toast
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(20px)';
          setTimeout(() => {
            toast.style.pointerEvents = 'none';
          }, 300);
        }, 2000);
      } catch (err) {
        console.error('Failed to copy URL:', err);
        // Fallback: select text
        const textArea = document.createElement('textarea');
        textArea.value = fullUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        // Show toast for fallback too
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(20px)';
        }, 2000);
      }
    });
  }

  // Scroll Animations
  function initScrollAnimations() {
    const comparisonCards = document.querySelectorAll('.comparison-card');
    const themeCards = document.querySelectorAll('.demo-pdf-theme-card');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // Stagger animation
          setTimeout(() => {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }, index * 100);
        }
      });
    }, {
      threshold: 0.2,
      rootMargin: '0px 0px -100px 0px'
    });

    comparisonCards.forEach(card => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      observer.observe(card);
    });

    // Theme cards are already handled in createThemeCard with staggered animation
  }
})();
