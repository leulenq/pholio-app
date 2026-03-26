import React from 'react';
import { motion } from 'framer-motion';

export default function TalentSpotlight() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      background: '#0a0a0a',
    }}>
      {/* Stock Photo Background */}
      <img
        src="https://images.unsplash.com/photo-1469334031218-e382a71b716b?q=80&w=2070&auto=format&fit=crop"
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center top',
        }}
      />

      {/* Dark Overlay for Contrast */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        zIndex: 1,
      }} />

      {/* Gradient Overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(to top, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.4) 40%, transparent 80%)',
        zIndex: 2,
      }} />

      {/* Decorative diagonal light streaks */}
      <div style={{
        position: 'absolute',
        top: '-15%',
        right: '-5%',
        width: '100%',
        height: '140%',
        background: 'linear-gradient(135deg, rgba(184,149,106,0.06) 0%, transparent 60%)',
        transform: 'rotate(-12deg)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        top: '-25%',
        right: '-15%',
        width: '100%',
        height: '140%',
        background: 'linear-gradient(135deg, rgba(184,149,106,0.03) 0%, transparent 50%)',
        transform: 'rotate(-25deg)',
        pointerEvents: 'none',
      }} />

      {/* Bottom Content */}
      <div style={{ position: 'relative', zIndex: 10, padding: '56px' }}>
        {/* Brand Name */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <p style={{ 
            fontSize: '11px', 
            color: '#B8956A', 
            letterSpacing: '0.2em', 
            textTransform: 'uppercase', 
            marginBottom: '16px',
            fontWeight: 700,
            fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)"
          }}>
            Pholio.studio
          </p>
          <h2 style={{ 
            fontFamily: "var(--ag-font-serif, 'Playfair Display', Georgia, serif)",
            fontSize: 'clamp(2rem, 3.5vw, 3rem)', 
            color: '#FFFFFF', 
            fontWeight: 400, 
            lineHeight: 1.1,
            marginBottom: '20px',
            letterSpacing: '-0.02em',
          }}>
            The Standard for <br />
            <span style={{ fontStyle: 'italic' }}>Modern Industry.</span>
          </h2>
          <p style={{ 
            fontSize: '15px', 
            color: 'rgba(255,255,255,0.7)', 
            maxWidth: '520px', 
            lineHeight: 1.6,
            marginBottom: '16px',
            fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)"
          }}>
            Bridge the gap between ambitious creativity and surgical precision. 
            Whether you are defining a prestige portfolio or curating the next 
            generation of excellence, Pholio is your definitive competitive edge.
          </p>
          <p style={{ 
            fontSize: '13px', 
            color: 'rgba(255,255,255,0.4)', 
            marginBottom: '40px',
            fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)"
          }}>
            A community of <span style={{ color: '#B8956A', fontWeight: 600 }}>2,000+</span> luxury partners
          </p>
        </motion.div>

        {/* Glassmorphic Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            border: '1px solid rgba(184,149,106,0.15)',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '460px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}
        >
          <h3 style={{ 
            fontFamily: "var(--ag-font-serif, 'Playfair Display', Georgia, serif)",
            fontSize: '1.35rem', 
            color: '#FFFFFF', 
            fontWeight: 400, 
            lineHeight: 1.3,
            marginBottom: '16px',
          }}>
            "Pholio has redefined the professional relationship. It brings a new level of clarity and prestige to every interaction."
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <p style={{ 
                fontSize: '13px', 
                color: '#FFFFFF', 
                fontWeight: 600,
                fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)"
              }}>
                Sarah Jenkins
              </p>
              <p style={{ 
                fontSize: '11px', 
                color: 'rgba(255,255,255,0.4)', 
                fontFamily: "var(--ag-font-sans, 'Inter', sans-serif)",
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Creative Director, Nexus
              </p>
            </div>
            {/* Avatar Stack */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {[
                'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=80&h=80&fit=crop&crop=face',
                'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face',
                'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face',
              ].map((src, i) => (
                <div 
                  key={i}
                  style={{ 
                    width: '38px', 
                    height: '38px', 
                    borderRadius: '50%', 
                    overflow: 'hidden',
                    border: '2px solid #0A0A0A',
                    marginLeft: i > 0 ? '-12px' : '0',
                    position: 'relative',
                    zIndex: 3 - i,
                  }}
                >
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'rgba(184,149,106,0.3)',
                border: '2px solid #0A0A0A',
                marginLeft: '-12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 800,
                color: '#B8956A',
                backdropFilter: 'blur(4px)'
              }}>
                2k+
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}


