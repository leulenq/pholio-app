// Dashboard JavaScript for Pholio
// Handles copy-to-clipboard, delete actions, and flash message animations

(function () {
  'use strict';

  // Image loading handler - check if images are already loaded
  function initImagePlaceholders() {
    // Handle hero image
    const heroImage = document.querySelector('.dash-hero__image img');
    if (heroImage) {
      if (heroImage.complete && heroImage.naturalHeight !== 0) {
        heroImage.classList.add('is-loaded');
      }
    }

    // Handle media grid images
    const mediaImages = document.querySelectorAll('.media-card img');
    mediaImages.forEach(img => {
      if (img.complete && img.naturalHeight !== 0) {
        img.classList.add('is-loaded');
      }
    });
  }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initImagePlaceholders();
      });
    } else {
      initImagePlaceholders();
    }

  // Copy to Clipboard Handler
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-copy-target]');
    if (!btn) return;

    const targetSelector = btn.getAttribute('data-copy-target');
    const targetEl = document.querySelector(targetSelector);
    if (!targetEl) return;

    const textToCopy = targetEl.textContent.trim();

    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.style.background = 'var(--accent-success)';

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
      }, 2000);
    }).catch(err => {
      console.error('Copy failed:', err);
      alert('Failed to copy. Please select and copy manually.');
    });
  });

  // Media Card Delete Handler
  document.addEventListener('click', function (e) {
    const deleteBtn = e.target.closest('.media-card__delete');
    if (!deleteBtn) return;

    const card = deleteBtn.closest('.media-card');
    const mediaId = card?.getAttribute('data-media-id') || deleteBtn.getAttribute('data-image-id');

    if (!mediaId) {
      console.error('No media ID found');
      return;
    }

    if (!confirm('Delete this image from your portfolio?')) {
      return;
    }

    // Send DELETE request
    fetch(`/dashboard/talent/media/${mediaId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    })
      .then(res => {
        if (!res.ok) throw new Error('Delete failed');
        return res.json();
      })
      .then((data) => {
        // Animate out and remove
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => {
          card.remove();
          
          // Update image count
          const mediaGrid = document.querySelector('[data-media-grid]');
          const remainingImages = mediaGrid ? mediaGrid.querySelectorAll('.media-card').length : 0;
          updateImageCount(remainingImages);
          
          // If grid is empty, show empty state
          if (remainingImages === 0) {
            const portfolioPanel = document.querySelector('.dash-panel');
            if (portfolioPanel) {
              const panelBody = portfolioPanel.querySelector('.dash-panel__body');
              if (panelBody && !panelBody.querySelector('.empty-state')) {
                const emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                emptyState.innerHTML = '<p>No images yet. Upload your first portfolio images to get started.</p>';
                panelBody.appendChild(emptyState);
              }
            }
          }
          
          // Update hero image if this was the hero
          if (data.heroImagePath) {
            updateHeroImage(data.heroImagePath);
          } else {
            // Hero was deleted, clear hero image
            const heroImageContainer = document.querySelector('.dash-hero__image');
            if (heroImageContainer) {
              const heroImg = heroImageContainer.querySelector('img');
              if (heroImg) {
                heroImg.remove();
              }
              if (!heroImageContainer.querySelector('.dash-hero__image-placeholder')) {
                const placeholder = document.createElement('div');
                placeholder.className = 'dash-hero__image-placeholder';
                placeholder.textContent = 'Upload images to see your portfolio';
                heroImageContainer.appendChild(placeholder);
              }
            }
          }
        }, 300);
      })
      .catch(err => {
        console.error('Delete error:', err);
        alert('Failed to delete image. Please try again.');
      });
  });

  // Drag and Drop Reordering
  function initDragAndDrop() {
    const mediaGrid = document.querySelector('[data-media-grid]');
    if (!mediaGrid) return;

    let draggedElement = null;
    let draggedIndex = null;
    let dragOverElement = null;

    // Make all media cards draggable
    const mediaCards = mediaGrid.querySelectorAll('.media-card');
    mediaCards.forEach((card, index) => {
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-index', index);
    });

    // Drag start - only allow dragging from the drag handle or the card itself (not buttons)
    mediaGrid.addEventListener('dragstart', function(e) {
      // Don't allow dragging from buttons or controls
      if (e.target.closest('.media-card__delete') || 
          e.target.closest('.media-card__set-hero') ||
          e.target.closest('.media-card__controls')) {
        e.preventDefault();
        return;
      }
      
      // Only allow dragging from the card itself or the drag handle
      const card = e.target.closest('.media-card');
      if (!card) return;
      
      draggedElement = card;
      draggedIndex = Array.from(mediaGrid.children).indexOf(draggedElement);
      
      draggedElement.classList.add('dragging');
      mediaGrid.classList.add('drag-active');
      
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', draggedElement.innerHTML);
    });

    // Drag over
    mediaGrid.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const card = e.target.closest('.media-card');
      if (!card || card === draggedElement) return;

      // Remove previous drag-over class
      if (dragOverElement && dragOverElement !== card) {
        dragOverElement.classList.remove('drag-over');
      }

      // Add drag-over class to current card
      card.classList.add('drag-over');
      dragOverElement = card;
    });

    // Drag leave
    mediaGrid.addEventListener('dragleave', function(e) {
      const card = e.target.closest('.media-card');
      if (card && card !== draggedElement) {
        card.classList.remove('drag-over');
      }
    });

    // Drop
    mediaGrid.addEventListener('drop', function(e) {
      e.preventDefault();
      
      const dropTarget = e.target.closest('.media-card');
      if (!dropTarget || dropTarget === draggedElement) {
        // Clean up
        if (draggedElement) {
          draggedElement.classList.remove('dragging');
        }
        mediaGrid.classList.remove('drag-active');
        mediaCards.forEach(card => card.classList.remove('drag-over'));
        return;
      }

      const dropIndex = Array.from(mediaGrid.children).indexOf(dropTarget);
      
      // Reorder DOM elements
      if (draggedIndex < dropIndex) {
        mediaGrid.insertBefore(draggedElement, dropTarget.nextSibling);
      } else {
        mediaGrid.insertBefore(draggedElement, dropTarget);
      }

      // Clean up
      draggedElement.classList.remove('dragging');
      mediaGrid.classList.remove('drag-active');
      mediaCards.forEach(card => card.classList.remove('drag-over'));

      // Save new order
      saveMediaOrder();
    });

    // Drag end
    mediaGrid.addEventListener('dragend', function(e) {
      // Clean up
      if (draggedElement) {
        draggedElement.classList.remove('dragging');
      }
      mediaGrid.classList.remove('drag-active');
      mediaCards.forEach(card => card.classList.remove('drag-over'));
      
      draggedElement = null;
      draggedIndex = null;
      dragOverElement = null;
    });

    // Save media order function
    async function saveMediaOrder() {
      const cards = Array.from(mediaGrid.querySelectorAll('.media-card'));
      const order = cards.map(card => card.getAttribute('data-media-id'));

      if (order.length === 0) return;

      try {
        // Show saving indicator
        const savingIndicator = document.createElement('div');
        savingIndicator.className = 'media-grid__saving';
        savingIndicator.textContent = 'Saving order...';
        savingIndicator.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--accent-gold); color: #FFFFFF; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(201, 165, 90, 0.3); z-index: 10000; font-size: 14px; font-weight: 600;';
        document.body.appendChild(savingIndicator);

        // Send reorder request
        const response = await fetch('/media/reorder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'same-origin',
          body: JSON.stringify({ order })
        });

        if (!response.ok) {
          throw new Error('Failed to save order');
        }

        const data = await response.json();

        // Update sort attributes
        cards.forEach((card, index) => {
          card.setAttribute('data-sort', index + 1);
          card.setAttribute('data-index', index);
        });

        // Check if first image changed (hero image update)
        const firstCard = cards[0];
        if (firstCard) {
          const firstImageId = firstCard.getAttribute('data-media-id');
          const firstImageImg = firstCard.querySelector('img');
          if (firstImageImg) {
            // Get the image path from the data attribute or src
            const firstImagePath = firstImageImg.src;
            // Update hero image in database and UI
            await updateHeroImageFromReorder(firstImageId, firstImagePath);
          }
        }

        // Show success message
        savingIndicator.textContent = 'Order saved!';
        savingIndicator.style.background = 'var(--accent-success)';
        setTimeout(() => {
          savingIndicator.style.opacity = '0';
          savingIndicator.style.transform = 'translateY(-10px)';
          setTimeout(() => savingIndicator.remove(), 300);
        }, 1000);
      } catch (error) {
        console.error('Error saving order:', error);
        
        // Show error message
        const errorIndicator = document.createElement('div');
        errorIndicator.className = 'media-grid__error';
        errorIndicator.textContent = 'Failed to save order. Please try again.';
        errorIndicator.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--accent-error); color: #FFFFFF; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); z-index: 10000; font-size: 14px; font-weight: 600;';
        document.body.appendChild(errorIndicator);
        
        setTimeout(() => {
          errorIndicator.style.opacity = '0';
          errorIndicator.style.transform = 'translateY(-10px)';
          setTimeout(() => errorIndicator.remove(), 3000);
        }, 2000);

        // Revert order (reload page as fallback)
        // For now, just show error - user can manually reorder if needed
      }
    }

    // Helper function to update hero image from reorder
    async function updateHeroImageFromReorder(imageId, imagePath) {
      try {
        // Update hero image in database
        const response = await fetch(`/dashboard/talent/media/${imageId}/hero`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'same-origin'
        });

        if (!response.ok) {
          console.error('Failed to update hero image');
          return;
        }

        const data = await response.json();

        // Update hero image in UI
        if (data.heroImagePath) {
          updateHeroImage(data.heroImagePath);
        }
      } catch (error) {
        console.error('Error updating hero image:', error);
        // Don't show error to user - just log it
      }
    }
  }

  // Initialize drag and drop when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDragAndDrop);
  } else {
    initDragAndDrop();
  }

  // Reinitialize drag and drop after images are added
  const originalAddImagesToGrid = addImagesToGrid;
  addImagesToGrid = function(images, heroImagePath) {
    originalAddImagesToGrid(images, heroImagePath);
    // Reinitialize drag and drop for new images
    setTimeout(initDragAndDrop, 100);
  };

  // Set Hero Image Handler
  document.addEventListener('click', function (e) {
    const setHeroBtn = e.target.closest('.media-card__set-hero');
    if (!setHeroBtn) return;

    const card = setHeroBtn.closest('.media-card');
    const imageId = setHeroBtn.getAttribute('data-image-id') || card?.getAttribute('data-media-id');
    const imagePath = setHeroBtn.getAttribute('data-image-path');

    if (!imageId) {
      console.error('No image ID found');
      return;
    }

    // Show loading state
    setHeroBtn.disabled = true;
    setHeroBtn.textContent = 'Setting...';

    // Send PUT request
    fetch(`/dashboard/talent/media/${imageId}/hero`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    })
      .then(res => {
        if (!res.ok) throw new Error('Set hero failed');
        return res.json();
      })
      .then((data) => {
        // Update hero image in hero section
        if (data.heroImagePath) {
          updateHeroImage(data.heroImagePath);
        }

        // Update hero badges on all cards
        const allCards = document.querySelectorAll('.media-card');
        allCards.forEach(card => {
          const controls = card.querySelector('.media-card__controls');
          if (!controls) return;

          const existingBadge = controls.querySelector('.media-card__hero-badge');
          const existingSetHeroBtn = controls.querySelector('.media-card__set-hero');
          const cardImageId = card.getAttribute('data-media-id');

          if (cardImageId === imageId) {
            // This is the new hero - replace button with badge
            if (existingSetHeroBtn) {
              existingSetHeroBtn.remove();
            }
            if (!existingBadge) {
              const badge = document.createElement('span');
              badge.className = 'media-card__hero-badge';
              badge.title = 'Hero Image';
              badge.textContent = '★';
              const deleteBtn = controls.querySelector('.media-card__delete');
              if (deleteBtn) {
                controls.insertBefore(badge, deleteBtn);
              } else {
                controls.appendChild(badge);
              }
            }
          } else {
            // This is not the hero - replace badge with button
            if (existingBadge) {
              existingBadge.remove();
            }
            if (!existingSetHeroBtn) {
              const setHeroBtn = document.createElement('button');
              setHeroBtn.className = 'media-card__set-hero';
              setHeroBtn.type = 'button';
              setHeroBtn.title = 'Set as Hero Image';
              setHeroBtn.textContent = 'Set Hero';
              setHeroBtn.setAttribute('data-image-id', cardImageId);
              const img = card.querySelector('img');
              if (img) {
                setHeroBtn.setAttribute('data-image-path', img.src);
              }
              const deleteBtn = controls.querySelector('.media-card__delete');
              if (deleteBtn) {
                controls.insertBefore(setHeroBtn, deleteBtn);
              } else {
                controls.appendChild(setHeroBtn);
              }
            }
          }
        });

        // Show success message
        showSuccessMessage('Hero image updated successfully');
      })
      .catch(err => {
        console.error('Set hero error:', err);
        alert('Failed to set hero image. Please try again.');
        setHeroBtn.disabled = false;
        setHeroBtn.textContent = 'Set Hero';
      });
  });

  // Flash Message Auto-dismiss
  const flashMessages = document.querySelectorAll('.flash-message');
  flashMessages.forEach(msg => {
    setTimeout(() => {
      msg.style.opacity = '0';
      msg.style.transform = 'translateY(-10px)';
      setTimeout(() => msg.remove(), 300);
    }, 5000);
  });

  // Form Validation Enhancement with Real-time Validation & Error Scrolling
  const forms = document.querySelectorAll('form.form-stacked');
  forms.forEach(form => {
    // Real-time validation on blur
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('blur', function() {
        validateField(input);
      });
    });

    form.addEventListener('submit', function (e) {
      // Validate all fields before submit
      let hasErrors = false;
      const firstErrorField = [];

      inputs.forEach(input => {
        if (!validateField(input)) {
          hasErrors = true;
          if (firstErrorField.length === 0) {
            firstErrorField.push(input);
          }
        }
      });

      // Scroll to first error if validation fails
      if (hasErrors && firstErrorField[0]) {
        e.preventDefault();
        firstErrorField[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstErrorField[0].focus();
        return false;
      }

      // Add loading state to submit button
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = 'Saving...';

        // Re-enable after 3s as fallback
        setTimeout(() => {
          if (submitBtn.disabled) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.originalText;
          }
        }, 3000);
      }
    });
  });

  // Field validation helper
  function validateField(field) {
    const formField = field.closest('.form-field');
    if (!formField) return true;

    // Remove existing error state
    formField.classList.remove('has-error');
    const existingError = formField.querySelector('.form-field__error');
    if (existingError) {
      existingError.remove();
    }

    // Basic validation
    let isValid = true;
    const value = field.value.trim();

    // Required field check
    if (field.hasAttribute('required') && !value) {
      isValid = false;
      showFieldError(field, 'This field is required');
    }

    // Email validation
    if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      isValid = false;
      showFieldError(field, 'Please enter a valid email address');
    }

    // Phone validation (basic)
    if (field.type === 'tel' && value && !/^[\d\s\-\+\(\)]+$/.test(value)) {
      isValid = false;
      showFieldError(field, 'Please enter a valid phone number');
    }

    // URL validation
    if (field.type === 'url' && value && !/^https?:\/\/.+/.test(value)) {
      isValid = false;
      showFieldError(field, 'Please enter a valid URL starting with http:// or https://');
    }

    // Update ARIA attributes
    field.setAttribute('aria-invalid', !isValid);
    if (!isValid) {
      const errorId = field.id + '-error';
      field.setAttribute('aria-describedby', errorId);
    } else {
      field.removeAttribute('aria-describedby');
    }

    return isValid;
  }

  // Show field error
  function showFieldError(field, message) {
    const formField = field.closest('.form-field');
    if (!formField) return;

    formField.classList.add('has-error');
    field.setAttribute('aria-invalid', 'true');

    const errorId = field.id + '-error';
    const errorEl = document.createElement('p');
    errorEl.className = 'form-field__error';
    errorEl.id = errorId;
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = message;
    field.setAttribute('aria-describedby', errorId);

    // Insert after the field
    field.parentNode.insertBefore(errorEl, field.nextSibling);
  }

  // Agency Talent Claim Handler
  document.addEventListener('submit', function (e) {
    const claimForm = e.target.closest('.talent-claim-form');
    if (!claimForm) return;

    e.preventDefault();

    const submitBtn = claimForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    // Loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Claiming...';

    // Get form data
    const formData = new FormData(claimForm);

    // Submit via fetch
    fetch(claimForm.action, {
      method: 'POST',
      body: formData
    })
      .then(res => {
        if (!res.ok) throw new Error('Claim failed');
        return res.json();
      })
      .then(data => {
        // Success feedback
        submitBtn.textContent = '✓ Claimed';
        submitBtn.style.background = 'var(--accent-success)';

        // Update badge if exists
        const card = claimForm.closest('.talent-card');
        const badgesContainer = card?.querySelector('.talent-card__badges');
        if (badgesContainer) {
          const existingBadge = badgesContainer.querySelector('.badge-success, .badge-muted');
          if (!existingBadge) {
            const badge = document.createElement('span');
            badge.className = 'badge badge-success';
            badge.textContent = 'Your Talent';
            badgesContainer.appendChild(badge);
          }
        }

        // Reset after delay
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Refresh Claim';
          submitBtn.style.background = '';
        }, 2000);
      })
      .catch(err => {
        console.error('Claim error:', err);
        submitBtn.textContent = 'Failed - Try Again';
        submitBtn.style.background = 'var(--accent-error)';

        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          submitBtn.style.background = '';
        }, 2000);
      });
  });

  // File Upload Preview Handler
  const fileInput = document.getElementById('media');
  const filePreview = document.getElementById('file-preview');
  const uploadForm = document.getElementById('media-upload-form');
  const uploadButton = document.getElementById('upload-button');

  if (fileInput && filePreview && uploadForm) {
    const selectedFiles = [];

    fileInput.addEventListener('change', function(e) {
      const files = Array.from(e.target.files);
      selectedFiles.length = 0;
      selectedFiles.push(...files);

      // Clear preview
      filePreview.innerHTML = '';

      // Show preview for each file
      files.forEach((file, index) => {
        if (!file.type.startsWith('image/')) {
          return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
          const previewItem = document.createElement('div');
          previewItem.className = 'file-upload-preview-item';
          previewItem.dataset.index = index;

          const img = document.createElement('img');
          img.src = e.target.result;
          img.alt = file.name;

          const removeBtn = document.createElement('button');
          removeBtn.className = 'file-upload-preview-item__remove';
          removeBtn.type = 'button';
          removeBtn.innerHTML = '×';
          removeBtn.title = 'Remove';
          removeBtn.addEventListener('click', function() {
            selectedFiles.splice(index, 1);
            updateFileInput();
            previewItem.remove();
          });

          previewItem.appendChild(img);
          previewItem.appendChild(removeBtn);
          filePreview.appendChild(previewItem);
        };
        reader.readAsDataURL(file);
      });
    });

    function updateFileInput() {
      const dataTransfer = new DataTransfer();
      selectedFiles.forEach(file => dataTransfer.items.add(file));
      fileInput.files = dataTransfer.files;
    }

    // Drag and drop support
    const uploadLabel = document.querySelector('.file-upload-label');
    if (uploadLabel) {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadLabel.addEventListener(eventName, preventDefaults, false);
      });

      function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
      }

      ['dragenter', 'dragover'].forEach(eventName => {
        uploadLabel.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          uploadLabel.classList.add('drag-over');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        uploadLabel.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          uploadLabel.classList.remove('drag-over');
        }, false);
      });

      uploadLabel.addEventListener('drop', function(e) {
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        if (files.length > 0) {
          selectedFiles.push(...files);
          updateFileInput();
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, false);
    }

    // Form submission handler - Use AJAX instead of form submission
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();

      if (selectedFiles.length === 0) {
        alert('Please select at least one image to upload.');
        return;
      }

      // Validate file sizes and types before upload
      const maxSize = 10 * 1024 * 1024; // 10MB
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const invalidFiles = selectedFiles.filter(file => {
        return !allowedTypes.includes(file.type) || file.size > maxSize;
      });

      if (invalidFiles.length > 0) {
        alert(`Invalid files detected. Please ensure all files are JPEG, PNG, or WebP and under 10MB.`);
        return;
      }

      // Show loading state
      if (uploadButton) {
        uploadButton.disabled = true;
        uploadButton.textContent = 'Uploading...';
        uploadButton.style.opacity = '0.6';
        uploadButton.style.cursor = 'not-allowed';
      }

      // Create FormData for upload
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('media', file);
      });

      try {
        // Upload images via AJAX
        const response = await fetch('/dashboard/talent/media', {
          method: 'POST',
          body: formData,
          credentials: 'same-origin'
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Upload failed');
        }

        // Success - add images to grid dynamically
        if (data.images && data.images.length > 0) {
          addImagesToGrid(data.images, data.heroImagePath);
          updateImageCount(data.totalImages);
          updateHeroImage(data.heroImagePath);
          showSuccessMessage(data.message);
        }

        // Clear file input and preview
        selectedFiles.length = 0;
        fileInput.value = '';
        filePreview.innerHTML = '';

        // Reset button
        if (uploadButton) {
          uploadButton.disabled = false;
          uploadButton.textContent = 'Upload Images';
          uploadButton.style.opacity = '1';
          uploadButton.style.cursor = 'pointer';
        }
      } catch (error) {
        console.error('Upload error:', error);
        alert(error.message || 'Failed to upload images. Please try again.');

        // Reset button
        if (uploadButton) {
          uploadButton.disabled = false;
          uploadButton.textContent = 'Upload Images';
          uploadButton.style.opacity = '1';
          uploadButton.style.cursor = 'pointer';
        }
      }
    });
  }

  // Helper function to add images to grid dynamically
  function addImagesToGrid(images, heroImagePath) {
    // Try to find existing media grid first
    let mediaGrid = document.querySelector('[data-media-grid]') || document.getElementById('media-grid');
    
    // If grid doesn't exist, create it
    if (!mediaGrid) {
      // Find the portfolio imagery panel body specifically (use ID or data-section)
      const portfolioPanel = document.getElementById('portfolio-imagery') || 
                            document.querySelector('[data-section="portfolio-imagery"]') ||
                            document.querySelector('.dash-panel[id="portfolio-imagery"]');
      
      if (portfolioPanel) {
        const panelBody = portfolioPanel.querySelector('.dash-panel__body');
        if (panelBody) {
          // Remove empty state if it exists
          const emptyState = panelBody.querySelector('.empty-state');
          if (emptyState) {
            emptyState.remove();
          }
          
          // Create new grid
          mediaGrid = document.createElement('div');
          mediaGrid.className = 'media-grid';
          mediaGrid.setAttribute('data-media-grid', '');
          mediaGrid.id = 'media-grid';
          panelBody.appendChild(mediaGrid);
        } else {
          console.error('Portfolio panel body not found in', portfolioPanel);
          return;
        }
      } else {
        console.error('Portfolio panel not found. Looking for #portfolio-imagery or [data-section="portfolio-imagery"]');
        return;
      }
    } else {
      // Remove empty state if it exists (it might be a sibling)
      const emptyState = mediaGrid.parentElement?.querySelector('.empty-state');
      if (emptyState) {
        emptyState.remove();
      }
    }

    // Add each image to grid
    images.forEach(image => {
      const mediaCard = createMediaCard(image, heroImagePath);
      mediaGrid.appendChild(mediaCard);
    });

    // Animate new images in (only the ones we just added)
    const allCards = Array.from(mediaGrid.querySelectorAll('.media-card'));
    const newCards = allCards.slice(-images.length);
    newCards.forEach((card, index) => {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      setTimeout(() => {
        card.style.transition = 'all 0.3s ease-out';
        card.style.opacity = '1';
        card.style.transform = 'scale(1)';
      }, index * 50);
    });
  }

  // Helper function to normalize image path (matches template logic)
  function normalizeImagePath(imagePath) {
    if (!imagePath) return '';
    // Preserve external URLs
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    // Remove any ../ sequences and normalize
    let normalized = imagePath.replace(/\.\.\//g, '').replace(/\\/g, '/');
    // Ensure it starts with /
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    // If path contains /uploads/ but starts with /../, fix it
    if (normalized.includes('/uploads/')) {
      const uploadsIndex = normalized.indexOf('/uploads/');
      normalized = normalized.substring(uploadsIndex);
    }
    // If it doesn't start with /uploads/ and is a relative path, assume it's in uploads
    if (!normalized.startsWith('/uploads/') && !normalized.startsWith('http')) {
      // Extract filename if path contains one
      const parts = normalized.split('/');
      const filename = parts[parts.length - 1];
      if (filename && filename.includes('.')) {
        normalized = '/uploads/' + filename;
      }
    }
    return normalized;
  }

  // Helper function to create media card element
  function createMediaCard(image, heroImagePath) {
    const card = document.createElement('article');
    card.className = 'media-card';
    card.setAttribute('data-media-id', image.id);
    card.setAttribute('draggable', 'true');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Drag to reorder image');
    if (image.sort) {
      card.setAttribute('data-sort', image.sort);
    }

    // Normalize image path using same logic as template
    const imagePath = normalizeImagePath(image.path);

    // Check if this is the hero image (compare normalized paths)
    const normalizedHeroPath = heroImagePath ? normalizeImagePath(heroImagePath) : null;
    const normalizedImagePath = normalizeImagePath(image.path);
    const isHero = normalizedHeroPath && normalizedImagePath === normalizedHeroPath;

    card.innerHTML = `
      <div class="media-card__drag-handle" title="Drag to reorder">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="7" cy="5" r="1.5" fill="currentColor" opacity="0.4"/>
          <circle cx="13" cy="5" r="1.5" fill="currentColor" opacity="0.4"/>
          <circle cx="7" cy="10" r="1.5" fill="currentColor" opacity="0.4"/>
          <circle cx="13" cy="10" r="1.5" fill="currentColor" opacity="0.4"/>
          <circle cx="7" cy="15" r="1.5" fill="currentColor" opacity="0.4"/>
          <circle cx="13" cy="15" r="1.5" fill="currentColor" opacity="0.4"/>
        </svg>
      </div>
      <div class="media-card__image-placeholder">
        <div class="media-card__placeholder-shimmer"></div>
      </div>
      <img src="${imagePath}" 
           alt="${image.label || 'Portfolio image'}" 
           loading="lazy"
           onload="this.classList.add('is-loaded')"
           onerror="this.classList.add('is-loaded')">
      <div class="media-card__controls">
        ${isHero 
          ? '<span class="media-card__hero-badge" title="Hero Image">★</span>' 
          : `<button class="media-card__set-hero" type="button" title="Set as Hero Image" data-image-id="${image.id}" data-image-path="${imagePath}">Set Hero</button>`
        }
        <button class="media-card__delete" type="button" title="Delete image" data-image-id="${image.id}">&times;</button>
      </div>
    `;

    return card;
  }

  // Helper function to update image count in header
  function updateImageCount(totalImages) {
    // Update image count in hero stats section
    const heroImageCount = document.getElementById('hero-image-count');
    if (heroImageCount) {
      heroImageCount.textContent = totalImages;
    }

    // Update image count in sidebar stats
    const sidebarImageCount = document.getElementById('sidebar-image-count');
    if (sidebarImageCount) {
      sidebarImageCount.textContent = totalImages;
    }

    // Also update any other image count displays
    const heroStats = document.querySelectorAll('.dash-hero__stat');
    heroStats.forEach(stat => {
      const label = stat.querySelector('.dash-hero__stat-label');
      if (label && label.textContent.trim() === 'Images') {
        const value = stat.querySelector('.dash-hero__stat-value');
        if (value) {
          value.textContent = totalImages;
        }
      }
    });

    // Update image count in profile status panel (if it exists)
    const profileStatusChips = document.querySelectorAll('.completion-chips .chip');
    profileStatusChips.forEach(chip => {
      if (chip.textContent.includes('2+ Images') || chip.textContent.includes('Images')) {
        // Update chip text to show current count
        const chipText = chip.textContent.trim();
        if (chipText.includes('Images')) {
          chip.textContent = totalImages >= 2 ? `${totalImages} Images` : '2+ Images';
          if (totalImages >= 2) {
            chip.classList.add('is-complete');
          } else {
            chip.classList.remove('is-complete');
          }
        }
      }
    });
  }

  // Helper function to update hero image
  function updateHeroImage(heroImagePath) {
    if (!heroImagePath) return;

    // Normalize hero image path
    const normalizedHeroPath = normalizeImagePath(heroImagePath);

    // Update hero image in hero section
    const heroImageContainer = document.querySelector('.dash-hero__image');
    if (heroImageContainer) {
      // Remove placeholder if it exists
      const placeholder = heroImageContainer.querySelector('.dash-hero__image-placeholder');
      if (placeholder) {
        placeholder.remove();
      }

      // Get or create hero image element
      let heroImage = heroImageContainer.querySelector('img');
      if (!heroImage) {
        heroImage = document.createElement('img');
        heroImage.alt = 'Profile hero image';
        heroImage.onload = function() {
          this.classList.add('is-loaded');
        };
        heroImage.onerror = function() {
          this.classList.add('is-loaded');
        };
        heroImageContainer.appendChild(heroImage);
      }

      // Update image source
      heroImage.src = normalizedHeroPath;
      
      // Add loading placeholder if image hasn't loaded yet
      if (!heroImage.complete) {
        const placeholderDiv = document.createElement('div');
        placeholderDiv.className = 'dash-hero__image-placeholder';
        placeholderDiv.innerHTML = '<div class="dash-hero__placeholder-shimmer"></div>';
        if (!heroImageContainer.querySelector('.dash-hero__image-placeholder')) {
          heroImageContainer.insertBefore(placeholderDiv, heroImage);
        }
      }
    }

    // Update hero badges on media cards
    const mediaCards = document.querySelectorAll('.media-card');
    const normalizedHeroPathForComparison = normalizedHeroPath;
    
    mediaCards.forEach(card => {
      const img = card.querySelector('img');
      if (!img) return;

      const cardImagePath = normalizeImagePath(img.getAttribute('src') || img.src);
      const isHero = cardImagePath === normalizedHeroPathForComparison;
      const controls = card.querySelector('.media-card__controls');
      
      if (!controls) return;

      const existingBadge = controls.querySelector('.media-card__hero-badge');
      
      if (isHero && !existingBadge) {
        // Add hero badge
        const badge = document.createElement('span');
        badge.className = 'media-card__hero-badge';
        badge.title = 'Hero Image';
        badge.textContent = '★';
        const deleteBtn = controls.querySelector('.media-card__delete');
        if (deleteBtn) {
          controls.insertBefore(badge, deleteBtn);
        } else {
          controls.appendChild(badge);
        }
      } else if (!isHero && existingBadge) {
        // Remove hero badge
        existingBadge.remove();
      }
    });
  }

  // Helper function to show success message
  function showSuccessMessage(message) {
    // Create flash message element
    const flashMessages = document.querySelector('.flash-messages') || document.createElement('div');
    if (!flashMessages.classList.contains('flash-messages')) {
      flashMessages.className = 'flash-messages';
      document.body.insertBefore(flashMessages, document.body.firstChild);
    }

    const flashMessage = document.createElement('div');
    flashMessage.className = 'flash-message flash-message--success';
    flashMessage.innerHTML = `
      <span>${message}</span>
      <button class="flash-message__close" type="button" onclick="this.parentElement.remove()">&times;</button>
    `;

    flashMessages.appendChild(flashMessage);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      flashMessage.style.opacity = '0';
      flashMessage.style.transform = 'translateY(-10px)';
      setTimeout(() => flashMessage.remove(), 300);
    }, 5000);
  }

  // PDF Theme Selector Modal
  function initPdfThemeModal() {
    const pdfBtn = document.getElementById('pdf-download-btn');
    const sidebarPdfBtn = document.getElementById('sidebar-pdf-download-btn');
    const modal = document.getElementById('pdf-theme-modal');
    const backdrop = modal?.querySelector('.pdf-theme-modal__backdrop');
    const closeBtn = modal?.querySelector('.pdf-theme-modal__close');
    const cancelBtn = document.getElementById('pdf-theme-cancel');
    const applyBtn = document.getElementById('pdf-theme-apply');
    const downloadBtn = document.getElementById('pdf-theme-download');
    const customizeBtn = document.getElementById('pdf-theme-customize');
    const themeGrid = document.getElementById('pdf-theme-grid');
    const themePreview = document.getElementById('pdf-theme-preview');
    const previewIframe = document.getElementById('pdf-theme-preview-iframe');
    const themeTabs = document.querySelectorAll('.pdf-theme-modal__tab');
    
    if (!modal) {
      console.warn('[PDF Modal] PDF theme modal not found');
      return;
    }
    
    // Get button data - use sidebar button if available, fallback to main button
    const activePdfBtn = sidebarPdfBtn || pdfBtn;
    if (!activePdfBtn) {
      console.warn('[PDF Modal] PDF download button not found');
      return;
    }

    // Get theme data from window or button data attributes
    const themeData = window.PDF_THEME_DATA || {};
    const allThemes = themeData.allThemes || {};
    const freeThemes = themeData.freeThemes || [];
    const proThemes = themeData.proThemes || [];
    const slug = themeData.profileSlug || activePdfBtn.dataset.slug;
    const savedTheme = themeData.currentTheme || activePdfBtn.dataset.theme || 'classic-serif';
    const isPro = themeData.isPro === true || activePdfBtn.dataset.isPro === 'true';
    const baseUrl = themeData.baseUrl || '';
    
    let selectedTheme = savedTheme;
    let currentFilter = 'all';
    let previewTimeout = null;

    // Populate theme grid
    function renderThemes(filter = 'all') {
      if (!themeGrid) return;
      themeGrid.innerHTML = '';
      
      const themesToRender = filter === 'free' ? freeThemes : filter === 'pro' ? proThemes : Object.values(allThemes);
      
      themesToRender.forEach((theme) => {
        const isLocked = theme.isPro && !isPro;
        const isSelected = theme.key === selectedTheme;
        
        const themeCard = document.createElement('button');
        themeCard.type = 'button';
        themeCard.className = `pdf-theme-card ${isSelected ? 'is-selected' : ''} ${isLocked ? 'is-locked' : ''} ${theme.isPro ? 'is-pro' : ''}`;
        themeCard.dataset.theme = theme.key;
        if (isLocked) {
          themeCard.disabled = true;
        }
        
        themeCard.innerHTML = `
          <div class="pdf-theme-card__preview" style="background: ${theme.colors.background}; color: ${theme.colors.text};">
            <div class="pdf-theme-card__preview-name" style="font-family: ${theme.fonts.name || 'serif'}, serif;">
              ${theme.name}
          </div>
            <div class="pdf-theme-card__preview-colors">
              <div class="pdf-theme-card__swatch" style="background: ${theme.colors.background};"></div>
              <div class="pdf-theme-card__swatch" style="background: ${theme.colors.text};"></div>
              <div class="pdf-theme-card__swatch" style="background: ${theme.colors.accent};"></div>
            </div>
          </div>
          <div class="pdf-theme-card__info">
          <div class="pdf-theme-card__name">
            ${theme.name}
              ${theme.isPro ? '<span class="pdf-theme-card__badge pdf-theme-card__badge--pro">Studio+</span>' : '<span class="pdf-theme-card__badge pdf-theme-card__badge--free">Free</span>'}
            </div>
            <div class="pdf-theme-card__description">${theme.personality || theme.description || ''}</div>
          </div>
        `;
        
        if (!isLocked) {
          themeCard.addEventListener('click', () => {
            document.querySelectorAll('.pdf-theme-card').forEach(card => card.classList.remove('is-selected'));
            themeCard.classList.add('is-selected');
            selectedTheme = theme.key;
            updatePreview();
            updateButtons();
          });
          
          // Live preview on hover
          themeCard.addEventListener('mouseenter', () => {
            if (previewTimeout) clearTimeout(previewTimeout);
            previewTimeout = setTimeout(() => {
              showPreview(theme.key);
            }, 300);
          });
          
          themeCard.addEventListener('mouseleave', () => {
            if (previewTimeout) clearTimeout(previewTimeout);
            // Don't hide preview if this is the selected theme
            if (theme.key !== selectedTheme) {
              hidePreview();
            }
          });
        } else {
          // Show upgrade prompt for locked themes
          themeCard.addEventListener('click', () => {
            const upgradeMsg = 'This theme is available for Studio+ members. Upgrade to unlock all themes and customization options.';
            if (confirm(upgradeMsg)) {
              window.location.href = '/pro/upgrade';
            }
          });
        }
        
        themeGrid.appendChild(themeCard);
      });
      
      // Show preview for selected theme
      if (selectedTheme) {
        showPreview(selectedTheme);
      }
    }

    // Show preview
    function showPreview(themeKey) {
      if (!themePreview || !previewIframe) return;
      
      const previewUrl = `${baseUrl}/pdf/view/${slug}?theme=${themeKey}&_=${Date.now()}`;
      previewIframe.src = previewUrl;
      themePreview.style.display = 'block';
    }

    // Hide preview
    function hidePreview() {
      if (!themePreview) return;
      themePreview.style.display = 'none';
    }

    // Update preview
    function updatePreview() {
      if (selectedTheme) {
        showPreview(selectedTheme);
      }
    }

    // Update buttons
    function updateButtons() {
      if (downloadBtn) {
        // Use relative URL if baseUrl is empty
        const downloadUrl = baseUrl 
          ? `${baseUrl}/pdf/${slug}?theme=${selectedTheme}&download=1`
          : `/pdf/${slug}?theme=${selectedTheme}&download=1`;
        downloadBtn.href = downloadUrl;
      }
      
      if (applyBtn) {
        applyBtn.style.display = selectedTheme !== savedTheme ? 'inline-block' : 'none';
      }
      
      if (customizeBtn && isPro) {
        customizeBtn.style.display = 'inline-block';
        const customizerUrl = baseUrl 
          ? `${baseUrl}/dashboard/pdf-customizer?theme=${selectedTheme}`
          : `/dashboard/pdf-customizer?theme=${selectedTheme}`;
        customizeBtn.href = customizerUrl;
      }
    }

    // Filter themes
    function initThemeFilter() {
      themeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const filter = tab.getAttribute('data-theme-filter');
          currentFilter = filter;
          
          // Update active tab
          themeTabs.forEach(t => t.classList.remove('pdf-theme-modal__tab--active'));
          tab.classList.add('pdf-theme-modal__tab--active');
          
          // Re-render themes
          renderThemes(filter);
        });
      });
    }

    // Apply theme
    async function applyTheme() {
      if (!applyBtn) return;
      
      try {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Applying...';
        
        const response = await fetch(`/api/pdf/customize/${slug}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            theme: selectedTheme
          })
        });
        
        const result = await response.json();
        
        if (result.ok) {
          // Update saved theme
          pdfBtn.dataset.theme = selectedTheme;
          applyBtn.style.display = 'none';
          
          // Reload page to show updated theme
          window.location.reload();
        } else {
          alert('Error applying theme: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error applying theme:', error);
        alert('Error applying theme');
      } finally {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply Theme';
      }
    }

    function openModal() {
      if (!modal) {
        console.error('[PDF Modal] Modal element not found');
        return;
      }
      selectedTheme = savedTheme;
      currentFilter = 'all';
      renderThemes('all');
      updateButtons();
      modal.hidden = false;
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      if (!modal) return;
      modal.hidden = true;
      modal.style.display = 'none';
      document.body.style.overflow = '';
      hidePreview();
    }

    // Event listeners
    // Handle both main and sidebar PDF download buttons
    if (pdfBtn) {
    pdfBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
    }
    
    if (sidebarPdfBtn) {
      sidebarPdfBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal();
      });
    }

    if (backdrop) backdrop.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    if (applyBtn) {
      applyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        applyTheme();
      });
    }
    
    if (downloadBtn) {
      downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Show loading state
        const originalText = downloadBtn.textContent;
        downloadBtn.textContent = 'Generating PDF...';
        downloadBtn.style.pointerEvents = 'none';
        
        // Trigger download
        window.location.href = downloadBtn.href;
        
        // Reset after a delay
        setTimeout(() => {
          downloadBtn.textContent = originalText;
          downloadBtn.style.pointerEvents = '';
          closeModal();
        }, 2000);
      });
    }
    
    // Initialize theme filter
    initThemeFilter();
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) {
        closeModal();
      }
    });

    updateButtons();
  }

  // Initialize PDF modal when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPdfThemeModal);
  } else {
    // DOM is already ready
    initPdfThemeModal();
  }
})();

