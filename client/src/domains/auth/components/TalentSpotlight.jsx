import React from 'react';
import { motion } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1];

export default function TalentSpotlight() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 56px',
        background: '#0A0908',
      }}
    >
      {/* Editorial photo */}
      <img
        src="https://images.unsplash.com/photo-1697395156382-28715ad30ca9?q=80&w=1400&auto=format&fit=crop"
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          filter: 'saturate(0.82) contrast(1.04) brightness(0.92)',
        }}
      />

      {/* Tonal wash for legibility */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(105deg, rgba(10,9,8,0.74) 0%, rgba(10,9,8,0.30) 48%, rgba(10,9,8,0.55) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to top, rgba(10,9,8,0.88) 0%, rgba(10,9,8,0.10) 40%, transparent 70%)',
        }}
      />
      {/* Soft gold light streak */}
      <div
        style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: '90%',
          height: '140%',
          background:
            'linear-gradient(135deg, rgba(201,165,90,0.07) 0%, transparent 55%)',
          transform: 'rotate(-14deg)',
          pointerEvents: 'none',
        }}
      />

      {/* Logo */}
      <motion.a
        href="/"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        style={{
          position: 'relative',
          zIndex: 10,
          fontFamily: "var(--ag-font-serif, 'Playfair Display', serif)",
          fontWeight: 400,
          letterSpacing: '0.32em',
          color: '#C9A55A',
          fontSize: '15px',
          textTransform: 'uppercase',
          textDecoration: 'none',
          alignSelf: 'flex-start',
        }}
      >
        Pholio
      </motion.a>

      {/* Headline */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
        }}
        style={{
          position: 'relative',
          zIndex: 10,
          margin: '0 0 5vh',
          maxWidth: '14ch',
        }}
      >
        {/* Eyebrow */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 14 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginBottom: '26px',
          }}
        >
          <span
            style={{
              width: '40px',
              height: '1px',
              background: 'rgba(201,165,90,0.7)',
            }}
          />
          <span
            style={{
              fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: '#D8BE86',
            }}
          >
            The Talent Platform
          </span>
        </motion.div>

        {/* Display headline — mixed roman / italic accent */}
        <motion.h1
          variants={{
            hidden: { opacity: 0, y: 22 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.95, ease: EASE } },
          }}
          style={{
            margin: 0,
            fontFamily:
              "var(--font-display, 'Noto Serif Display'), 'Playfair Display', Georgia, serif",
            fontWeight: 500,
            fontSize: 'clamp(3.25rem, 6vw, 6rem)',
            lineHeight: 0.98,
            letterSpacing: '-0.035em',
            color: '#FBF8F3',
            textShadow: '0 2px 40px rgba(0,0,0,0.45)',
          }}
        >
          Where careers
          <br />
          are{' '}
          <span
            style={{
              fontStyle: 'italic',
              fontWeight: 500,
              color: '#E7CF9C',
            }}
          >
            made
          </span>
          <span style={{ color: '#C9A55A' }}>.</span>
        </motion.h1>
      </motion.div>

      {/* Copyright */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
        style={{
          position: 'relative',
          zIndex: 10,
          margin: 0,
          fontSize: '11px',
          letterSpacing: '0.04em',
          color: 'rgba(255,255,255,0.42)',
          fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
        }}
      >
        &copy; {new Date().getFullYear()} Pholio. All rights reserved.
      </motion.p>
    </div>
  );
}
