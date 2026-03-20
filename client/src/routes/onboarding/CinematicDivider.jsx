import React from 'react';
import { motion } from 'framer-motion';
import './CastingCinematic.css';

export function CinematicDivider({ delay = 0, className = '', style = {} }) {
  return (
    <motion.div 
      className={`cinematic-divider-container ${className}`}
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: delay, duration: 0.8 }}
    >
      <motion.div 
        className="cinematic-divider-glow"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ delay: delay, duration: 1.2, ease: "easeOut" }}
      />
    </motion.div>
  );
}
