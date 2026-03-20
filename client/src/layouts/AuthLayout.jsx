import React from 'react';
import { Outlet } from 'react-router-dom';
import TalentSpotlight from '../components/auth/TalentSpotlight';

export default function AuthLayout() {
  return (
    <div className="min-h-screen font-sans flex overflow-hidden" style={{ background: '#FAF8F5' }}>
      {/* Left Column: Form Area */}
      <div className="w-full lg:w-[45%] flex flex-col relative z-10 px-6 sm:px-12 lg:px-20 py-8 lg:py-12 overflow-y-auto text-[#1A1815]" style={{ background: '#FAF8F5' }}>
        {/* Logo */}
        <header className="mb-12 lg:mb-0">
          <a href="/" className="inline-flex items-center gap-2" style={{ textDecoration: 'none' }}>
            <span style={{
              fontFamily: "var(--ag-font-serif, 'Playfair Display', serif)",
              fontWeight: 400,
              letterSpacing: "0.2em",
              color: "#B8956A",
              fontSize: "22px",
              textTransform: 'uppercase'
            }}>
              PHOLIO
            </span>
          </a>
        </header>

        {/* Content Centered Vertically */}
        <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
          <Outlet />
        </div>

        {/* Footer */}
        <footer style={{ marginTop: 'auto', paddingTop: '48px', color: '#9CA3AF', fontSize: '11px' }}>
          &copy; {new Date().getFullYear()} Pholio. All rights reserved.
        </footer>
      </div>

      {/* Right Column: Dark Branded Panel (Full Bleed) */}
      <div className="hidden lg:block lg:w-[55%] relative overflow-hidden" style={{ 
        background: '#0A0A0A',
      }}>
        <TalentSpotlight />
      </div>
    </div>
  );
}
