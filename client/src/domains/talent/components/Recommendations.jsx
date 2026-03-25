import React from 'react';
import { Link } from 'react-router-dom';
import { User, Image as ImageIcon, FileText, X } from 'lucide-react';
import { useStats } from '../../agency/hooks/useStats'; // Reuse stats for logic
import './Recommendations.css';

export const Recommendations = () => {
  const { data: stats, isLoading } = useStats();
  const [isVisible, setIsVisible] = React.useState(true);

  if (isLoading || !isVisible) return null;

  // Logic to determine recommendations
  const completeness = stats?.completeness?.percentage || 0;
  // Assume mock threshold for photos as stats might not have image count directly yet, 
  // but let's assume completeness helps us guess.
  // Ideally, stats endpoint should return basic counts.
  
  const recommendations = [];

  if (completeness < 100) {
    recommendations.push({
      id: 'profile',
      icon: User,
      text: 'Complete your bio to boost discoverability',
      link: '/dashboard/talent/profile',
      action: 'Edit Bio'
    });
  }

  // Hardcode a check for demo if needed, or rely on missingItems logic
  if (stats?.completeness?.missingItems?.includes('comp_card')) {
    recommendations.push({
      id: 'comp_card',
      icon: FileText,
      text: 'Generate your comp card',
      link: '/dashboard/talent/media', // Assuming media page has comp card button
      action: 'Create Card'
    });
  }

  // Fallback: If "fully complete" effectively, hide section
  if (recommendations.length === 0) return null;

  return (
    <section className="recommendations-section">
      <div className="rec-card">
         <div className="rec-header">
            <span className="rec-badge">RECOMMENDATIONS</span>
            <button 
              onClick={() => setIsVisible(false)} 
              className="rec-close"
              aria-label="Dismiss recommendations"
            >
              <X size={16} />
            </button>
         </div>

         <div className="rec-list">
            {recommendations.slice(0, 3).map((rec) => (
              <div key={rec.id} className="rec-item">
                 <div className="rec-icon-wrapper">
                    <rec.icon size={16} />
                 </div>
                 <span className="rec-text">{rec.text}</span>
                 <Link to={rec.link} className="rec-action-btn">
                    {rec.action}
                 </Link>
              </div>
            ))}
         </div>
      </div>
    </section>
  );
};