// Load Analytics
async function loadAnalytics() {
  // Find analytics section in main content area
  const analyticsSection = document.getElementById('analytics');
  if (!analyticsSection) {
    // If no main analytics section, just load sidebar analytics
    return loadSidebarAnalytics();
  }
  
  // Also load sidebar analytics if it exists
  loadSidebarAnalytics();

  const loadingEl = analyticsSection.querySelector('.analytics-loading');
  const contentEl = analyticsSection.querySelector('.analytics-content');
  const errorEl = analyticsSection.querySelector('.analytics-error');

  try {
    const response = await fetch('/dashboard/talent/analytics', {
      credentials: 'same-origin'
    });

    if (!response.ok) {
      // If it's a 404, show empty analytics (shouldn't happen now but handle gracefully)
      if (response.status === 404) {
        // Return empty analytics data
        const emptyData = {
          success: true,
          analytics: {
            views: { total: 0, thisWeek: 0, thisMonth: 0 },
            downloads: { total: 0, thisWeek: 0, thisMonth: 0, byTheme: [] }
          }
        };
        // Use empty data and continue to display it
        const data = emptyData;
        // Update UI with zeros
        const viewsTotal = document.getElementById('analytics-views-total');
        const viewsWeek = document.getElementById('analytics-views-week');
        const downloadsTotal = document.getElementById('analytics-downloads-total');
        const downloadsWeek = document.getElementById('analytics-downloads-week');
        const monthlyTotal = document.getElementById('analytics-monthly-total');
        const monthlyBreakdown = document.getElementById('analytics-monthly-breakdown');
        const themesList = document.getElementById('analytics-themes-list');
        
        if (viewsTotal) viewsTotal.textContent = '0';
        if (viewsWeek) viewsWeek.textContent = 'This week: 0';
        if (downloadsTotal) downloadsTotal.textContent = '0';
        if (downloadsWeek) downloadsWeek.textContent = 'This week: 0';
        if (monthlyTotal) monthlyTotal.textContent = '0';
        if (monthlyBreakdown) monthlyBreakdown.textContent = '0 views, 0 downloads';
        if (themesList) {
          themesList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">No theme data yet. Create your profile and download your first PDF to see theme statistics.</div>';
        }
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
        return;
      }
      throw new Error('Failed to load analytics');
    }

    const data = await response.json();

    if (data.success && data.analytics) {
      // Update views
      const viewsTotal = document.getElementById('analytics-views-total');
      const viewsWeek = document.getElementById('analytics-views-week');
      if (viewsTotal) {
        viewsTotal.textContent = (data.analytics.views?.total || 0).toLocaleString();
      }
      if (viewsWeek) {
        viewsWeek.textContent = `This week: ${data.analytics.views?.thisWeek || 0}`;
      }

      // Update downloads
      const downloadsTotal = document.getElementById('analytics-downloads-total');
      const downloadsWeek = document.getElementById('analytics-downloads-week');
      if (downloadsTotal) {
        downloadsTotal.textContent = (data.analytics.downloads?.total || 0).toLocaleString();
      }
      if (downloadsWeek) {
        downloadsWeek.textContent = `This week: ${data.analytics.downloads?.thisWeek || 0}`;
      }

      // Update monthly stats
      const monthlyTotal = document.getElementById('analytics-monthly-total');
      const monthlyBreakdown = document.getElementById('analytics-monthly-breakdown');
      if (monthlyTotal) {
        const monthlyViews = data.analytics.views?.thisMonth || 0;
        const monthlyDownloads = data.analytics.downloads?.thisMonth || 0;
        monthlyTotal.textContent = (monthlyViews + monthlyDownloads).toLocaleString();
      }
      if (monthlyBreakdown) {
        const monthlyViews = data.analytics.views?.thisMonth || 0;
        const monthlyDownloads = data.analytics.downloads?.thisMonth || 0;
        monthlyBreakdown.textContent = `${monthlyViews} views, ${monthlyDownloads} downloads`;
      }

      // Update theme breakdown
      const themesList = document.getElementById('analytics-themes-list');
      if (themesList && data.analytics.downloads?.byTheme) {
        const themes = data.analytics.downloads.byTheme;
        // byTheme is an array of objects: [{ theme: 'classic-serif', count: 5 }, ...]
        if (Array.isArray(themes) && themes.length > 0) {
          themesList.innerHTML = themes
            .sort((a, b) => (b.count || 0) - (a.count || 0)) // Sort by count descending
            .map(item => {
              const theme = item.theme || 'unknown';
              const count = item.count || 0;
              return `
                <div class="analytics-theme-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; margin-bottom: 8px; background: var(--bg-surface-elevated); border-radius: 8px; border: 1px solid var(--border-color);">
                  <span style="font-size: 14px; font-weight: 500; color: var(--text-primary); text-transform: capitalize;">${theme.replace(/-/g, ' ')}</span>
                  <span style="font-size: 16px; font-weight: 600; color: var(--accent-gold);">${count}</span>
                </div>
              `;
            }).join('');
        } else {
          themesList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">No theme data yet. Download your first PDF to see theme statistics.</div>';
        }
      } else if (themesList) {
        themesList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">No theme data yet. Download your first PDF to see theme statistics.</div>';
      }

      // Show content
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
    } else {
      throw new Error('Invalid analytics data');
    }
  } catch (error) {
    console.error('Error loading analytics:', error);
    // Don't show error if it's just missing profile - show empty state instead
    if (loadingEl) loadingEl.style.display = 'none';
    
    // If it's a 404 or profile not found, show empty state
    if (error.message && (error.message.includes('404') || error.message.includes('Profile not found'))) {
      // Show empty analytics with zeros
      const viewsTotal = document.getElementById('analytics-views-total');
      const viewsWeek = document.getElementById('analytics-views-week');
      const downloadsTotal = document.getElementById('analytics-downloads-total');
      const downloadsWeek = document.getElementById('analytics-downloads-week');
      const monthlyTotal = document.getElementById('analytics-monthly-total');
      const monthlyBreakdown = document.getElementById('analytics-monthly-breakdown');
      const themesList = document.getElementById('analytics-themes-list');
      
      if (viewsTotal) viewsTotal.textContent = '0';
      if (viewsWeek) viewsWeek.textContent = 'This week: 0';
      if (downloadsTotal) downloadsTotal.textContent = '0';
      if (downloadsWeek) downloadsWeek.textContent = 'This week: 0';
      if (monthlyTotal) monthlyTotal.textContent = '0';
      if (monthlyBreakdown) monthlyBreakdown.textContent = '0 views, 0 downloads';
      if (themesList) {
        themesList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">No theme data yet. Create your profile and download your first PDF to see theme statistics.</div>';
      }
      
      if (contentEl) contentEl.style.display = 'block';
      if (errorEl) errorEl.style.display = 'none';
    } else {
      // Real error - show error message
      if (contentEl) contentEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'block';
    }
  }
}

