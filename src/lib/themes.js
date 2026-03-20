/**
 * PDF Theme Definitions
 * Complete redesign with fonts, layouts, colors, and personality
 * Free themes: 3 high-quality, opinionated themes
 * Pro themes: 4+ premium themes with customization capabilities
 */

const { getFontFamilyCSS } = require('./fonts');
const { mergeLayoutWithDefaults } = require('./pdf-layouts');

/**
 * Theme definitions
 */
const themes = {
  // ─── Pholio Standard 2-page themes (used by compcard-standard.ejs) ───
  'pholio-standard': {
    key: 'pholio-standard',
    name: 'Pholio Standard',
    isPro: false,
    fonts: {
      name: 'Cormorant Garamond',
      bio: 'Inter',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'top',
      imageGrid: { cols: 2, rows: 2 },
      bioPosition: 'bottom-center',
      statsPosition: 'header-right'
    },
    colors: {
      background: '#FAFAF8',
      text: '#1C1C1C',
      accent: '#C9A96E'
    },
    personality: 'Editorial, warm, timeless',
    description: 'The Pholio Standard — warm cream background with gold accent. Always great by default.'
  },
  'classic-dark': {
    key: 'classic-dark',
    name: 'Classic Dark',
    isPro: true,
    fonts: {
      name: 'Cormorant Garamond',
      bio: 'Inter',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'top',
      imageGrid: { cols: 2, rows: 2 },
      bioPosition: 'bottom-center',
      statsPosition: 'header-right'
    },
    colors: {
      background: '#111111',
      text: '#F0EEE9',
      accent: '#C9A96E'
    },
    personality: 'Cinematic, dark, editorial',
    description: 'Jet black background with warm gold accents. Dramatic and high-fashion.'
  },
  'studio-clean': {
    key: 'studio-clean',
    name: 'Studio Clean',
    isPro: true,
    fonts: {
      name: 'Work Sans',
      bio: 'Inter',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'top',
      imageGrid: { cols: 2, rows: 2 },
      bioPosition: 'bottom-center',
      statsPosition: 'header-right'
    },
    colors: {
      background: '#FFFFFF',
      text: '#1A1A1A',
      accent: '#2563EB'
    },
    personality: 'Modern, clean, commercial',
    description: 'Pure white with cobalt blue accent. Clean and professional.'
  },
  'bold-editorial': {
    key: 'bold-editorial',
    name: 'Bold Editorial',
    isPro: true,
    fonts: {
      name: 'Bodoni Moda',
      bio: 'Inter',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'top',
      imageGrid: { cols: 2, rows: 2 },
      bioPosition: 'bottom-center',
      statsPosition: 'header-right'
    },
    colors: {
      background: '#F5F5F5',
      text: '#0A0A0A',
      accent: '#D4A017'
    },
    personality: 'Bold, high-contrast, editorial',
    description: 'Neutral off-white with antique gold. Striking and editorial.'
  },

  // ─── Legacy 1-page themes (used by compcard.ejs) ─────────────────────
  // Free Themes (3 high-quality, locked)
  'classic-serif': {
    key: 'classic-serif',
    name: 'Classic Serif',
    isPro: false,
    fonts: {
      name: 'Playfair Display',
      bio: 'Lora',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'top',
      imageGrid: { cols: 2, rows: 2 },
      bioPosition: 'bottom-center',
      statsPosition: 'header-right'
    },
    colors: {
      background: '#FAF9F7',
      text: '#2D2D2D',
      accent: '#C9A55A'
    },
    personality: 'Editorial, timeless, magazine-style',
    description: 'Elegant serif typography with warm cream background. Perfect for editorial portfolios.'
  },
  'minimalist-sans': {
    key: 'minimalist-sans',
    name: 'Minimalist Sans',
    isPro: false,
    fonts: {
      name: 'Work Sans',
      bio: 'Inter',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'top',
      imageGrid: { cols: 2, rows: 3 },
      bioPosition: 'left',
      statsPosition: 'header-right'
    },
    colors: {
      background: '#FFFFFF',
      text: '#1A1A1A',
      accent: '#2563EB'
    },
    personality: 'Modern, clean, professional',
    description: 'Clean sans-serif typography with pure white background. Perfect for modern portfolios.'
  },
  'warm-editorial': {
    key: 'warm-editorial',
    name: 'Warm Editorial',
    isPro: false,
    fonts: {
      name: 'Crimson Text',
      bio: 'Source Serif Pro',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'sidebar',
      imageGrid: { cols: 3, rows: 2 },
      bioPosition: 'bottom-full',
      statsPosition: 'sidebar-bottom'
    },
    colors: {
      background: '#F5E6D3',
      text: '#3D2817',
      accent: '#8B6F47'
    },
    personality: 'Warm, inviting, editorial',
    description: 'Warm serif typography with beige background. Perfect for inviting, editorial portfolios.'
  },
  
  // Pro Themes (4+ premium, customizable)
  'cinematic-dark': {
    key: 'cinematic-dark',
    name: 'Cinematic Dark',
    isPro: true,
    fonts: {
      name: 'Bebas Neue',
      bio: 'Montserrat',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'overlay',
      imageGrid: { cols: 1, rows: 4 },
      bioPosition: 'bottom-left',
      statsPosition: 'overlay-top-right'
    },
    colors: {
      background: '#000000',
      text: '#FFFFFF',
      accent: '#C9A55A'
    },
    personality: 'Bold, cinematic, dramatic',
    description: 'Bold display typography with deep black background. Perfect for dramatic, cinematic portfolios.'
  },
  'bold-vogue': {
    key: 'bold-vogue',
    name: 'Bold Vogue',
    isPro: true,
    fonts: {
      name: 'Bodoni Moda',
      bio: 'Libre Baskerville',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'top',
      imageGrid: { cols: 2, rows: 4 },
      bioPosition: 'bottom-center',
      statsPosition: 'header-right'
    },
    colors: {
      background: '#FFFFFF',
      text: '#000000',
      accent: '#C9A55A'
    },
    personality: 'High-fashion, bold, editorial',
    description: 'Oversized serif typography with high contrast. Perfect for high-fashion, bold portfolios.'
  },
  'studio-modern': {
    key: 'studio-modern',
    name: 'Studio Modern',
    isPro: true,
    fonts: {
      name: 'Space Grotesk',
      bio: 'DM Sans',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'top',
      imageGrid: { cols: 2, rows: 3 },
      bioPosition: 'left',
      statsPosition: 'header-right'
    },
    colors: {
      background: '#F4F2F0',
      text: '#2D2D2D',
      accent: '#64748B'
    },
    personality: 'Contemporary, architectural, clean',
    description: 'Modern sans-serif typography with neutral grays. Perfect for contemporary, architectural portfolios.'
  },
  'archive-classic': {
    key: 'archive-classic',
    name: 'Archive Classic',
    isPro: true,
    fonts: {
      name: 'Old Standard TT',
      bio: 'Lora',
      stats: 'Inter'
    },
    layout: {
      headerPosition: 'top',
      imageGrid: { cols: 2, rows: 2 },
      bioPosition: 'bottom-center',
      statsPosition: 'header-right'
    },
    colors: {
      background: '#F5E6D3',
      text: '#3D2817',
      accent: '#8B6F47'
    },
    personality: 'Nostalgic, classic, archival',
    description: 'Vintage serif typography with sepia tones. Perfect for nostalgic, archival portfolios.'
  }
};

