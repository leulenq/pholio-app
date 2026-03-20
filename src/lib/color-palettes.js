/**
 * Curated Color Palettes for PDF Comp Cards
 * Organized by style: editorial, modern, bold, neutral, warm, cool
 * Each palette contains: background, text, accent colors
 */

const colorPalettes = {
  editorial: [
    {
      name: 'Warm Cream',
      background: '#FAF9F7',
      text: '#2D2D2D',
      accent: '#C9A55A',
      description: 'Classic editorial, warm and inviting'
    },
    {
      name: 'Ivory',
      background: '#FFFEF9',
      text: '#1A1A1A',
      accent: '#8B7355',
      description: 'Elegant ivory, timeless'
    },
    {
      name: 'Soft Beige',
      background: '#F5E6D3',
      text: '#3D2817',
      accent: '#8B6F47',
      description: 'Warm beige, editorial warmth'
    }
  ],
  modern: [
    {
      name: 'Pure White',
      background: '#FFFFFF',
      text: '#1A1A1A',
      accent: '#2563EB',
      description: 'Clean white, modern and minimal'
    },
    {
      name: 'Light Gray',
      background: '#F4F2F0',
      text: '#2D2D2D',
      accent: '#64748B',
      description: 'Neutral gray, professional'
    },
    {
      name: 'Cool White',
      background: '#F8F9FA',
      text: '#212529',
      accent: '#495057',
      description: 'Cool white, contemporary'
    }
  ],
  bold: [
    {
      name: 'Deep Black',
      background: '#000000',
      text: '#FFFFFF',
      accent: '#C9A55A',
      description: 'Bold black, dramatic contrast'
    },
    {
      name: 'Charcoal',
      background: '#1A1A1A',
      text: '#ECF0F1',
      accent: '#F59E0B',
      description: 'Rich charcoal, high contrast'
    },
    {
      name: 'Dark Slate',
      background: '#2C3E50',
      text: '#ECF0F1',
      accent: '#3498DB',
      description: 'Dark slate, professional bold'
    }
  ],
  neutral: [
    {
      name: 'Warm Gray',
      background: '#F5F5F5',
      text: '#333333',
      accent: '#666666',
      description: 'Neutral gray, versatile'
    },
    {
      name: 'Cool Gray',
      background: '#E8E8E8',
      text: '#2C2C2C',
      accent: '#808080',
      description: 'Cool gray, minimalist'
    },
    {
      name: 'Stone',
      background: '#EDEDED',
      text: '#3A3A3A',
      accent: '#7A7A7A',
      description: 'Stone gray, balanced'
    }
  ],
  warm: [
    {
      name: 'Vintage Paper',
      background: '#F5E6D3',
      text: '#3D2817',
      accent: '#8B6F47',
      description: 'Vintage paper, nostalgic'
    },
    {
      name: 'Cream',
      background: '#FFF8E7',
      text: '#4A3728',
      accent: '#B8860B',
      description: 'Warm cream, cozy'
    },
    {
      name: 'Sepia',
      background: '#F4E4BC',
      text: '#5D4037',
      accent: '#8D6E63',
      description: 'Sepia tones, archival'
    }
  ],
  cool: [
    {
      name: 'Arctic White',
      background: '#FAFBFC',
      text: '#1E293B',
      accent: '#0EA5E9',
      description: 'Cool white, fresh'
    },
    {
      name: 'Silver',
      background: '#F1F5F9',
      text: '#334155',
      accent: '#64748B',
      description: 'Silver gray, cool and modern'
    },
    {
      name: 'Ice Blue',
      background: '#F0F9FF',
      text: '#1E40AF',
      accent: '#3B82F6',
      description: 'Ice blue, crisp'
    }
  ]
};

/**
 * Get all color palettes
 */
function getAllColorPalettes() {
  return colorPalettes;
}

/**
 * Get palettes by category
 */
function getPalettesByCategory(category) {
  return colorPalettes[category] || [];
}

/**
 * Get palette by name (searches all categories)
 */
function getPaletteByName(name) {
  for (const category of Object.values(colorPalettes)) {
    const palette = category.find(p => p.name === name);
    if (palette) return palette;
  }
  return null;
}

/**
 * Get all palette categories
 */
function getPaletteCategories() {
  return Object.keys(colorPalettes);
}

/**
 * Get default palette (first editorial palette)
 */
function getDefaultPalette() {
  return colorPalettes.editorial[0];
}

/**
 * Validate color values (hex format)
 */
function validateColor(color) {
  if (!color) return false;
  const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexPattern.test(color);
}

/**
 * Generate CSS variables from color palette
 */
function generateColorVariables(palette) {
  return {
    '--bg-color': palette.background,
    '--text-color': palette.text,
    '--accent-color': palette.accent
  };
}

/**
 * Get contrast color (white or black) for text on background
 */
function getContrastColor(backgroundColor) {
  if (!backgroundColor) return '#000000';
  
  // Remove # if present
  const hex = backgroundColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black or white based on luminance
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

module.exports = {
  colorPalettes,
  getAllColorPalettes,
  getPalettesByCategory,
  getPaletteByName,
  getPaletteCategories,
  getDefaultPalette,
  validateColor,
  generateColorVariables,
  getContrastColor
};

