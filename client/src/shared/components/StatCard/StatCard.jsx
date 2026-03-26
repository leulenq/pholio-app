import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '../Card/Card';
import './StatCard.css';

export const StatCard = ({ title, value, change, trend, icon: Icon, color = 'gold', progress = null }) => {
  // logic for trend
  let TrendIcon = null;
  let trendClass = 'trendNeutral';

  if (trend === 'up') {
    TrendIcon = TrendingUp;
    trendClass = 'trendUp';
  } else if (trend === 'down') {
    TrendIcon = TrendingDown;
    trendClass = 'trendDown';
  }

  // Progress Animation
  const [animatedProgress, setAnimatedProgress] = useState(0);
  
  useEffect(() => {
    if (progress !== null) {
      // Small delay to allow enter animation first
      const timer = setTimeout(() => {
        setAnimatedProgress(progress);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [progress]);

  // Circle props
  const radius = 54; // 120 width / 2 - stroke/2 roughly
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedProgress / 100) * circumference;

  return (
    <Card className={`stat-card-wrapper ${color}`}>
      <div className="statCard">
        <div className="statHeader">
          <span className="statTitle">{title}</span>
          {Icon && (
            <div className={`statIconContainer ${color}`}>
               <Icon className="statIcon" size={24} />
            </div>
          )}
        </div>

        {/* Conditional Content: Standard Value or Circular Progress */}
        {progress !== null ? (
          <div className="statProgressContainer">
            <svg width="120" height="120" viewBox="0 0 120 120" className="progress-ring">
               <circle
                 className="progress-ring__circle-bg"
                 stroke="#e5e7eb"
                 strokeWidth="8"
                 fill="transparent"
                 r={radius}
                 cx="60"
                 cy="60"
               />
               <circle
                 className="progress-ring__circle"
                 stroke="url(#goldGradient)"
                 strokeWidth="8"
                 fill="transparent"
                 r={radius}
                 cx="60"
                 cy="60"
                 style={{ strokeDasharray: `${circumference} ${circumference}`, strokeDashoffset }}
               />
               <defs>
                 <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                   <stop offset="0%" stopColor="#C9A55A" />
                   <stop offset="100%" stopColor="#855F18" />
                 </linearGradient>
               </defs>
            </svg>
            <div className="progress-text">
               {progress}%
            </div>
          </div>
        ) : (
          <>
            <div className="statValue">{value}</div>
            
            {change && (
              <div className={`statChangeWrapper`}>
                <span className={`statChange ${trendClass}`}>
                  {TrendIcon && <TrendIcon size={16} />}
                  <span>{change}</span>
                </span>
                <span className="statChangeLabel">vs last month</span>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
};