/**
 * Get theme by key
 */
function getTheme(key) {
  return themes[key] || themes['classic-serif'];
}

/**
 * Get all themes
 */
function getAllThemes() {
  return themes;
}

/**
 * Get Free themes only
 */
function getFreeThemes() {
  return Object.values(themes).filter(theme => !theme.isPro);
}

/**
 * Get Pro themes only
 */
function getProThemes() {
  return Object.values(themes).filter(theme => theme.isPro);
}

/**
 * Check if theme is Pro-only
 */
function isProTheme(key) {
  return themes[key]?.isPro === true;
}

/**
 * Get default theme (first Free theme)
 */
function getDefaultTheme() {
  return 'classic-serif';
}

/**
 * Merge theme with customizations
 */
function mergeThemeWithCustomization(theme, customizations) {
  if (!theme) return null;
  if (!customizations) return theme;
  
  const merged = {
    ...theme,
    fonts: customizations.fonts ? {
      ...theme.fonts,
      ...customizations.fonts
    } : theme.fonts,
    colors: customizations.colors ? {
      ...theme.colors,
      ...customizations.colors
    } : theme.colors,
    layout: customizations.layout ? {
      ...theme.layout,
      ...customizations.layout
    } : theme.layout
  };
  
  return merged;
}

/**
 * Validate customization
 */
