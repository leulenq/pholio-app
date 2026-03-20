import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { calculateProfileStrength, getStrengthUI } from '../../utils/profileScoring';
import { useProfileStrength } from '../../hooks/useProfileStrength';
import styles from './ProfileStrengthSidebar.module.css';

export default function ProfileStrengthSidebar({ values, isSaving, isDisabled, onSaveClick, onItemClick }) {
  const [expanded, setExpanded] = useState(false);
  
  // 1. Official Strength (Server-side source of truth)
  const official = useProfileStrength();
  
  // 2. Live Strength (Interactive preview while typing)
  const liveStrength = useMemo(() => calculateProfileStrength(values), [values]);
  
  const { score, isRequiredComplete, allNextSteps } = liveStrength;
  const ui = getStrengthUI(score, isRequiredComplete);

  // Helper for completeness
  const checkFieldComplete = (fieldLabel) => {
    // If it's NOT in allNextSteps, it's considered complete
    return !allNextSteps.some(step => step.title === fieldLabel);
  };

  // Group 1: Required (60%)
  // Aligned with backend/essentials-check.js + Onboarding
  const requiredItems = [
    { label: 'Legal Name', key: 'name' },
    { label: 'Home City', key: 'city' },
    { label: 'Birth Date', key: 'dob' },
    { label: 'Gender', key: 'gender' },
    { label: 'Height', key: 'height' },
    { label: 'Measurements (Bust/Waist/Hips)', key: 'measurements' },
    { label: 'Primary Photo', key: 'photo' }
  ].map(item => ({
    ...item,
    isComplete: checkFieldComplete(item.label)
  }));

  // Group 2: Improve (40%)
  const improveItems = [
    { label: 'Professional Bio', key: 'bio' },
    { label: 'Weight', key: 'weight' },
    { label: 'Eye & Hair Color', key: 'appearance' },
    { label: 'Shoe Size', key: 'shoe' },
    { label: 'Skin Tone & Details', key: 'skin' },
    { label: 'Work Status', key: 'status' },
    { label: 'Experience Level', key: 'exp' },
    { label: 'Training & Specialties', key: 'training' },
    { label: 'Social Links', key: 'social' },
    { label: 'Emergency Contact', key: 'emergency' }
  ].map(item => ({
    ...item,
    isComplete: checkFieldComplete(item.label)
  }));

  const missingRequired = requiredItems.filter(i => !i.isComplete);
  const missingImprove = improveItems.filter(i => !i.isComplete);

  const statusColor = isRequiredComplete ? (score === 100 ? 'statusGold' : 'statusGreen') : 'statusRed';
  const progressColor = isRequiredComplete ? (score === 100 ? 'statusGold' : 'progressGreen') : 'progressRed';

  const visibleImprove = expanded ? missingImprove : missingImprove.slice(0, 3);
  const hiddenImproveCount = Math.max(0, missingImprove.length - 3);

  const getTargetSection = (label) => {
    if (label.includes('Name') || label.includes('City') || label.includes('Date') || label.includes('Gender') || label.includes('Bio')) return 'identity';
    if (label.includes('Photo')) return 'hero-section';
    if (label.includes('Height') || label.includes('Weight') || label.includes('Measurements') || label.includes('Eye') || label.includes('Shoe') || label.includes('Skin')) return 'appearance';
    if (label.includes('Work Status') || label.includes('Experience')) return 'roles';
    if (label.includes('Training') || label.includes('Specialties')) return 'training';
    if (label.includes('Social')) return 'socials';
    if (label.includes('Emergency')) return 'contact';
    return null;
  };

  const renderItem = (item, tier) => {
    const targetSection = !item.isComplete ? getTargetSection(item.label) : null;
    
    if (item.isComplete) {
      if (isRequiredComplete && tier === 'required') return null; // Hide completed required items once all are done
      return (
        <div key={item.label} className={`${styles.item} ${styles.itemComplete}`}>
          <div className={styles.icon}>
            <Check size={14} className={styles.checkIcon} />
          </div>
          <span>{item.label}</span>
        </div>
      );
    }

    let dotClass = styles.dotSlate;
    let badge = null;
    if (tier === 'required') {
      dotClass = styles.dotRed;
      badge = <span className={styles.badgeRed}>Required</span>;
    }

    return (
      <div 
        key={item.label} 
        className={`${styles.item} ${targetSection ? styles.clickableItem : ''}`}
        onClick={() => targetSection && onItemClick?.(targetSection)}
      >
        <div className={styles.icon}>
          <div className={`${styles.dot} ${dotClass}`} />
        </div>
        <div className={styles.itemLabel}>
          <span>{item.label}</span>
          {badge}
        </div>
      </div>
    );
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Casting Readiness</span>
          <div className={styles.scoreWrapper}>
            <span className={styles.score}>{score}%</span>
            <span className={styles.scoreLabel}>Strength</span>
            {official.score !== score && (
              <span className={styles.liveIndicator}>Live</span>
            )}
          </div>
          
          <div className={`${styles.statusPill} ${styles[statusColor]}`}>
            {official.score}% Verified Ready
          </div>
        </div>

        {/* Progress Bar */}
        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div 
              className={`${styles.progressFill} ${styles[progressColor]}`} 
              style={{ width: `${score}%` }} 
            />
          </div>
          <p className={styles.statusMessage}>{ui.message}</p>
        </div>

        <div className={styles.content}>
          {/* Required Section */}
          {!isRequiredComplete && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>Essential Gaps</span>
              </div>
              <div className={styles.itemList}>
                {requiredItems.map(item => renderItem(item, 'required'))}
              </div>
            </div>
          )}

          {/* Improve Section */}
          {missingImprove.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>
                  Casting Enhancements
                </span>
              </div>
              <div className={styles.itemList}>
                {visibleImprove.map(item => renderItem(item, 'improve'))}
                
                {!expanded && hiddenImproveCount > 0 && (
                  <button 
                    type="button" 
                    className={styles.expandToggle}
                    onClick={() => setExpanded(true)}
                  >
                    + {hiddenImproveCount} more steps <ChevronDown size={14} />
                  </button>
                )}
                {expanded && hiddenImproveCount > 0 && (
                  <button 
                    type="button" 
                    className={styles.expandToggle}
                    onClick={() => setExpanded(false)}
                  >
                    Collapse <ChevronUp size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {isRequiredComplete && missingImprove.length === 0 && (
            <div className={styles.celebration}>
              <Check size={32} className={styles.checkHero} />
              <p className={styles.celebrationText}>Casting Complete</p>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '-8px' }}>Your profile is at peak performance.</p>
            </div>
          )}
        </div>

        {/* Save Changes */}
        <div className={styles.saveContainer}>
          <button 
            type="submit"
            form="profile-form"
            className={styles.saveButton}
            onClick={onSaveClick}
            disabled={isDisabled}
          >
            {isSaving ? (
              <>
                <span className={styles.spinner} />
                <span>Synchronizing...</span>
              </>
            ) : (
              'Save & Update Profile'
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
