import React, { useEffect, useRef, useState } from 'react';
import { ExperienceItem } from '../types';
import { SectionCard } from './SectionCard';

const experienceData: ExperienceItem[] = [
  { id: '1', partner: 'IMG Models', scope: 'Mother Agency', location: 'London, UK', status: 'Signed' },
  { id: '2', partner: 'Elite Model Mgmt', scope: 'Direct', location: 'Paris, FR', status: 'Signed' },
  { id: '3', partner: 'The Society', scope: 'Direct', location: 'New York, USA', status: 'Signed' },
  { id: '4', partner: 'DNA Models', scope: 'Direct', location: 'Milan, IT', status: 'Signed' },
  { id: '5', partner: 'Bravo Models', scope: 'Commercial', location: 'Tokyo, JP', status: 'Signed' }
];

export const Experience: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setIsVisible(true); }, { threshold: 0.15 });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <SectionCard id="experience">
      <div ref={sectionRef} className="w-full px-4 md:px-12 lg:px-24 py-24">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-pholio-border pb-8">
           <div className={`${isVisible ? 'animate-slide-up' : 'opacity-0'}`}>
              <h2 className="text-4xl md:text-5xl font-bold text-pholio-text-main uppercase tracking-tight">
                Representation
              </h2>
           </div>
           <span className={`text-pholio-accent font-mono text-xl mt-4 md:mt-0 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>03</span>
        </div>

        {/* List Items */}
        <div className="flex flex-col">
          {experienceData.map((item, index) => (
            <div 
              key={item.id} 
              className={`group flex flex-col md:flex-row md:items-center justify-between py-8 border-b border-pholio-border hover:border-pholio-accent/30 transition-colors duration-300 ${
                isVisible ? 'animate-slide-up' : 'opacity-0'
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex-1">
                <h3 className="text-3xl font-light text-pholio-text-main group-hover:text-pholio-accent transition-colors duration-300 group-hover:pl-4">
                  {item.partner}
                </h3>
              </div>
              
              <div className="flex items-center gap-8 md:gap-16 mt-4 md:mt-0 text-sm md:text-base font-light text-pholio-text-sub">
                <span className="w-24">{item.location}</span>
                <span className="w-24 text-pholio-text-main opacity-60">{item.scope}</span>
                <span className="text-xs font-bold text-pholio-accent uppercase tracking-widest border border-pholio-accent/20 px-2 py-1 rounded-sm bg-pholio-accent/5">
                  {item.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
};