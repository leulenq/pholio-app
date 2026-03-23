import React, { useEffect, useState } from 'react';
import { Instagram, Linkedin, Twitter } from 'lucide-react';
import { SectionCard } from './SectionCard';
import { Navbar } from './Navbar';

export const Hero: React.FC = () => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const socialLinks = [
    { Icon: Instagram, href: '#', label: 'Instagram', bgColor: 'bg-white/10 hover:bg-[#E1306C]/80', glow: 'shadow-pink-500/10' },
    { Icon: Twitter, href: '#', label: 'X', bgColor: 'bg-white/10 hover:bg-[#1DA1F2]/80', glow: 'shadow-blue-400/10' },
    { Icon: Linkedin, href: '#', label: 'LinkedIn', bgColor: 'bg-white/10 hover:bg-[#0077B5]/80', glow: 'shadow-blue-600/10' }
  ];

  return (
    <SectionCard id="hero" className="w-full h-[95vh] min-h-[850px]">
      <Navbar />

      <div className={`relative w-full h-full flex flex-col justify-end ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-1000`}>
        
        {/* Cinematic Background Layer */}
        <div className="absolute inset-0 z-0">
            <div 
              className="w-full h-full bg-cover bg-center bg-no-repeat animate-slow-zoom scale-105"
              style={{
                backgroundImage: "url('https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?q=80&w=2728&auto=format&fit=crop')",
                backgroundPosition: 'center 25%' 
              }}
            />
            {/* Moody Dark Overlay Inspired by Suki Kimura */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/30" />
            <div className="absolute inset-0 bg-black/10 mix-blend-overlay" />
        </div>

        {/* Content Layout Layer */}
        <div className="relative z-20 w-full px-8 md:px-16 pb-20 md:pb-28 flex flex-col md:flex-row justify-between items-end gap-12">
            
            {/* Left side: Branding & Bio & Socials */}
            <div className="max-w-4xl flex flex-col items-start">
               <div className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-8">
                  <h1 className="text-[14vw] md:text-[9.5vw] leading-[0.8] tracking-tighter text-white uppercase font-bold">
                    Elara
                  </h1>
                  <h1 className="text-[14vw] md:text-[9.5vw] leading-[0.8] tracking-tighter font-serif italic font-light text-pholio-accent drop-shadow-2xl">
                    Keats
                  </h1>
               </div>
               
               <div className="mt-12 max-w-lg">
                 <p className="text-white/70 text-lg md:text-xl font-light leading-relaxed tracking-tight">
                    Professional fashion, runway, and commercial model based in 
                    London. Bringing elegance, versatility, and energy to every frame.
                 </p>
                 
                 {/* Social Icons under the bio text */}
                 <div className="flex gap-4 mt-8">
                    {socialLinks.map(({ Icon, href, bgColor, glow }, i) => (
                      <a 
                        key={i} 
                        href={href} 
                        className={`w-12 h-12 ${bgColor} backdrop-blur-xl rounded-xl flex items-center justify-center text-white hover:scale-110 hover:-translate-y-2 transition-all duration-500 shadow-xl ${glow} border border-white/5 group relative`}
                      >
                         <div className="absolute inset-0 border border-pholio-accent opacity-0 group-hover:opacity-40 rounded-xl transition-opacity duration-300" />
                         <Icon size={18} className="relative z-10" />
                      </a>
                    ))}
                 </div>
               </div>
            </div>

            {/* Bottom Right: Agency Representation */}
            <div className="pb-4">
              <div className="flex flex-col items-start md:items-end text-left md:text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/40 mb-2">Represented by</p>
                <p className="text-2xl md:text-3xl font-serif italic text-pholio-accent tracking-wide drop-shadow-lg">IMG Models</p>
              </div>
            </div>

        </div>

        {/* Minimal Scroll Detail with Gold Tip */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 opacity-40 group cursor-default">
          <span className="text-[8px] uppercase tracking-[0.5em] text-white/80 group-hover:text-pholio-accent transition-colors">Explore</span>
          <div className="w-[1px] h-14 bg-gradient-to-b from-white/10 via-white/40 to-pholio-accent" />
        </div>

      </div>
    </SectionCard>
  );
};