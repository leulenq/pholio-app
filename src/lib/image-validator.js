const sharp = require('sharp');
const fs = require('fs');

/**
 * Image Validator Service
 * Validates uploaded images before expensive AI processing
 */
class ImageValidator {
  
  /**
   * Validate an image file
   * @param {string} filePath - Absolute path to the file
   * @returns {Promise<{valid: boolean, error?: string, warnings: string[]}>}
   */
  async validate(filePath) {
    const warnings = [];

    // 1. Basic File Check
    let stats;
    try {
      stats = await fs.promises.stat(filePath);
    } catch (e) {
      return { valid: false, error: 'File unreadable', warnings };
    }

    // Heuristic: Filters tiny placeholder images (often < 50KB)
    if (stats.size < 50 * 1024) { 
        // Just a warning for now, as some valid compressed JPEGs can be small
        warnings.push('File size small; ensure quality is sufficient');
    }

    // 2. Metadata Check (Dimensions)
    try {
      const metadata = await sharp(filePath).metadata();
      
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      // Min dimensions (e.g. 400x400)
      if (width < 400 || height < 400) {
        return { 
          valid: false, 
          error: `Image too small (${width}x${height}). Please upload at least 400x400px.`, 
          warnings 
        };
      }

      // Aspect Ratio (avoid extreme panoramas or thin strips)
      // Acceptable range: 1:3 (0.33) to 3:1 (3.0)
      const ratio = width / height;
      if (ratio < 0.33 || ratio > 3.0) {
        return {
          valid: false,
          error: 'Extreme aspect ratio. Please upload a standard photo orientation.',
          warnings
        };
      }

    } catch (err) {
      return { valid: false, error: 'Invalid image data', warnings };
    }

    /* 
     * 3. Face Detection (Placeholder)
     * Real implementation would use face-api.js or similar locally if feasible, 
     * or rely on the Scout AI analysis step which returns confidence scores.
     * 
     * For now, we rely on the heuristic checks above to save tokens on 
     * obviously bad files (text files, icons, tiny thumbnails).
     */

    return { valid: true, warnings };
  }
}

module.exports = new ImageValidator();
