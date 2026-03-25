import React from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, ArrowRight, Eye, Edit, Camera, Sparkles, User, Upload } from 'lucide-react';
import { useRecentPhotos } from '../../hooks/useRecentPhotos';
import './PhotoGallery.css';

export const PhotoGallery = () => {
  const { data: photos, isLoading } = useRecentPhotos();

  return (
    <section className="photo-gallery-section">
      <div className="section-header">
        <div>
           {(!photos || photos.length === 0) ? (
             <h2 className="section-title">
               📸 Your portfolio is your superpower. <span className="text-slate-500 font-normal">Let's fill it with amazing shots!</span>
             </h2>
           ) : (
             <h2 className="section-title">Your Portfolio</h2>
           )}
        </div>
        
        {photos && photos.length > 0 && (
          <Link to="/dashboard/talent/media" className="section-link">
            View All <ArrowRight size={16} />
          </Link>
        )}
      </div>

      <div className="gallery-container">
        {isLoading ? (
          // Loading Skeletons
          Array.from({ length: 5 }).map((_, i) => (
             <div key={i} className="photo-card skeleton-card"></div>
          ))
        ) : photos && photos.length > 0 ? (
          // Photo Cards
          photos.map((photo) => (
            <div key={photo.id} className="photo-card">
               <img 
                 src={photo.url} 
                 alt="Portfolio" 
                 className="photo-img" 
                 loading="lazy"
               />
               <div className="photo-overlay">
                  <div className="photo-actions">
                     <button className="photo-action-btn" title="View"><Eye size={18} /></button>
                     <button className="photo-action-btn" title="Edit"><Edit size={18} /></button>
                  </div>
               </div>
            </div>
          ))
        ) : (
          // Inspiring Multi-Card Empty State
          <>
            {/* Card 1: Primary Upload Action */}
            <Link to="/dashboard/talent/media" className="empty-card primary-action">
               <div className="empty-icon-circle pulse">
                  <Upload size={32} />
               </div>
               <p className="empty-title">Add Photos</p>
               <p className="empty-subtitle">Drag & drop or click</p>
            </Link>

            {/* Card 2: Professional Shots */}
            <div className="empty-card placeholder">
               <div className="empty-icon-circle">
                  <Camera size={28} />
               </div>
               <p className="empty-title">Professional Shots</p>
            </div>

            {/* Card 3: Headshots */}
            <div className="empty-card placeholder">
                <div className="empty-icon-circle">
                   <User size={28} />
                </div>
                <p className="empty-title">Headshots</p>
            </div>

             {/* Card 4: Lifestyle */}
             <div className="empty-card placeholder">
                <div className="empty-icon-circle">
                   <Sparkles size={28} />
                </div>
                <p className="empty-title">Lifestyle</p>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