function validateCustomization(customization, theme) {
  if (!customization) return { valid: true, errors: [] };
  if (!theme) return { valid: false, errors: ['Theme not found'] };
  
  const errors = [];
  
  // Validate fonts
  if (customization.fonts) {
    const { getAllFontNames } = require('./fonts');
    const availableFonts = getAllFontNames();
    
    if (customization.fonts.name && !availableFonts.includes(customization.fonts.name)) {
      errors.push(`Invalid font name: ${customization.fonts.name}`);
    }
    if (customization.fonts.bio && !availableFonts.includes(customization.fonts.bio)) {
      errors.push(`Invalid font bio: ${customization.fonts.bio}`);
    }
    if (customization.fonts.stats && !availableFonts.includes(customization.fonts.stats)) {
      errors.push(`Invalid font stats: ${customization.fonts.stats}`);
    }
  }
  
  // Validate colors
  if (customization.colors) {
    const { validateColor } = require('./color-palettes');
    
    if (customization.colors.background && !validateColor(customization.colors.background)) {
      errors.push(`Invalid background color: ${customization.colors.background}`);
    }
    if (customization.colors.text && !validateColor(customization.colors.text)) {
      errors.push(`Invalid text color: ${customization.colors.text}`);
    }
    if (customization.colors.accent && !validateColor(customization.colors.accent)) {
      errors.push(`Invalid accent color: ${customization.colors.accent}`);
    }
  }
  
  // Validate layout
  if (customization.layout) {
    const { validateLayout } = require('./pdf-layouts');
    if (!validateLayout(customization.layout)) {
      errors.push('Invalid layout configuration');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get available fonts (from fonts.js)
 */
function getAvailableFonts() {
  const { getAllFonts } = require('./fonts');
  return getAllFonts();
}

/**
 * Get available color palettes (from color-palettes.js)
 */
function getAvailableColorPalettes() {
  const { getAllColorPalettes } = require('./color-palettes');
  return getAllColorPalettes();
}

/**
 * Get theme fonts as CSS
 */
function getThemeFontsCSS(theme) {
  if (!theme || !theme.fonts) return {};
  
  return {
    nameFont: getFontFamilyCSS(theme.fonts.name),
    bioFont: getFontFamilyCSS(theme.fonts.bio),
    statsFont: getFontFamilyCSS(theme.fonts.stats)
  };
}

/**
 * Generate Google Fonts URL for theme
 */
function generateThemeFontsUrl(theme) {
  if (!theme || !theme.fonts) return null;
  
  const { generateGoogleFontsUrl } = require('./fonts');
  const fontNames = [theme.fonts.name, theme.fonts.bio, theme.fonts.stats].filter(Boolean);
  return generateGoogleFontsUrl(fontNames);
}

module.exports = {
  themes,
  getTheme,
  getAllThemes,
  getFreeThemes,
  getProThemes,
  isProTheme,
  getDefaultTheme,
  mergeThemeWithCustomization,
  validateCustomization,
  getAvailableFonts,
  getAvailableColorPalettes,
  getThemeFontsCSS,
  generateThemeFontsUrl
};
