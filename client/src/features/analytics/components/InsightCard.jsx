import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Rotating Insight Card for Free Users
 * Shows helpful tips and highlights
 */
export default function InsightCard({ insights = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Default insights if none provided
  const defaultInsights = [
    {
      title: "Peak Performance",
      message: "Your profile gets the most views on Fridays",
      tip: "Update your portfolio mid-week for maximum impact"
    },
    {
      title: "Profile Power",
      message: "Profiles with 5+ photos get 3x more agency views",
      tip: "Add more high-quality images to stand out"
    },
    {
      title: "Bio Boost",
      message: "Complete bios increase download rates by 40%",
      tip: "Tell your story to connect with agencies"
    }
  ];

  const displayInsights = insights.length > 0 ? insights : defaultInsights;
  const currentInsight = displayInsights[currentIndex];

  // Rotate insights every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % displayInsights.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [displayInsights.length]);

  return (
    <div className="insight-card">
      <div className="insight-header">
        <div className="insight-icon">
          <Sparkles size={20} className="text-[#C9A55A]" />
        </div>
        <h3 className="insight-title">{currentInsight.title}</h3>
      </div>
      
      <p className="insight-message">{currentInsight.message}</p>
      
      {currentInsight.tip && (
        <div className="insight-tip">
          <span className="tip-label">Pro Tip:</span>
          <span className="tip-text">{currentInsight.tip}</span>
        </div>
      )}

      {/* Pagination dots */}
      <div className="insight-pagination">
        {displayInsights.map((_, idx) => (
          <button
            key={idx}
            className={`pagination-dot ${idx === currentIndex ? 'active' : ''}`}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`View insight ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
