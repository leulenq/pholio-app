/**
 * Curated Google Fonts for PDF Comp Cards
 * Organized by category: serif, sans-serif, display, monospace
 * Total: 25 premium fonts
 */

const fonts = {
  serif: [
    {
      name: 'Playfair Display',
      weights: [400, 600, 700],
      description: 'Elegant serif, perfect for editorial names',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap'
    },
    {
      name: 'Lora',
      weights: [400, 500, 600],
      description: 'Well-balanced serif, great for bios',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&display=swap'
    },
    {
      name: 'Crimson Text',
      weights: [400, 600],
      description: 'Classic serif with warm character',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600&display=swap'
    },
    {
      name: 'Old Standard TT',
      weights: [400, 700],
      description: 'Vintage serif, archival feel',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Old+Standard+TT:wght@400;700&display=swap'
    },
    {
      name: 'Bodoni Moda',
      weights: [400, 600, 700],
      description: 'High-fashion serif, bold and dramatic',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@400;600;700&display=swap'
    },
    {
      name: 'Libre Baskerville',
      weights: [400, 700],
      description: 'Classic serif, timeless and readable',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap'
    }
  ],
  sansSerif: [
    {
      name: 'Inter',
      weights: [400, 500, 600],
      description: 'Modern sans-serif, clean and professional',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
    },
    {
      name: 'Work Sans',
      weights: [400, 500, 600],
      description: 'Versatile sans-serif, modern and clean',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600&display=swap'
    },
    {
      name: 'Montserrat',
      weights: [400, 500, 600, 700],
      description: 'Geometric sans-serif, contemporary',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap'
    },
    {
      name: 'Space Grotesk',
      weights: [400, 500, 600, 700],
      description: 'Modern sans-serif, architectural feel',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap'
    },
    {
      name: 'DM Sans',
      weights: [400, 500, 600, 700],
      description: 'Neutral sans-serif, versatile',
      googleUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap'
    },
    {
      name: 'Source Sans Pro',
      weights: [400, 600, 700],
      description: 'Readable sans-serif, professional',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@400;600;700&display=swap'
    },
    {
      name: 'Poppins',
      weights: [400, 500, 600, 700],
      description: 'Geometric sans-serif, friendly',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'
    },
    {
      name: 'Manrope',
      weights: [400, 500, 600, 700],
      description: 'Open sans-serif, modern',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap'
    },
    {
      name: 'Nunito Sans',
      weights: [400, 600, 700],
      description: 'Rounded sans-serif, approachable',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&display=swap'
    },
    {
      name: 'Open Sans',
      weights: [400, 600, 700],
      description: 'Humanist sans-serif, readable',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap'
    }
  ],
  display: [
    {
      name: 'Bebas Neue',
      weights: [400],
      description: 'Condensed display font, bold and cinematic',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap'
    },
    {
      name: 'Oswald',
      weights: [400, 500, 600, 700],
      description: 'Condensed sans-serif, impactful',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap'
    },
    {
      name: 'Righteous',
      weights: [400],
      description: 'Decorative display font, retro style',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Righteous&display=swap'
    },
    {
      name: 'Bungee',
      weights: [400],
      description: 'Bold display font, urban feel',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Bungee&display=swap'
    }
  ],
  monospace: [
    {
      name: 'Space Mono',
      weights: [400, 700],
      description: 'Modern monospace, technical',
      googleUrl: 'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap'
    },
    {
      name: 'IBM Plex Mono',
      weights: [400, 600],
      description: 'Corporate monospace, clean',
      googleUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap'
    }
  ]
};

/**
 * Get all fonts
 */
function getAllFonts() {
  return fonts;
}

/**
 * Get fonts by category
 */
function getFontsByCategory(category) {
  return fonts[category] || [];
}

/**
 * Get font by name
 */
function getFontByName(name) {
  for (const category of Object.values(fonts)) {
    const font = category.find(f => f.name === name);
    if (font) return font;
  }
  return null;
}

/**
 * Get all font names as a flat array
 */
function getAllFontNames() {
  const names = [];
  for (const category of Object.values(fonts)) {
    for (const font of category) {
      names.push(font.name);
    }
  }
  return names;
}

/**
 * Generate Google Fonts URL for multiple fonts
 */
function generateGoogleFontsUrl(fontNames) {
  if (!fontNames || fontNames.length === 0) return null;
  
  const fontFamilies = [];
  const seen = new Set();
  
  for (const name of fontNames) {
    if (!name || seen.has(name)) continue;
    const font = getFontByName(name);
    if (font && font.googleUrl) {
      // Extract font family name and weights from Google URL
      try {
        const urlParts = font.googleUrl.split('?');
        if (urlParts.length > 1) {
          const urlParams = new URLSearchParams(urlParts[1]);
          const family = urlParams.get('family');
          if (family) {
            fontFamilies.push(family);
            seen.add(name);
          }
        }
      } catch (error) {
        console.error(`Error parsing font URL for ${name}:`, error);
      }
    }
  }
  
  if (fontFamilies.length === 0) return null;
  
  return `https://fonts.googleapis.com/css2?${fontFamilies.map(f => `family=${encodeURIComponent(f)}`).join('&')}&display=swap`;
}

/**
 * Get font CSS property value (for use in CSS)
 */
function getFontFamilyCSS(fontName) {
  if (!fontName) return 'Inter, sans-serif';
  const font = getFontByName(fontName);
  if (!font) return 'Inter, sans-serif'; // Default fallback
  
  // Determine if serif or sans-serif based on category
  const isSerif = fonts.serif.some(f => f.name === fontName);
  const fontFamily = isSerif ? 'serif' : 'sans-serif';
  
  return `"${font.name}", ${fontFamily}`;
}

module.exports = {
  fonts,
  getAllFonts,
  getFontsByCategory,
  getFontByName,
  getAllFontNames,
  generateGoogleFontsUrl,
  getFontFamilyCSS
};

