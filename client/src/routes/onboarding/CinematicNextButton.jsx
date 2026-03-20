import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export const CinematicNextButton = ({ onClick, children, icon: Icon = ChevronRight, disabled }) => (
  <motion.button
    onClick={onClick}
    disabled={disabled}
    whileHover={disabled ? {} : { scale: 1.03 }}
    whileTap={disabled ? {} : { scale: 0.97 }}
    className="
      group relative mx-auto py-4 px-2
      flex items-center gap-3
      text-white/50 font-serif italic tracking-[0.15em] text-xl
      transition-colors duration-300
      hover:text-[#C9A55A]
      disabled:opacity-30 disabled:cursor-not-allowed
    "
  >
     <span>{children}</span>
     <Icon size={20} strokeWidth={1.5} className="opacity-50 group-hover:opacity-100 transition-opacity" />
  </motion.button>
);

export const CinematicBackButton = ({ onClick, children = 'BACK' }) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.03 }}
    whileTap={{ scale: 0.97 }}
    className="
      group mx-auto py-3 px-2
      flex items-center gap-2
      text-white/20 font-sans text-[10px] uppercase tracking-[0.2em]
      transition-colors duration-300
      hover:text-white/60
    "
  >
    <ChevronLeft size={12} strokeWidth={1.5} className="opacity-50 group-hover:opacity-100 transition-opacity" />
    <span>{children}</span>
  </motion.button>
);
