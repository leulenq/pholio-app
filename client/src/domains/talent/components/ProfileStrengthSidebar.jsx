import React, { useState, useMemo } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { calculateProfileStrength, getStrengthUI } from '../../../shared/utils/profileScoring';
import styles from './ProfileStrengthSidebar.module.css';

export default function ProfileStrengthSidebar({ values, isSaving, isDisabled, onSaveClick, onItemClick }) {
  const [expanded, setExpanded] = useState(false);
  
  // Live Strength (interactive preview while typing)
  const liveStrength = useMemo(() => calculateProfileStrength(values), [values]);

  const { score, isRequiredComplete, fieldCompletion, scrollTargetByKey } = liveStrength;
  const ui = getStrengthUI(score, isRequiredComplete);
  const hasUnsavedChanges = !isDisabled && !isSaving;

  // Group 1: Required (60%)
  // Aligned with backend/essentials-check.js + Onboarding
  const requiredItems = [
    { label: 'Legal Name', key: 'name' },
    { label: 'Home City', key: 'city' },
    { label: 'Birth Date', key: 'dob' },
    { label: 'Gender', key: 'gender' },
    { label: 'Height', key: 'height' },
    { label: 'Measurements (Bust/Waist/Hips)', key: 'measurements' },
    { label: 'Primary Photo', key: 'photo' },
  ].map((item) => ({
    ...item,
    isComplete: fieldCompletion[item.key],
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
    { label: 'Emergency Contact', key: 'emergency' },
  ].map((item) => ({
    ...item,
    isComplete: fieldCompletion[item.key],
  }));

  const missingImprove = improveItems.filter((i) => !i.isComplete);

  const statusColor = isRequiredComplete ? (score === 100 ? 'statusGold' : 'statusGreen') : 'statusRed';
  const progressColor = isRequiredComplete ? (score === 100 ? 'statusGold' : 'progressGreen') : 'progressRed';

  const visibleImprove = expanded ? missingImprove : missingImprove.slice(0, 3);
  const hiddenImproveCount = Math.max(0, missingImprove.length - 3);

  const renderItem = (item, tier) => {
    const targetSection = !item.isComplete ? scrollTargetByKey[item.key] : null;
    
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
          </div>

          <div className={`${styles.statusPill} ${styles[statusColor]}`}>
            {ui.label}
          </div>
          {hasUnsavedChanges && (
            <p className={styles.unsavedHint}>Unsaved changes</p>
          )}
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
