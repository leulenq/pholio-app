import React, { useEffect, useRef, useState } from 'react';
import { Project } from '../types';
import { ArrowUpRight } from 'lucide-react';
import { SectionCard } from './SectionCard';

const projects: Project[] = [
  { id: '1', title: 'Vogue Italia', category: 'Editorial', year: '2024', imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1600&auto=format&fit=crop' },
  { id: '2', title: 'Saint Laurent', category: 'Runway', year: '2023', imageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=1600&auto=format&fit=crop' },
  { id: '3', title: 'Numéro Tokyo', category: 'Cover', year: '2023', imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=1600&auto=format&fit=crop' },
  { id: '4', title: 'Celine Campaign', category: 'Commercial', year: '2024', imageUrl: 'https://images.unsplash.com/photo-1529139574466-a302d2d3f524?q=80&w=1600&auto=format&fit=crop' },
  { id: '5', title: 'Harper\'s Bazaar', category: 'Beauty', year: '2023', imageUrl: 'https://images.unsplash.com/photo-1500917293891-ef795e70e1f6?q=80&w=1600&auto=format&fit=crop' },
  { id: '6', title: 'Prada Collection', category: 'Lookbook', year: '2024', imageUrl: 'https://images.unsplash.com/photo-1492106087820-71f1707d1b39?q=80&w=1600&auto=format&fit=crop' }
];

export const Work: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setIsVisible(true); }, { threshold: 0.1 });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <SectionCard id="work">
      <div ref={sectionRef} className="w-full px-4 md:px-12 lg:px-24 py-24">
        
        {/* Header */}
        <div className="flex flex-col justify-start mb-16 relative z-10">
          <div className={`${isVisible ? 'animate-slide-up' : 'opacity-0'}`}>
            <h2 className="text-[10vw] md:text-[6vw] leading-[0.8] font-bold text-pholio-text-main mb-6 uppercase tracking-tighter">
              Featured <span className="font-serif italic text-pholio-accent font-light block md:inline">Work</span>
            </h2>
            <div className="flex items-center gap-4 mt-4">
              <span className="h-[1px] w-12 bg-pholio-text-sub/40"></span>
              <p className="text-pholio-text-sub text-sm tracking-widest uppercase">
                Selected Projects // 2023 — 2024
              </p>
            </div>
          </div>
        </div>

        {/* Grid - simplified project cards that live inside the main Section Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16">
          {projects.map((project, index) => (
            <div 
              key={project.id}
              className={`group cursor-pointer ${isVisible ? 'animate-slide-up' : 'opacity-0'}`}
              style={{ animationDelay: `${index * 150}ms` }}
            >
              {/* Image */}
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl mb-6 shadow-sm">
                <img 
                  src={project.imageUrl} 
                  alt={project.title}
                  className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors duration-500" />
                
                {/* Floating Action Button */}
                <div className="absolute bottom-4 right-4 w-10 h-10 bg-pholio-accent rounded-full flex items-center justify-center opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 shadow-lg">
                    <ArrowUpRight size={18} className="text-white" />
                </div>
              </div>

              {/* Minimal Text Info */}
              <div className="flex flex-col items-start w-full">
                <div className="flex justify-between w-full items-baseline border-b border-pholio-border pb-2 mb-2 group-hover:border-pholio-accent/50 transition-colors">
                   <h3 className="text-xl font-bold text-pholio-text-main uppercase tracking-tight group-hover:text-pholio-accent transition-colors">{project.title}</h3>
                   <span className="text-xs font-serif italic text-pholio-text-sub">{project.year}</span>
                </div>
                <p className="text-pholio-text-sub text-xs font-bold tracking-widest uppercase">{project.category}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
};