// Load sidebar analytics (separate from main analytics)
async function loadSidebarAnalytics() {
  const sidebarAnalytics = document.getElementById('analytics-sidebar');
  if (!sidebarAnalytics) return;

  const loadingEl = sidebarAnalytics.querySelector('.analytics-loading');
  const contentEl = sidebarAnalytics.querySelector('.analytics-content');
  const errorEl = sidebarAnalytics.querySelector('.analytics-error');

  try {
    const response = await fetch('/api/analytics/talent', {
      credentials: 'same-origin'
    });
    
    if (!response.ok) {
      // If it's a 404, the backend should return empty analytics now, but handle it gracefully
      if (response.status === 404) {
        // Return empty analytics data
        const emptyData = {
          success: true,
          analytics: {
            views: { total: 0, thisWeek: 0, thisMonth: 0 },
            downloads: { total: 0, thisWeek: 0, thisMonth: 0, byTheme: [] }
          }
        };
        // Use empty data directly and continue to display it
        const data = emptyData;
        // Show empty analytics
        const viewsTotal = document.getElementById('analytics-sidebar-views-total');
        const viewsWeek = document.getElementById('analytics-sidebar-views-week');
        const downloadsTotal = document.getElementById('analytics-sidebar-downloads-total');
        const downloadsWeek = document.getElementById('analytics-sidebar-downloads-week');
        
        if (viewsTotal) viewsTotal.textContent = '0';
        if (viewsWeek) viewsWeek.textContent = '0 this week';
        if (downloadsTotal) downloadsTotal.textContent = '0';
        if (downloadsWeek) downloadsWeek.textContent = '0 this week';
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
        return;
      }
      throw new Error('Failed to load analytics');
    }

    const data = await response.json();

    if (data.success && data.analytics) {
      // Update views (sidebar version)
      const viewsTotal = document.getElementById('analytics-sidebar-views-total');
      const viewsWeek = document.getElementById('analytics-sidebar-views-week');
      if (viewsTotal) {
        viewsTotal.textContent = (data.analytics.views?.total || 0).toLocaleString();
      }
      if (viewsWeek) {
        viewsWeek.textContent = `${data.analytics.views?.thisWeek || 0} this week`;
      }

      // Update downloads (sidebar version)
      const downloadsTotal = document.getElementById('analytics-sidebar-downloads-total');
      const downloadsWeek = document.getElementById('analytics-sidebar-downloads-week');
      if (downloadsTotal) {
        downloadsTotal.textContent = (data.analytics.downloads?.total || 0).toLocaleString();
      }
      if (downloadsWeek) {
        downloadsWeek.textContent = `${data.analytics.downloads?.thisWeek || 0} this week`;
      }

      // Show content
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
    } else {
      throw new Error('Invalid analytics data');
    }
  } catch (error) {
    console.error('Error loading sidebar analytics:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    
    // If it's a 404 or profile not found, show empty state
    if (error.message && (error.message.includes('404') || error.message.includes('Profile not found'))) {
      // Show empty analytics with zeros
      const viewsTotal = document.getElementById('analytics-sidebar-views-total');
      const viewsWeek = document.getElementById('analytics-sidebar-views-week');
      const downloadsTotal = document.getElementById('analytics-sidebar-downloads-total');
      const downloadsWeek = document.getElementById('analytics-sidebar-downloads-week');
      
      if (viewsTotal) viewsTotal.textContent = '0';
      if (viewsWeek) viewsWeek.textContent = '0 this week';
      if (downloadsTotal) downloadsTotal.textContent = '0';
      if (downloadsWeek) downloadsWeek.textContent = '0 this week';
      
      if (contentEl) contentEl.style.display = 'block';
      if (errorEl) errorEl.style.display = 'none';
    } else {
      // Real error - show error message
      if (contentEl) contentEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'block';
    }
  }
}

// Load Activity Feed
async function loadActivityFeed() {
  const activityPanel = document.getElementById('activity-panel');
  if (!activityPanel) return;

  const loadingEl = activityPanel.querySelector('.activity-loading');
  const feedEl = activityPanel.querySelector('.activity-feed');
  const emptyEl = activityPanel.querySelector('.activity-empty');
  const errorEl = activityPanel.querySelector('.activity-error');

  try {
    const response = await fetch('/api/activity/talent', {
      credentials: 'same-origin'
    });

    if (!response.ok) {
      throw new Error('Failed to load activity feed');
    }

    const data = await response.json();

    if (data.success && data.activities) {
      if (data.activities.length === 0) {
        // Show empty state
        if (loadingEl) loadingEl.style.display = 'none';
        if (feedEl) feedEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
      } else {
        // Render activities
        if (feedEl) {
          feedEl.innerHTML = data.activities.map(activity => `
            <div class="activity-item">
              <span class="activity-item__icon">${activity.icon || '📝'}</span>
              <div class="activity-item__content">
                <div class="activity-item__message">${activity.message || 'Activity recorded'}</div>
                <div class="activity-item__time">${activity.timeAgo || 'Recently'}</div>
              </div>
            </div>
          `).join('');
        }

        // Show feed
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        if (feedEl) feedEl.style.display = 'flex';
      }
    } else {
      throw new Error('Invalid activity data');
    }
  } catch (error) {
    console.error('Error loading activity feed:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (feedEl) feedEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
  }
}

// User Dropdown Toggle
function initUserDropdown() {
  const userMenuButton = document.getElementById('user-menu-button');
  const userMenu = document.getElementById('user-menu');
  const userDropdown = userMenuButton?.closest('.dash-header__user-dropdown');
  
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
  
  // Close dropdown on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && userDropdown.getAttribute('aria-expanded') === 'true') {
      userDropdown.setAttribute('aria-expanded', 'false');
      userMenuButton.setAttribute('aria-expanded', 'false');
    }
  });
}

