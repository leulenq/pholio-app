/**
 * PDF Layout Engine
 * Handles layout presets and generates CSS classes/styles based on layout config
 */

/**
 * Layout presets
 */
const layoutPresets = {
  'top-header': {
    headerPosition: 'top',
    imageGrid: { cols: 2, rows: 2 },
    bioPosition: 'bottom-center',
    statsPosition: 'header-right',
    description: 'Traditional top header layout'
  },
  'sidebar-header': {
    headerPosition: 'sidebar',
    imageGrid: { cols: 3, rows: 2 },
    bioPosition: 'bottom-full',
    statsPosition: 'sidebar-bottom',
    description: 'Sidebar header with full-width bio'
  },
  'overlay-stats': {
    headerPosition: 'overlay',
    imageGrid: { cols: 1, rows: 4 },
    bioPosition: 'bottom-left',
    statsPosition: 'overlay-top-right',
    description: 'Full-bleed hero with overlay stats'
  },
  'minimal': {
    headerPosition: 'top',
    imageGrid: { cols: 2, rows: 3 },
    bioPosition: 'left',
    statsPosition: 'header-right',
    description: 'Minimal layout with left-aligned bio'
  },
  'editorial': {
    headerPosition: 'top',
    imageGrid: { cols: 2, rows: 2 },
    bioPosition: 'bottom-center',
    statsPosition: 'header-right',
    description: 'Editorial layout, centered bio'
  },
  'cinematic': {
    headerPosition: 'overlay',
    imageGrid: { cols: 1, rows: 4 },
    bioPosition: 'bottom-left',
    statsPosition: 'overlay-top-right',
    description: 'Cinematic layout, dramatic'
  },
  'vintage': {
    headerPosition: 'top',
    imageGrid: { cols: 2, rows: 2 },
    bioPosition: 'bottom-center',
    statsPosition: 'header-right',
    description: 'Vintage-inspired layout'
  }
};

/**
 * Header position options
 */
const headerPositions = ['top', 'sidebar', 'overlay'];

/**
 * Bio position options
 */
const bioPositions = ['bottom-center', 'bottom-left', 'bottom-right', 'bottom-full', 'left', 'right', 'top'];

/**
 * Stats position options
 */
const statsPositions = ['header-right', 'header-left', 'header-bottom', 'sidebar-bottom', 'overlay-top-right', 'overlay-top-left', 'overlay-bottom-right', 'overlay-bottom-left'];

/**
 * Image grid options
 */
const imageGridOptions = [
  { cols: 1, rows: 4, name: 'Vertical (1x4)' },
  { cols: 2, rows: 2, name: 'Grid (2x2)' },
  { cols: 2, rows: 3, name: 'Grid (2x3)' },
  { cols: 2, rows: 4, name: 'Grid (2x4)' },
  { cols: 3, rows: 2, name: 'Grid (3x2)' },
  { cols: 4, rows: 1, name: 'Horizontal (4x1)' }
];

/**
 * Get layout preset by name
 */
function getLayoutPreset(name) {
  return layoutPresets[name] || layoutPresets['top-header'];
}

/**
 * Get all layout presets
 */
function getAllLayoutPresets() {
  return layoutPresets;
}

/**
 * Validate layout configuration
 */
function validateLayout(layout) {
  if (!layout) return false;
  
  // Validate header position
  if (layout.headerPosition && !headerPositions.includes(layout.headerPosition)) {
    return false;
  }
  
  // Validate bio position
  if (layout.bioPosition && !bioPositions.includes(layout.bioPosition)) {
    return false;
  }
  
  // Validate stats position
  if (layout.statsPosition && !statsPositions.includes(layout.statsPosition)) {
    return false;
  }
  
  // Validate image grid
  if (layout.imageGrid) {
    if (typeof layout.imageGrid.cols !== 'number' || typeof layout.imageGrid.rows !== 'number') {
      return false;
    }
    if (layout.imageGrid.cols < 1 || layout.imageGrid.cols > 4) {
      return false;
    }
    if (layout.imageGrid.rows < 1 || layout.imageGrid.rows > 4) {
      return false;
    }
  }
  
  return true;
}

/**
 * Generate CSS classes for layout
 */
function generateLayoutClasses(layout) {
  if (!layout) return '';
  
  const classes = [];
  
  // Header position
  if (layout.headerPosition) {
    classes.push(`layout-header-${layout.headerPosition}`);
  }
  
  // Bio position - convert to valid CSS class name
  if (layout.bioPosition) {
    const bioClass = layout.bioPosition.replace(/-/g, '_');
    classes.push(`layout-bio-${bioClass}`);
  }
  
  // Stats position - convert to valid CSS class name
  if (layout.statsPosition) {
    const statsClass = layout.statsPosition.replace(/-/g, '_');
    classes.push(`layout-stats-${statsClass}`);
  }
  
  // Image grid
  if (layout.imageGrid) {
    classes.push(`layout-grid-${layout.imageGrid.cols}x${layout.imageGrid.rows}`);
  }
  
  return classes.join(' ');
}

/**
 * Generate CSS styles for layout
 */
function generateLayoutStyles(layout) {
  if (!layout) return '';
  
  const styles = [];
  
  // Image grid styles
  if (layout.imageGrid) {
    styles.push(`--grid-cols: ${layout.imageGrid.cols};`);
    styles.push(`--grid-rows: ${layout.imageGrid.rows};`);
  }
  
  return styles.join(' ');
}

/**
 * Get CSS for image grid
 */
function getImageGridCSS(layout) {
  if (!layout || !layout.imageGrid) {
    return {
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)'
    };
  }
  
  return {
    gridTemplateColumns: `repeat(${layout.imageGrid.cols}, 1fr)`,
    gridTemplateRows: `repeat(${layout.imageGrid.rows}, 1fr)`
  };
}

/**
 * Merge layout config with defaults
 */
function mergeLayoutWithDefaults(layout, defaults) {
  const merged = {
    headerPosition: layout?.headerPosition || defaults?.headerPosition || 'top',
    imageGrid: {
      cols: layout?.imageGrid?.cols || defaults?.imageGrid?.cols || 2,
      rows: layout?.imageGrid?.rows || defaults?.imageGrid?.rows || 2
    },
    bioPosition: layout?.bioPosition || defaults?.bioPosition || 'bottom-center',
    statsPosition: layout?.statsPosition || defaults?.statsPosition || 'header-right'
  };
  
  return merged;
}

/**
 * Get available header positions
 */
function getHeaderPositions() {
  return headerPositions;
}

/**
 * Get available bio positions
 */
function getBioPositions() {
  return bioPositions;
}

/**
 * Get available stats positions
 */
function getStatsPositions() {
  return statsPositions;
}

/**
 * Get available image grid options
 */
function getImageGridOptions() {
  return imageGridOptions;
}

module.exports = {
  layoutPresets,
  getLayoutPreset,
  getAllLayoutPresets,
  validateLayout,
  generateLayoutClasses,
  generateLayoutStyles,
  getImageGridCSS,
  mergeLayoutWithDefaults,
  getHeaderPositions,
  getBioPositions,
  getStatsPositions,
  getImageGridOptions
};

