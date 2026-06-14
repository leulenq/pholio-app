import React from 'react';
import { Outlet } from 'react-router-dom';
import TalentSpotlight from '../../domains/auth/components/TalentSpotlight';

export default function AuthLayout() {
  return (
    <div
      className="min-h-screen font-sans flex overflow-hidden"
      style={{ background: '#0A0908' }}
    >
      {/* Left: Editorial photo panel — desktop only */}
      <div
        className="hidden lg:block lg:w-[55%] relative overflow-hidden"
        style={{ background: '#0A0908', flexShrink: 0 }}
      >
        <TalentSpotlight />
      </div>

      {/* Right: Dark form panel */}
      <div
        className="w-full lg:w-[45%] flex flex-col px-6 sm:px-12 lg:px-16 py-10 overflow-y-auto"
        style={{
          background: '#100F0E',
          borderLeft: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Mobile logo (photo panel is hidden under lg) */}
        <a
          href="/"
          className="lg:hidden mb-10"
          style={{
            fontFamily: "var(--ag-font-serif, 'Playfair Display', serif)",
            fontWeight: 400,
            letterSpacing: '0.22em',
            color: '#C9A55A',
            fontSize: '20px',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          Pholio
        </a>

        {/* Form — vertically centered */}
        <div
          className="flex-1 flex flex-col justify-center w-full"
          style={{ maxWidth: '420px', margin: '0 auto' }}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}
