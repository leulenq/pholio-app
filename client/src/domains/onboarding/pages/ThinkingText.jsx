import React from 'react';
import { motion } from 'framer-motion';

export const ThinkingText = ({ text, className, style, delay = 0 }) => {
  // Parse italic markers for static display
  const renderText = () => {
    const parts = text.split('*');
    return parts.map((part, index) => {
      const isItalic = index % 2 === 1; // Odd indices are between asterisks
      return (
        <span
          key={index}
          style={{ fontStyle: isItalic ? 'italic' : 'normal' }}
          className={isItalic ? 'cinematic-question-shimmer' : ''}
        >
          {part}
        </span>
      );
    });
  };

  return (
    <motion.h1
      className={className}
      style={{ paddingBottom: '0.2em', ...style }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.8, 
        delay,
        ease: [0.16, 1, 0.3, 1] 
      }}
    >
      {renderText()}
    </motion.h1>
  );
};
