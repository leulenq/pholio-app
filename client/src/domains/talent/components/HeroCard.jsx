import React from 'react';
import { Upload } from 'lucide-react'; // Only Upload icon needed
import { Link } from 'react-router-dom';
import './HeroCard.css';

export const HeroCard = ({ firstName }) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="hero-card">
      <div className="hero-content">
        {/* Task 1.1: Full Gradient Greeting */}
        <h1 className="hero-title">
          {getGreeting()}, {firstName || 'Talent'}!
        </h1>
        <p className="hero-subtitle">
          Your portfolio is working for you
        </p>
        
        {/* Task 1.2: Button Removed (Moved to FAB) */}
      </div>
    </div>
  );
};
