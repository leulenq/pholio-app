import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useRecentPhotos } from '../../hooks/useRecentPhotos';
import './SidebarWidget.css'; 

export const SidebarProfile = () => {
  const { profile } = useAuth();
  const { data: photos } = useRecentPhotos();
  
  const hasPhotos = photos && photos.length > 0;
  const heroImage = hasPhotos ? photos[0].url : null;
  const initial = profile?.first_name?.[0] || 'T';

  const [progress, setProgress] = useState(0);
  const targetProgress = 75; 

  useEffect(() => {
    const timer = setTimeout(() => {
      setProgress(targetProgress);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Task 6.1: 8px stroke
  const strokeWidth = 8;
  const radius = 64; // 140/2 - roughly, adjusted in CSS for avatar size
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="sidebar-widget profile-widget" style={{ textAlign: 'center', padding: '2rem 1.5rem', marginTop: 0 }}>
      {/* Profile Ring Container */}
      <div className="profile-image-container" style={{ margin: '0 auto 1.5rem auto' }}>
        <svg className="performance-ring" width="140" height="140" viewBox="0 0 140 140">
           {/* SVG content unchanged */}
           <defs>
             <linearGradient id="performanceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
               <stop offset="0%" stopColor="#C9A55A" />
               <stop offset="100%" stopColor="#d4af37" />
             </linearGradient>
           </defs>
           <circle cx="70" cy="70" r="64" stroke="#e5e7eb" strokeWidth="8" fill="none" />
           <circle 
             cx="70" cy="70" r="64" stroke="url(#performanceGradient)" strokeWidth="8" fill="none" 
             strokeDasharray={circumference} 
             strokeDashoffset={strokeDashoffset} 
             strokeLinecap="round" 
             transform="rotate(-90 70 70)"
             style={{ transition: 'stroke-dashoffset 1s ease-out' }}
           />
        </svg>
        
        <div className="profile-avatar-inner" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', margin: 0 }}>
           {heroImage ? (
             <img src={heroImage} alt="Profile" className="avatar-img" />
           ) : (
             <div className="avatar-placeholder-gradient">
               {initial}
             </div>
           )}
        </div>
      </div>

      <div className="profile-text-center">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>
          Your Portfolio
        </h3>
        <div className="profile-status-badge">
           <span role="img" aria-label="star" className="text-xl mr-2">🌟</span> 
           <span style={{ fontSize: '0.95rem', color: '#64748b' }}>Trending with agencies</span>
        </div>
      </div>
    </div>
  );
};
