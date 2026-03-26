import React from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, ArrowRight, Eye, Camera } from 'lucide-react';
import { useRecentPhotos } from '../../hooks/useRecentPhotos';
import './PortfolioSnapshot.css';

export const PortfolioSnapshot = () => {
  const { data: photos, isLoading } = useRecentPhotos();

  return (
    <section className="portfolio-snapshot-section">
      {/* Task 9.1: Section Headers Consistency */}
      <div className="snapshot-header">
        <h2 className="snapshot-title">Portfolio Snapshot</h2>
        
        <Link to="/dashboard/talent/media" className="snapshot-link">
          View Full Portfolio <ArrowRight size={16} />
        </Link>
      </div>

      <div className="snapshot-container">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
             <div key={i} className="snapshot-card skeleton-card"></div>
          ))
        ) : photos && photos.length > 0 ? (
          photos.map((photo) => (
            <Link to="/dashboard/talent/media" key={photo.id} className="snapshot-card">
               <img 
                 src={photo.url} 
                 alt="Portfolio" 
                 className="snapshot-img" 
                 loading="lazy"
               />
               <div className="snapshot-overlay">
                  <span className="snapshot-views">
                    <Eye size={14} className="inline mr-1" /> View
                  </span>
               </div>
            </Link>
          ))
        ) : (
          // Task 5: Empty State Enhancement
          // Task 5: Enhanced Empty State - Aspirational & Full Width
          <div className="portfolio-empty-hero">
             <div className="portfolio-empty-visuals">
                <div className="visual-mock aspect-portrait"></div>
                <div className="visual-mock aspect-landscape"></div>
                <div className="visual-mock aspect-square"></div>
             </div>
             <div className="portfolio-empty-content-overlay">
                <div className="empty-badge">
                   <ImageIcon size={24} />
                </div>
                <h3 className="empty-heading">Start Your Portfolio</h3>
                
                <div className="portfolio-categories-guide">
                  <div className="category-item">
                    <div className="category-circle"><Camera size={20} /></div>
                    <span className="category-label">Headshot</span>
                  </div>
                  <div className="category-item">
                    <div className="category-circle"><Camera size={20} /></div>
                    <span className="category-label">Full Body</span>
                  </div>
                  <div className="category-item">
                    <div className="category-circle"><Camera size={20} /></div>
                    <span className="category-label">Profile</span>
                  </div>
                  <div className="category-item">
                    <div className="category-circle"><Camera size={20} /></div>
                    <span className="category-label">Commercial</span>
                  </div>
                  <div className="category-item">
                    <div className="category-circle"><Camera size={20} /></div>
                    <span className="category-label">Editorial</span>
                  </div>
                </div>

                <p className="empty-description">
                  Agencies prioritize visuals. Upload at least 5 high-quality photos to unlock your full potential and get discovered.
                </p>
                <Link to="/dashboard/talent/media" className="empty-primary-btn">
                   Upload Photos <ArrowRight size={18} />
                </Link>
             </div>
          </div>
        )}
      </div>
    </section>
  );
};
