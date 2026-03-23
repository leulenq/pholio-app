import React, { useRef } from 'react';

interface SectionCardProps {
  id?: string;
  className?: string;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ id, className = '', children }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <section 
      id={id}
      ref={cardRef}
      className={`group relative rounded-card bg-pholio-border p-[1px] overflow-hidden transition-all duration-700 hover:shadow-[0_0_80px_rgba(201,165,90,0.1)] ${className}`}
    >
      {/* Inner Content Card Container */}
      <div className="relative h-full w-full bg-pholio-card-bg rounded-[31px] overflow-hidden shadow-card-depth">
        {children}
      </div>
    </section>
  );
};