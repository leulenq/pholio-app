import React, { useEffect, useRef, useState } from 'react';
import { SectionCard } from './SectionCard';

export const About: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setIsVisible(true); }, { threshold: 0.15 });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <SectionCard id="about">
      <div ref={sectionRef} className="w-full px-4 md:px-12 lg:px-24 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24 items-center">
          
          {/* Portrait */}
          <div className={`lg:col-span-5 relative ${isVisible ? 'animate-slide-up' : 'opacity-0'}`} style={{ animationDelay: '200ms' }}>
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl shadow-lg">
               <img 
                 src="https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=2728&auto=format&fit=crop" 
                 alt="Elara Keats Portrait"
                 className="w-full h-full object-cover"
               />
               <div className="absolute inset-0 bg-pholio-accent/10 mix-blend-multiply" />
            </div>
            {/* Artistic Element */}
            <div className="absolute -bottom-8 -right-8 w-32 h-32 border border-pholio-accent rounded-full animate-beam-spin opacity-40 md:block hidden" />
          </div>

          {/* Text Content */}
          <div className={`lg:col-span-7 flex flex-col justify-center ${isVisible ? 'animate-slide-up' : 'opacity-0'}`} style={{ animationDelay: '400ms' }}>
            <span className="text-pholio-accent font-mono text-xl mb-8">02</span>
            
            <h2 className="text-4xl md:text-6xl font-bold text-pholio-text-main uppercase tracking-tight mb-8">
                About <span className="font-serif italic text-pholio-text-sub font-normal capitalize">Elara</span>
            </h2>

            <h3 className="text-2xl md:text-3xl font-light text-pholio-text-main leading-tight mb-8 border-l-2 border-pholio-accent pl-6">
              "Redefining modern elegance through <br/><span className="text-pholio-accent font-serif italic">motion</span> and <span className="text-pholio-accent font-serif italic">expression</span>."
            </h3>
            
            <p className="text-pholio-text-sub text-lg leading-relaxed mb-12 max-w-xl font-light">
              Elara Keats is a British-Japanese fashion model known for her versatile presence in high fashion and commercial editorial. With a background in contemporary dance, she brings a fluid, dynamic energy to every shoot. Currently splitting her time between London, Paris, and New York.
            </p>

            {/* Model Stats */}
            <div className="flex flex-wrap gap-8 md:gap-16 border-t border-pholio-border pt-8">
              {[['Height', "5'11\""], ['Bust', '32"'], ['Waist', '24"'], ['Hips', '35"']].map(([label, val]) => (
                <div key={label}>
                  <span className="block text-[10px] font-bold text-pholio-text-sub uppercase tracking-widest mb-1">{label}</span>
                  <span className="text-2xl font-medium text-pholio-text-main">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
};