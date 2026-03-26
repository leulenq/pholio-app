import React from 'react';
import './PholioForms.css';

const PholioSection = ({ title, description, children, id, className = '' }) => {
  return (
    <section id={id} className={`pholio-section-card ${className}`}>
      <div className="pholio-section-header">
        {title && <h3 className="pholio-section-title">{title}</h3>}
        {description && <p className="pholio-section-desc">{description}</p>}
      </div>
      <div className="pholio-section-content">
        {children}
      </div>
    </section>
  );
};

export default PholioSection;
