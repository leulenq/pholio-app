import React from 'react';
import { Mail, ArrowRight } from 'lucide-react';
import { SectionCard } from './SectionCard';

export const Footer: React.FC = () => {
  return (
    <SectionCard id="footer">
      <div className="w-full h-full min-h-[600px] flex flex-col items-center justify-center relative overflow-hidden p-16 md:p-32 text-center bg-pholio-card-bg">
        
        {/* 3D Planet Graphic (CSS) with Motion - Gold for Elara */}
        <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full planet-sphere opacity-60 animate-planet-motion pointer-events-none blur-3xl" />
        
        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          <div className="animate-fade-in delay-200">
            <h2 className="text-5xl md:text-8xl font-bold text-pholio-text-main mb-2 leading-tight uppercase tracking-tight">
              Ready to
            </h2>
            <h2 className="text-5xl md:text-8xl font-serif italic font-light text-pholio-text-sub mb-12 leading-tight">
              create magic?
            </h2>
          </div>

          <a 
            href="mailto:bookings@elarakeats.com" 
            className="group flex items-center gap-3 bg-pholio-accent text-white px-10 py-5 font-bold text-lg border-2 border-transparent hover:bg-white hover:text-pholio-backdrop transition-all duration-250 ease-out animate-slide-up shadow-xl hover:shadow-2xl rounded-sm"
            style={{ animationDelay: '300ms' }}
          >
            <Mail className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-250 ease-out" />
            <span className="uppercase tracking-widest text-sm">bookings@elarakeats.com</span>
          </a>

          <div className="mt-24 w-full flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-pholio-text-sub border-t border-pholio-border pt-8 animate-fade-in" style={{ animationDelay: '500ms' }}>
            <div className="flex gap-8 uppercase tracking-widest text-xs font-bold text-pholio-text-main">
              {['Instagram', 'Models.com', 'Twitter', 'LinkedIn'].map(social => (
                <a 
                  key={social} 
                  href="#" 
                  className="hover:text-pholio-accent hover:scale-110 transition-all duration-300 ease-premium"
                >
                  {social}
                </a>
              ))}
            </div>
            
            <p className="opacity-50 text-pholio-text-sub">
              © 2024 Elara Keats.
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
};