// Load analytics and activity feed when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    loadAnalytics();
    loadActivityFeed();
    initSectionNavigation();
    initUserDropdown();
  });
} else {
  loadAnalytics();
  loadActivityFeed();
  initSectionNavigation();
  initUserDropdown();
}

// Section Navigation with Active State Tracking
function initSectionNavigation() {
  const nav = document.getElementById('dash-nav');
  if (!nav) return;

  const navLinks = nav.querySelectorAll('.dash-nav__link');
  const sections = document.querySelectorAll('[data-section]');

  if (navLinks.length === 0 || sections.length === 0) return;

  // Handle click on nav links
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetSection = this.getAttribute('data-section');
      
      // Find section in main content area (prefer main content over sidebar)
      let targetElement = null;
      const mainContent = document.querySelector('.dash-grid__column:not(.dash-sidebar)');
      if (mainContent) {
        targetElement = mainContent.querySelector(`[data-section="${targetSection}"]`);
      }
      
      // Fallback to any section if not found in main content
      if (!targetElement) {
        targetElement = document.querySelector(`[data-section="${targetSection}"]`);
      }
      
      if (targetElement) {
        // Update active state
        navLinks.forEach(l => l.classList.remove('dash-nav__link--active'));
        this.classList.add('dash-nav__link--active');
        
        // Calculate offset (account for sticky header + nav)
        // Header is sticky at top: 0, Nav is sticky at top: 80px
        // We need to scroll past both
        const header = document.querySelector('.dash-header');
        const nav = document.getElementById('dash-nav');
        const headerHeight = header ? header.offsetHeight : 80;
        const navHeight = nav ? nav.offsetHeight : 60;
        const offset = headerHeight + navHeight + 40; // Extra padding for visual spacing
        
        // Get element position
        const elementTop = targetElement.getBoundingClientRect().top + window.pageYOffset;
        const offsetTop = elementTop - offset;
        
        // Smooth scroll to section
        window.scrollTo({
          top: Math.max(0, offsetTop),
          behavior: 'smooth'
        });
        
        // Update URL without reloading
        history.pushState(null, null, `#${targetSection}`);
      } else {
        console.warn(`Section not found: ${targetSection}`);
      }
    });
  });

  // Track scroll position to update active nav item
  let ticking = false;
  
  function updateActiveNav() {
    // Only check sections in main content area (not sidebar)
    const mainContent = document.querySelector('.dash-grid__column:not(.dash-sidebar)');
    const mainSections = mainContent ? mainContent.querySelectorAll('[data-section]') : sections;
    
    // Calculate scroll position with proper offsets
    const header = document.querySelector('.dash-header');
    const nav = document.getElementById('dash-nav');
    const headerHeight = header ? header.offsetHeight : 80;
    const navHeight = nav ? nav.offsetHeight : 60;
    const scrollPosition = window.pageYOffset + headerHeight + navHeight + 100; // Offset for nav + header + padding
    
    let currentSection = null;
    
    // Find the section currently in view (prioritize main content sections)
    mainSections.forEach(section => {
      const sectionTop = section.getBoundingClientRect().top + window.pageYOffset;
      const sectionBottom = sectionTop + section.offsetHeight;
      const sectionMiddle = sectionTop + (section.offsetHeight / 2);
      
      // Check if scroll position is within section bounds
      if (scrollPosition >= sectionTop - 100 && scrollPosition <= sectionBottom) {
        // If multiple sections match, prefer the one whose middle is closest to scroll position
        if (!currentSection || Math.abs(sectionMiddle - scrollPosition) < Math.abs(
          document.querySelector(`[data-section="${currentSection}"]`)?.getBoundingClientRect().top + window.pageYOffset - scrollPosition || Infinity
        )) {
          currentSection = section.getAttribute('data-section');
        }
      }
    });
    
    // If no section is in view, check which one is closest to top
    if (!currentSection && mainSections.length > 0) {
      let closestSection = null;
      let closestDistance = Infinity;
      
      mainSections.forEach(section => {
        const sectionTop = section.getBoundingClientRect().top + window.pageYOffset;
        const distance = Math.abs(sectionTop - scrollPosition);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestSection = section.getAttribute('data-section');
        }
      });
      
      currentSection = closestSection;
    }
    
    // Update active nav link
    if (currentSection) {
      navLinks.forEach(link => {
        if (link.getAttribute('data-section') === currentSection) {
          link.classList.add('dash-nav__link--active');
        } else {
          link.classList.remove('dash-nav__link--active');
        }
      });
    }
    
    ticking = false;
  }
  
  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateActiveNav);
      ticking = true;
    }
  }
  
  // Listen to scroll events
  window.addEventListener('scroll', onScroll, { passive: true });
  
  // Check initial scroll position
  updateActiveNav();
  
  // Handle hash in URL on page load
  function handleHashNavigation() {
    if (window.location.hash) {
      const hash = window.location.hash.substring(1);
      const targetLink = nav.querySelector(`[data-section="${hash}"]`);
      if (targetLink) {
        // Small delay to ensure DOM is ready and all sections are rendered
        setTimeout(() => {
          // Find section in main content area
          const mainContent = document.querySelector('.dash-grid__column:not(.dash-sidebar)');
          let targetElement = null;
          if (mainContent) {
            targetElement = mainContent.querySelector(`[data-section="${hash}"]`);
          }
          if (!targetElement) {
            targetElement = document.querySelector(`[data-section="${hash}"]`);
          }
          
          if (targetElement) {
            // Update active state
            navLinks.forEach(l => l.classList.remove('dash-nav__link--active'));
            targetLink.classList.add('dash-nav__link--active');
            
            // Calculate offset
            const header = document.querySelector('.dash-header');
            const nav = document.getElementById('dash-nav');
            const headerHeight = header ? header.offsetHeight : 80;
            const navHeight = nav ? nav.offsetHeight : 60;
            const offset = headerHeight + navHeight + 40;
            const elementTop = targetElement.getBoundingClientRect().top + window.pageYOffset;
            const offsetTop = elementTop - offset;
            
            // Smooth scroll to section
            window.scrollTo({
              top: Math.max(0, offsetTop),
              behavior: 'smooth'
            });
          }
        }, 500);
      }
    } else {
      // No hash - ensure overview is active on initial load
      const overviewLink = nav.querySelector('[data-section="overview"]');
      if (overviewLink && !document.querySelector('.dash-nav__link--active')) {
        overviewLink.classList.add('dash-nav__link--active');
      }
    }
  }
  
  // Handle initial hash on page load (with delay to ensure DOM is ready)
  setTimeout(handleHashNavigation, 300);
  
  // Also handle popstate (back/forward browser buttons)
  window.addEventListener('popstate', function(e) {
    handleHashNavigation();
  });
}