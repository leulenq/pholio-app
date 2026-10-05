export const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

export const rise = {
  hidden: { opacity: 0, y: 18 },
  shown: { opacity: 1, y: 0, transition: SPRING },
};
