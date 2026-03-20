/**
 * Animation Variants for Cinematic Casting Flow
 * Shared motion configurations for consistent transitions
 */

// Premium Page Transitions - "The Seamless Slide"
export const fadeVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { 
    opacity: 1,
    x: 0,
    transition: { 
      duration: 0.4, 
      ease: [0.16, 1, 0.3, 1] // Ultra-smooth ease-out
    }
  },
  exit: { 
    opacity: 0,
    x: -20,
    transition: { 
      duration: 0.4, 
      ease: [0.16, 1, 0.3, 1]
    }
  }
};

export const slideUpVariants = {
  initial: { opacity: 0, y: 40 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' }
  },
  exit: { 
    opacity: 0, 
    y: -40,
    transition: { duration: 0.4, ease: 'easeIn' }
  }
};

export const scaleVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.5, ease: 'easeOut' }
  },
  exit: { 
    opacity: 0, 
    scale: 1.05,
    transition: { duration: 0.3, ease: 'easeIn' }
  }
};

export const scanningVariants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.3 }
  },
  exit: { 
    opacity: 0, 
    scale: 0.8,
    transition: { duration: 0.2 }
  }
};

// Stagger children animation
export const containerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  },
  exit: { opacity: 0 }
};

// Card Entrance - "The Gentle Rise"
export const childVariants = {
  initial: { opacity: 0, y: 15 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.5,
      delay: 0.2,
      ease: [0.16, 1, 0.3, 1]
    }
  }
};
