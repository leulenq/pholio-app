import React from 'react';
import { ArrowRight } from 'lucide-react';

export const Navbar: React.FC = () => {
  const navLinks = [
    { label: 'Portfolio', href: '#work' },
    { label: 'Bio', href: '#about' },
    { label: 'Agency', href: '#experience' },
  ];

  return (
    <nav className="absolute top-0 left-0 right-0 z-50 py-10 px-8 md:px-14 flex items-center justify-between pointer-events-none">
      {/* Left side: Branding */}
      <div className="flex-1 flex justify-start pointer-events-auto">
        <a href="#" className="group flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tighter text-white uppercase group-hover:text-pholio-accent transition-colors duration-300">
            EK
          </span>
          <span className="text-white/20 font-light text-xl">|</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">
            Pholio
          </span>
        </a>
      </div>

      {/* Center: Navigation Links */}
      <div className="hidden md:flex flex-1 justify-center items-center gap-10 pointer-events-auto">
        {navLinks.map((link) => (
          <a 
            key={link.label}
            href={link.href}
            className="relative text-[11px] font-bold uppercase tracking-[0.4em] text-white/50 hover:text-white transition-all duration-300 group"
          >
            {link.label}
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-[1px] bg-pholio-accent transition-all duration-500 group-hover:w-full"></span>
          </a>
        ))}
      </div>

      {/* Right side: Elegant Book Button */}
      <div className="flex-1 flex justify-end pointer-events-auto">
        <a 
          href="#footer"
          className="group flex items-center gap-3 px-8 py-3 rounded-full border border-white/10 hover:border-pholio-accent hover:bg-pholio-accent/5 transition-all duration-500 backdrop-blur-md"
        >
          <span className="text-[11px] font-bold uppercase tracking-widest text-white group-hover:text-pholio-accent transition-colors">
            Book Elara
          </span>
          <ArrowRight size={14} className="text-white group-hover:text-pholio-accent group-hover:translate-x-1 transition-all" />
        </a>
      </div>
    </nav>
  );
};